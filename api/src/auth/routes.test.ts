import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../server.ts'
import { makeContext, markSynced, seedToken } from '../test/helpers.ts'
import { createOAuthClient, getStoredToken } from './google.ts'
import type { AppContext } from '../context.ts'

function authContext() {
  const ctx = makeContext()
  ctx.oauthClient = createOAuthClient(ctx.config)
  return ctx
}

/** A second context sharing the first's DB — simulates an api restart. */
function restarted(ctx: AppContext): AppContext {
  return { ...ctx, oauthClient: createOAuthClient(ctx.config) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OAuth routes', () => {
  it('redirects to Google consent with a state param', async () => {
    const app = await buildApp(authContext(), { logger: false })
    const res = await app.inject({ method: 'GET', url: '/api/auth/login' })

    expect(res.statusCode).toBe(302)
    const location = res.headers.location as string
    expect(location).toContain('accounts.google.com')
    expect(location).toContain('state=')
    expect(location).toContain('youtube.force-ssl')
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

  it('accepts a callback whose state was issued before an api restart', async () => {
    const ctx = authContext()
    const app1 = await buildApp(ctx, { logger: false })
    const login = await app1.inject({ method: 'GET', url: '/api/auth/login' })
    const state = new URL(login.headers.location as string).searchParams.get(
      'state',
    )

    const ctx2 = restarted(ctx)
    ctx2.oauthClient.getToken = (async () => ({
      tokens: { refresh_token: 'rt-restart' },
    })) as unknown as typeof ctx2.oauthClient.getToken
    const app2 = await buildApp(ctx2, { logger: false })

    const cb = await app2.inject({
      method: 'GET',
      url: `/api/auth/callback?code=c&state=${state}`,
    })
    expect(cb.statusCode).toBe(302)
    expect(getStoredToken(ctx.db)?.refresh_token).toBe('rt-restart')
  })

  it('clears the playlist sync cache on a successful callback', async () => {
    const ctx = authContext()
    ctx.oauthClient.getToken = (async () => ({
      tokens: { refresh_token: 'rt' },
    })) as unknown as typeof ctx.oauthClient.getToken
    markSynced(ctx)
    const app = await buildApp(ctx, { logger: false })

    const login = await app.inject({ method: 'GET', url: '/api/auth/login' })
    const state = new URL(login.headers.location as string).searchParams.get(
      'state',
    )
    await app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=c&state=${state}`,
    })

    const row = ctx.db
      .prepare('SELECT * FROM sync_state WHERE playlist_id = ?')
      .get(ctx.config.playlistId)
    expect(row).toBeUndefined()
  })

  it('logout deletes the token, auth status, and sync cache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    )
    const ctx = authContext()
    seedToken(ctx)
    ctx.db
      .prepare('INSERT INTO auth_status (id, connected_at) VALUES (1, ?)')
      .run(Date.now())
    markSynced(ctx)
    const app = await buildApp(ctx, { logger: false })

    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' })

    expect(res.statusCode).toBe(204)
    expect(getStoredToken(ctx.db)).toBeUndefined()
    expect(
      ctx.db.prepare('SELECT * FROM auth_status WHERE id = 1').get(),
    ).toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('oauth2.googleapis.com/revoke'),
      expect.objectContaining({ method: 'POST' }),
    )
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
