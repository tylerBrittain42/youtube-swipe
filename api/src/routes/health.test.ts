import { describe, expect, it } from 'vitest'
import { buildApp } from '../server.ts'
import { makeContext, markSynced, seedDecision } from '../test/helpers.ts'

describe('GET /api/health', () => {
  it('reports unauthenticated with no sync when the DB is empty', async () => {
    const ctx = makeContext()
    const app = await buildApp(ctx, { logger: false })

    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      status: 'ok',
      authenticated: false,
      playlistId: 'PL_TEST',
      lastSyncedAt: null,
      decisionCount: 0,
    })
  })

  it('reports the decision count', async () => {
    const ctx = makeContext()
    seedDecision(ctx, 'v1', 'keep')
    seedDecision(ctx, 'v2', 'move')
    const app = await buildApp(ctx, { logger: false })

    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.json().decisionCount).toBe(2)
  })

  it('reports authenticated once a token is stored and a sync has run', async () => {
    const ctx = makeContext()
    ctx.db
      .prepare(
        `INSERT INTO oauth_token (id, refresh_token, updated_at) VALUES (1, 'rt', ?)`,
      )
      .run(Date.now())
    markSynced(ctx)
    const app = await buildApp(ctx, { logger: false })

    const res = await app.inject({ method: 'GET', url: '/api/health' })
    const body = res.json()

    expect(body.authenticated).toBe(true)
    expect(typeof body.lastSyncedAt).toBe('number')
  })
})
