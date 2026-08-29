import { describe, expect, it } from 'vitest'
import { processNextOp, MAX_ATTEMPTS } from './mover.ts'
import { moveQueueStatus, nextPendingOp } from '../move-queue.ts'
import { quotaUsedToday } from './quota.ts'
import {
  fakeYoutubePlaylists,
  makeContext,
  seedMoveOp,
  seedToken,
} from '../test/helpers.ts'

function setup(playlists: Record<string, string[]>, configOverrides = {}) {
  const yt = fakeYoutubePlaylists(playlists)
  const ctx = makeContext({ youtube: yt.client, config: configOverrides })
  seedToken(ctx)
  return { ctx, yt }
}

describe('processNextOp', () => {
  it('inserts into the target then deletes from the source, then marks done', async () => {
    const { ctx, yt } = setup({ SRC: ['v1', 'v2'], DEST: [] })
    const id = seedMoveOp(ctx, { videoId: 'v1', target: 'DEST', remove: 'SRC' })

    expect(await processNextOp(ctx)).toBe('done')

    expect(yt.playlists.DEST).toEqual(['v1'])
    expect(yt.playlists.SRC).toEqual(['v2'])
    expect(yt.calls.insert).toBe(1)
    expect(yt.calls.delete).toBe(1)
    expect(quotaUsedToday(ctx.db)).toBe(1 + 50 + 1 + 50)

    const row = ctx.db
      .prepare('SELECT state FROM move_queue WHERE id = ?')
      .get(id) as { state: string }
    expect(row.state).toBe('done')
  })

  it('does not insert when the video is already in the target (idempotent resume)', async () => {
    const { ctx, yt } = setup({ SRC: ['v1'], DEST: ['v1'] })
    seedMoveOp(ctx, { videoId: 'v1', target: 'DEST', remove: 'SRC' })

    expect(await processNextOp(ctx)).toBe('done')

    expect(yt.calls.insert).toBe(0)
    expect(yt.playlists.DEST).toEqual(['v1'])
    expect(yt.playlists.SRC).toEqual([])
  })

  it('does not delete when the video is already gone from the remove playlist', async () => {
    const { ctx, yt } = setup({ SRC: [], DEST: [] })
    seedMoveOp(ctx, { videoId: 'v1', target: 'DEST', remove: 'SRC' })

    expect(await processNextOp(ctx)).toBe('done')

    expect(yt.calls.insert).toBe(1)
    expect(yt.calls.delete).toBe(0)
    expect(yt.playlists.DEST).toEqual(['v1'])
  })

  it('removes every copy from the source playlist', async () => {
    const { ctx, yt } = setup({ SRC: ['v1', 'v1'], DEST: [] })
    seedMoveOp(ctx, { videoId: 'v1', target: 'DEST', remove: 'SRC' })

    expect(await processNextOp(ctx)).toBe('done')
    expect(yt.playlists.SRC).toEqual([])
    expect(yt.calls.delete).toBe(2)
  })

  it('reconciles a revert back to the source', async () => {
    const { ctx, yt } = setup({ SRC: [], DEST: ['v1'] })
    seedMoveOp(ctx, {
      videoId: 'v1',
      target: 'SRC',
      remove: 'DEST',
      kind: 'revert',
    })

    expect(await processNextOp(ctx)).toBe('done')
    expect(yt.playlists.SRC).toEqual(['v1'])
    expect(yt.playlists.DEST).toEqual([])
  })

  it('returns idle when there is nothing queued', async () => {
    const { ctx } = setup({ SRC: [], DEST: [] })
    expect(await processNextOp(ctx)).toBe('idle')
  })

  it('returns unauthed when the stored grant lacks the write scope', async () => {
    const yt = fakeYoutubePlaylists({ SRC: ['v1'], DEST: [] })
    const ctx = makeContext({ youtube: yt.client })
    seedToken(ctx, 'https://www.googleapis.com/auth/youtube.readonly')
    seedMoveOp(ctx, { videoId: 'v1', target: 'DEST', remove: 'SRC' })

    expect(await processNextOp(ctx)).toBe('unauthed')
    expect(yt.calls.insert).toBe(0)
  })

  it('returns quota when the remaining budget is below one op', async () => {
    const { ctx } = setup({ SRC: ['v1'], DEST: [] }, { quotaLimit: 50 })
    seedMoveOp(ctx, { videoId: 'v1', target: 'DEST', remove: 'SRC' })
    expect(await processNextOp(ctx)).toBe('quota')
    expect(nextPendingOp(ctx.db)).not.toBeNull()
  })

  it('bumps attempts on a transient failure and parks in failed after MAX_ATTEMPTS', async () => {
    const { ctx, yt } = setup({ SRC: ['v1'], DEST: [] })
    const id = seedMoveOp(ctx, { videoId: 'v1', target: 'DEST', remove: 'SRC' })

    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      yt.failNext('insert')
      expect(await processNextOp(ctx)).toBe('retry')
    }
    const mid = ctx.db
      .prepare('SELECT attempts, state FROM move_queue WHERE id = ?')
      .get(id) as { attempts: number; state: string }
    expect(mid).toMatchObject({ attempts: MAX_ATTEMPTS - 1, state: 'pending' })

    yt.failNext('insert')
    expect(await processNextOp(ctx)).toBe('retry')
    expect(moveQueueStatus(ctx.db)).toEqual({ pending: 0, failed: 1 })
  })

  it('treats a 404 on delete as success', async () => {
    const { ctx, yt } = setup({ SRC: ['v1'], DEST: [] })
    seedMoveOp(ctx, { videoId: 'v1', target: 'DEST', remove: 'SRC' })
    yt.failNext('delete') // fake throws a 404-coded error on the first delete

    expect(await processNextOp(ctx)).toBe('done')
  })
})
