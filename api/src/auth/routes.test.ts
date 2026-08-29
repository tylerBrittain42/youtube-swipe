import { describe, expect, it } from 'vitest'
import { buildApp } from '../server.ts'
import { makeContext } from '../test/helpers.ts'
import { createOAuthClient, getStoredToken } from './google.ts'

function authContext() {
  const ctx = makeContext()
  ctx.oauthClient = createOAuthClient(ctx.config)
  return ctx
}

describe('OAuth routes', () => {
  it('redirects to Google consent with a state param', async () => {
    const app = await buildApp(authContext(), { logger: false })
    const res = await app.inject({ method: 'GET', url: '/api/auth/login' })

    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    expect(location).toContain('accounts.google.com')
    expect(location).toContain('state=')
    expect(location).toContain('youtube.readonly')
  })

  it('rejects a callback with an unknown state', async () => {
    const app = await buildApp(authContext(), { logger: false })
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/callback?code=abc&state=never-issued',
    })
    expect(res.statusCode).toBe(400)
  })

  it('exchanges the code and stores the token on a valid callback', async () => {
    const ctx = authContext()
    ctx.oauthClient.getToken = (async () => ({
      tokens: { refresh_token: 'rt-1', access_token: 'at-1', scope: 's' },
    })) as unknown as typeof ctx.oauthClient.getToken

    const app = await buildApp(ctx, { logger: false })

    const login = await app.inject({ method: 'GET', url: '/api/auth/login' })
    const state = new URL(login.headers.location as string).searchParams.get(
      'state',
    )

    const cb = await app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=the-code&state=${state}`,
    })

    expect(cb.statusCode).toBe(302)
    expect(cb.headers.location).toBe('/')
    expect(getStoredToken(ctx.db)?.refresh_token).toBe('rt-1')
  })

  it('does not reuse a consumed state', async () => {
    const ctx = authContext()
    ctx.oauthClient.getToken = (async () => ({
      tokens: { refresh_token: 'rt-2' },
    })) as unknown as typeof ctx.oauthClient.getToken
    const app = await buildApp(ctx, { logger: false })

    const login = await app.inject({ method: 'GET', url: '/api/auth/login' })
    const state = new URL(login.headers.location as string).searchParams.get(
      'state',
    )
    const url = `/api/auth/callback?code=c&state=${state}`

    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(302)
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(400)
  })
})
