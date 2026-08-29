import { describe, expect, it } from 'vitest'
import { buildApp } from '../server.ts'
import { countDecisions } from '../decisions.ts'
import { moveQueueStatus, nextPendingOp } from '../move-queue.ts'
import { makeContext, seedVideo } from '../test/helpers.ts'

async function app() {
  const ctx = makeContext()
  return { ctx, app: await buildApp(ctx, { logger: false }) }
}

describe('POST /api/decisions', () => {
  it('records a valid decision', async () => {
    const { ctx, app: a } = await app()
    const res = await a.inject({
      method: 'POST',
      url: '/api/decisions',
      payload: { videoId: 'abc', action: 'move' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    expect(countDecisions(ctx.db)).toBe(1)
  })

  it('rejects an unknown action', async () => {
    const { ctx, app: a } = await app()
    const res = await a.inject({
      method: 'POST',
      url: '/api/decisions',
      payload: { videoId: 'abc', action: 'delete' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_decision')
    expect(countDecisions(ctx.db)).toBe(0)
  })

  it('rejects a missing videoId', async () => {
    const { app: a } = await app()
    const res = await a.inject({
      method: 'POST',
      url: '/api/decisions',
      payload: { action: 'keep' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('move decisions and the move queue', () => {
  it('queues a move op when a cached video is moved', async () => {
    const { ctx, app: a } = await app()
    seedVideo(ctx, { id: 'v1', position: 0, playlistId: 'PL_TEST' })

    await a.inject({
      method: 'POST',
      url: '/api/decisions',
      payload: { videoId: 'v1', action: 'move' },
    })

    expect(nextPendingOp(ctx.db)).toMatchObject({
      videoId: 'v1',
      kind: 'move',
      targetPlaylistId: 'PL_DOWNSTREAM',
      removePlaylistId: 'PL_TEST',
    })
  })

  it('does not queue anything for keep or watch', async () => {
    const { ctx, app: a } = await app()
    seedVideo(ctx, { id: 'v1', position: 0 })

    for (const action of ['keep', 'watch']) {
      await a.inject({
        method: 'POST',
        url: '/api/decisions',
        payload: { videoId: 'v1', action },
      })
    }
    expect(moveQueueStatus(ctx.db)).toEqual({ pending: 0, failed: 0 })
  })

  it('queues a revert when a move decision is undone', async () => {
    const { ctx, app: a } = await app()
    seedVideo(ctx, { id: 'v1', position: 0, playlistId: 'PL_TEST' })

    await a.inject({
      method: 'POST',
      url: '/api/decisions',
      payload: { videoId: 'v1', action: 'move' },
    })
    await a.inject({ method: 'POST', url: '/api/decisions/undo' })

    expect(nextPendingOp(ctx.db)).toMatchObject({
      videoId: 'v1',
      kind: 'revert',
      targetPlaylistId: 'PL_TEST',
      removePlaylistId: 'PL_DOWNSTREAM',
    })
  })
})

describe('POST /api/decisions/undo', () => {
  it('removes and returns the latest decision', async () => {
    const { ctx, app: a } = await app()
    await a.inject({
      method: 'POST',
      url: '/api/decisions',
      payload: { videoId: 'v1', action: 'keep' },
    })
    await a.inject({
      method: 'POST',
      url: '/api/decisions',
      payload: { videoId: 'v2', action: 'watch' },
    })

    const res = await a.inject({ method: 'POST', url: '/api/decisions/undo' })

    expect(res.statusCode).toBe(200)
    expect(res.json().undone).toMatchObject({ videoId: 'v2', action: 'watch' })
    expect(countDecisions(ctx.db)).toBe(1)
  })

  it('returns { undone: null } when there is nothing to undo', async () => {
    const { app: a } = await app()
    const res = await a.inject({ method: 'POST', url: '/api/decisions/undo' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ undone: null })
  })
})
