import type { youtube_v3 } from 'googleapis'
import { describe, expect, it } from 'vitest'
import { ensureSynced, getSyncState, syncPlaylist } from './sync.ts'
import {
  getAuthStatus,
  markGrantInvalid,
  NotAuthenticatedError,
} from '../auth/google.ts'
import {
  fakeYoutube,
  makeContext,
  playlistItem,
  type FakeYoutubeSpec,
} from '../test/helpers.ts'

function contextWith(spec: FakeYoutubeSpec) {
  const yt = fakeYoutube(spec)
  const ctx = makeContext({ youtube: yt.client })
  return { ctx, yt }
}

interface Row {
  id: string
  title: string
  channel: string
  duration: string
  url: string
  position: number
}

function videoRows(ctx: ReturnType<typeof makeContext>): Row[] {
  return ctx.db
    .prepare(
      'SELECT id, title, channel, duration, url, position FROM videos ORDER BY position',
    )
    .all() as Row[]
}

describe('syncPlaylist', () => {
  it('throws NotAuthenticatedError when there is no YouTube client', async () => {
    const ctx = makeContext({ youtube: null })
    await expect(syncPlaylist(ctx, 'PL_TEST')).rejects.toBeInstanceOf(
      NotAuthenticatedError,
    )
  })

  it('flags the grant invalid and throws NotAuthenticatedError on a 401', async () => {
    const yt = {
      playlistItems: {
        list: async () => {
          throw Object.assign(new Error('invalid_grant'), { code: 401 })
        },
      },
    } as unknown as youtube_v3.Youtube
    const ctx = makeContext({ youtube: yt })

    await expect(syncPlaylist(ctx, 'PL_TEST')).rejects.toBeInstanceOf(
      NotAuthenticatedError,
    )
    expect(getAuthStatus(ctx.db)?.invalidSince).toBeTypeOf('number')
  })

  it('short-circuits without calling YouTube while the grant is flagged', async () => {
    const { ctx, yt } = contextWith({
      playlistItemsPages: [{ items: [] }],
    })
    markGrantInvalid(ctx.db, 'stale')

    await expect(syncPlaylist(ctx, 'PL_TEST')).rejects.toBeInstanceOf(
      NotAuthenticatedError,
    )
    expect(yt.calls.playlistItems).toBe(0)
  })

  it('marks the grant valid after a successful sync', async () => {
    const { ctx } = contextWith({
      playlistItemsPages: [
        { items: [playlistItem({ videoId: 'a', position: 0 })] },
      ],
    })

    await syncPlaylist(ctx, 'PL_TEST')
    expect(getAuthStatus(ctx.db)?.invalidSince).toBeNull()
  })

  it('caches playlist items with durations and canonical URLs', async () => {
    const { ctx } = contextWith({
      playlistItemsPages: [
        {
          items: [
            playlistItem({ videoId: 'a', position: 0, channel: 'Chan A' }),
            playlistItem({ videoId: 'b', position: 1 }),
          ],
        },
      ],
      durations: { a: 'PT14M22S', b: 'PT1H1M1S' },
    })

    await syncPlaylist(ctx, 'PL_TEST')

    expect(videoRows(ctx)).toEqual([
      {
        id: 'a',
        title: 'Video a',
        channel: 'Chan A',
        duration: '14:22',
        url: 'https://www.youtube.com/watch?v=a',
        position: 0,
      },
      {
        id: 'b',
        title: 'Video b',
        channel: 'Test Channel',
        duration: '1:01:01',
        url: 'https://www.youtube.com/watch?v=b',
        position: 1,
      },
    ])
    expect(getSyncState(ctx, 'PL_TEST')?.item_count).toBe(2)
  })

  it('skips private, deleted, and video-less items', async () => {
    const { ctx } = contextWith({
      playlistItemsPages: [
        {
          items: [
            playlistItem({ videoId: 'keep', position: 0 }),
            playlistItem({
              videoId: 'priv',
              position: 1,
              privacyStatus: 'private',
            }),
            playlistItem({
              videoId: 'del',
              position: 2,
              title: 'Deleted video',
            }),
            playlistItem({ videoId: undefined, position: 3 }),
          ],
        },
      ],
    })

    await syncPlaylist(ctx, 'PL_TEST')

    expect(videoRows(ctx).map((r) => r.id)).toEqual(['keep'])
  })

  it('paginates playlistItems and batches video lookups', async () => {
    const first = Array.from({ length: 50 }, (_, i) =>
      playlistItem({ videoId: `v${i}`, position: i }),
    )
    const second = [playlistItem({ videoId: 'v50', position: 50 })]
    const { ctx, yt } = contextWith({
      playlistItemsPages: [
        { items: first, nextPageToken: 'page2' },
        { items: second },
      ],
    })

    await syncPlaylist(ctx, 'PL_TEST')

    expect(videoRows(ctx)).toHaveLength(51)
    expect(yt.calls.playlistItems).toBe(2)
    expect(yt.calls.videos).toBe(2) // 50 + 1, batched by 50
  })

  it('prunes videos that have left the playlist', async () => {
    const { ctx, yt } = contextWith({
      playlistItemsPages: [
        {
          items: [
            playlistItem({ videoId: 'a', position: 0 }),
            playlistItem({ videoId: 'b', position: 1 }),
            playlistItem({ videoId: 'c', position: 2 }),
          ],
        },
        { items: [playlistItem({ videoId: 'a', position: 0 })] },
      ],
    })

    await syncPlaylist(ctx, 'PL_TEST')
    expect(videoRows(ctx).map((r) => r.id)).toEqual(['a', 'b', 'c'])

    yt.calls.playlistItems = 1 // advance the fake to its second page
    await syncPlaylist(ctx, 'PL_TEST')
    expect(videoRows(ctx).map((r) => r.id)).toEqual(['a'])
  })
})

describe('ensureSynced', () => {
  it('syncs when the cache is cold and skips when it is fresh', async () => {
    const { ctx, yt } = contextWith({
      playlistItemsPages: [
        { items: [playlistItem({ videoId: 'a', position: 0 })] },
        { items: [playlistItem({ videoId: 'a', position: 0 })] },
      ],
    })

    await ensureSynced(ctx, 'PL_TEST')
    expect(yt.calls.playlistItems).toBe(1)

    await ensureSynced(ctx, 'PL_TEST')
    expect(yt.calls.playlistItems).toBe(1) // still fresh, no second call
  })

  it('re-syncs once the TTL has elapsed', async () => {
    const { ctx, yt } = contextWith({
      playlistItemsPages: [
        { items: [playlistItem({ videoId: 'a', position: 0 })] },
        { items: [playlistItem({ videoId: 'a', position: 0 })] },
      ],
    })
    ctx.config.syncTtlMs = 0

    await ensureSynced(ctx, 'PL_TEST')
    await ensureSynced(ctx, 'PL_TEST')
    expect(yt.calls.playlistItems).toBe(2)
  })

  it('coalesces concurrent syncs into one', async () => {
    const { ctx, yt } = contextWith({
      playlistItemsPages: [
        { items: [playlistItem({ videoId: 'a', position: 0 })] },
        { items: [playlistItem({ videoId: 'a', position: 0 })] },
      ],
    })

    await Promise.all([
      ensureSynced(ctx, 'PL_TEST'),
      ensureSynced(ctx, 'PL_TEST'),
    ])
    expect(yt.calls.playlistItems).toBe(1)
  })
})
