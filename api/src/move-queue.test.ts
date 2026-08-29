import { describe, expect, it } from 'vitest'
import {
  bumpAttempt,
  enqueueMove,
  enqueueRevert,
  moveQueueStatus,
  nextPendingOp,
} from './move-queue.ts'
import { makeContext, seedVideo } from './test/helpers.ts'

describe('enqueueMove', () => {
  it('queues a move from the video source playlist to the configured downstream', () => {
    const ctx = makeContext({ config: { downstreamPlaylistId: 'PL_REJECT' } })
    seedVideo(ctx, { id: 'v1', position: 0, playlistId: 'PL_SRC' })

    const id = enqueueMove(ctx.db, ctx.config, 'v1')
    expect(id).not.toBeNull()

    const op = nextPendingOp(ctx.db)
    expect(op).toMatchObject({
      videoId: 'v1',
      targetPlaylistId: 'PL_REJECT',
      removePlaylistId: 'PL_SRC',
      kind: 'move',
      state: 'pending',
    })
  })

  it('returns null when no downstream playlist is configured', () => {
    const ctx = makeContext({ config: { downstreamPlaylistId: null } })
    seedVideo(ctx, { id: 'v1', position: 0 })
    expect(enqueueMove(ctx.db, ctx.config, 'v1')).toBeNull()
  })

  it('returns null when the video is not in the cache', () => {
    const ctx = makeContext({ config: { downstreamPlaylistId: 'PL_REJECT' } })
    expect(enqueueMove(ctx.db, ctx.config, 'ghost')).toBeNull()
  })
})

describe('enqueueRevert', () => {
  it('swaps target/remove and supersedes a not-yet-run move', () => {
    const ctx = makeContext({ config: { downstreamPlaylistId: 'PL_REJECT' } })
    seedVideo(ctx, { id: 'v1', position: 0, playlistId: 'PL_SRC' })
    const moveId = enqueueMove(ctx.db, ctx.config, 'v1')

    const revertId = enqueueRevert(ctx.db, 'v1')
    expect(revertId).not.toBeNull()

    const move = ctx.db
      .prepare('SELECT state FROM move_queue WHERE id = ?')
      .get(moveId) as { state: string }
    expect(move.state).toBe('superseded')

    const op = nextPendingOp(ctx.db)
    expect(op).toMatchObject({
      videoId: 'v1',
      targetPlaylistId: 'PL_SRC',
      removePlaylistId: 'PL_REJECT',
      kind: 'revert',
    })
  })

  it('leaves an already-done move alone but still queues the revert', () => {
    const ctx = makeContext({ config: { downstreamPlaylistId: 'PL_REJECT' } })
    seedVideo(ctx, { id: 'v1', position: 0, playlistId: 'PL_SRC' })
    const moveId = enqueueMove(ctx.db, ctx.config, 'v1')
    ctx.db
      .prepare("UPDATE move_queue SET state = 'done' WHERE id = ?")
      .run(moveId)

    expect(enqueueRevert(ctx.db, 'v1')).not.toBeNull()
    const move = ctx.db
      .prepare('SELECT state FROM move_queue WHERE id = ?')
      .get(moveId) as { state: string }
    expect(move.state).toBe('done')
  })

  it('returns null when there is no prior move', () => {
    const ctx = makeContext()
    expect(enqueueRevert(ctx.db, 'v1')).toBeNull()
  })
})

describe('bumpAttempt / moveQueueStatus', () => {
  it('parks an op in failed after maxAttempts and counts queue state', () => {
    const ctx = makeContext({ config: { downstreamPlaylistId: 'PL_REJECT' } })
    seedVideo(ctx, { id: 'v1', position: 0 })
    const id = enqueueMove(ctx.db, ctx.config, 'v1')!

    bumpAttempt(ctx.db, id, 'err', 3)
    bumpAttempt(ctx.db, id, 'err', 3)
    expect(nextPendingOp(ctx.db)).not.toBeNull() // still pending after 2/3
    expect(moveQueueStatus(ctx.db)).toEqual({ pending: 1, failed: 0 })

    bumpAttempt(ctx.db, id, 'boom', 3)
    expect(nextPendingOp(ctx.db)).toBeNull()
    expect(moveQueueStatus(ctx.db)).toEqual({ pending: 0, failed: 1 })
  })
})
