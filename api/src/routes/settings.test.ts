import { describe, expect, it } from 'vitest'
import { buildApp } from '../server.ts'
import { makeContext, markSynced } from '../test/helpers.ts'

async function app(ctx: ReturnType<typeof makeContext>) {
  return buildApp(ctx, { logger: false })
}

describe('GET /api/settings', () => {
  it('returns the env-seeded values on first read', async () => {
    const ctx = makeContext({
      config: { playlistId: 'PL_SRC', downstreamPlaylistId: 'PL_DOWN' },
    })
    const res = await (
      await app(ctx)
    ).inject({ method: 'GET', url: '/api/settings' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      sourcePlaylistId: 'PL_SRC',
      downstreamPlaylistId: 'PL_DOWN',
      sortOrder: 'oldest',
    })
  })
})

describe('PUT /api/settings', () => {
  it('merges and echoes the update', async () => {
    const ctx = makeContext()
    const res = await (
      await app(ctx)
    ).inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sortOrder: 'newest', downstreamPlaylistId: null },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      sortOrder: 'newest',
      downstreamPlaylistId: null,
    })
  })

  it('forces a re-sync of the newly-picked source by dropping its stale cache', async () => {
    const ctx = makeContext({ config: { playlistId: 'PL_OLD' } })
    // PL_NEW was triaged before and still has a cached sync row.
    markSynced(ctx, 'PL_NEW')

    await (
      await app(ctx)
    ).inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sourcePlaylistId: 'PL_NEW' },
    })

    expect(
      ctx.db
        .prepare('SELECT 1 FROM sync_state WHERE playlist_id = ?')
        .get('PL_NEW'),
    ).toBeUndefined()
  })

  it('leaves the sync cache alone when only the sort order changes', async () => {
    const ctx = makeContext({ config: { playlistId: 'PL_SRC' } })
    markSynced(ctx, 'PL_SRC')

    await (
      await app(ctx)
    ).inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sortOrder: 'newest' },
    })

    expect(
      ctx.db
        .prepare('SELECT 1 FROM sync_state WHERE playlist_id = ?')
        .get('PL_SRC'),
    ).toBeDefined()
  })

  it('rejects a bad sortOrder', async () => {
    const ctx = makeContext()
    const res = await (
      await app(ctx)
    ).inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sortOrder: 'sideways' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_settings')
  })

  it('rejects an empty sourcePlaylistId', async () => {
    const ctx = makeContext()
    const res = await (
      await app(ctx)
    ).inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { sourcePlaylistId: '' },
    })
    expect(res.statusCode).toBe(400)
  })
})
