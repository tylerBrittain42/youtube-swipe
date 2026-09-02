import { describe, expect, it } from 'vitest'
import { buildApp } from '../server.ts'
import { markGrantInvalid } from '../auth/google.ts'
import {
  makeContext,
  markSynced,
  seedDecision,
  seedToken,
} from '../test/helpers.ts'

async function health(ctx: ReturnType<typeof makeContext>) {
  const app = await buildApp(ctx, { logger: false })
  const res = await app.inject({ method: 'GET', url: '/api/health' })
  return res.json()
}

describe('GET /api/health', () => {
  it('reports unauthenticated with no sync when the DB is empty', async () => {
    const ctx = makeContext()
    const app = await buildApp(ctx, { logger: false })

    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      status: 'ok',
      authenticated: false,
      writeEnabled: false,
      auth: { state: 'logged_out', tokenAgeDays: null },
      consentScreenTesting: true,
      playlistId: 'PL_TEST',
      downstreamPlaylistId: 'PL_DOWNSTREAM',
      lastSyncedAt: null,
      decisionCount: 0,
      moveQueue: { pending: 0, failed: 0 },
      quota: { usedToday: 0, limit: 10000 },
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

  it('reports writeEnabled from the stored scope', async () => {
    const ro = makeContext()
    seedToken(ro, 'https://www.googleapis.com/auth/youtube.readonly')
    const roRes = await (
      await buildApp(ro, { logger: false })
    ).inject({ method: 'GET', url: '/api/health' })
    expect(roRes.json().writeEnabled).toBe(false)

    const rw = makeContext()
    seedToken(rw) // defaults to youtube.force-ssl
    const rwRes = await (
      await buildApp(rw, { logger: false })
    ).inject({ method: 'GET', url: '/api/health' })
    expect(rwRes.json().writeEnabled).toBe(true)
  })

  it('reports auth.state logged_out when no token is stored', async () => {
    const body = await health(makeContext())
    expect(body.auth).toEqual({ state: 'logged_out', tokenAgeDays: null })
  })

  it('reports needs_reauth / grant_invalid when the grant is flagged dead', async () => {
    const ctx = makeContext()
    seedToken(ctx)
    markGrantInvalid(ctx.db, 'invalid_grant')

    const body = await health(ctx)
    expect(body.auth.state).toBe('needs_reauth')
    expect(body.auth.reason).toBe('grant_invalid')
  })

  it('reports needs_reauth / missing_write_scope for a read-only grant with a downstream playlist', async () => {
    const ctx = makeContext()
    seedToken(ctx, 'https://www.googleapis.com/auth/youtube.readonly')

    const body = await health(ctx)
    expect(body.auth).toMatchObject({
      state: 'needs_reauth',
      reason: 'missing_write_scope',
    })
  })

  it('reports connected and a tokenAgeDays once a grant is stored', async () => {
    const ctx = makeContext()
    seedToken(ctx)
    ctx.db
      .prepare('INSERT INTO auth_status (id, connected_at) VALUES (1, ?)')
      .run(Date.now() - 3 * 24 * 60 * 60 * 1000)

    const body = await health(ctx)
    expect(body.auth.state).toBe('connected')
    expect(body.auth.tokenAgeDays).toBe(3)
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
