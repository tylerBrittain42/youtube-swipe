import type { youtube_v3 } from 'googleapis'
import type { Config } from '../config.ts'
import type { AppContext } from '../context.ts'
import { openDb } from '../db.ts'
import type { OAuth2Client } from '../auth/google.ts'

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:8080/api/auth/callback',
    playlistId: 'PL_TEST',
    port: 0,
    databasePath: ':memory:',
    syncTtlMs: 10 * 60 * 1000,
    downstreamPlaylistId: 'PL_DOWNSTREAM',
    quotaLimit: 10000,
    consentScreenTesting: true,
    ...overrides,
  }
}

export interface FakeYoutubeSpec {
  playlistItemsPages?: youtube_v3.Schema$PlaylistItemListResponse[]
  /** video id -> ISO 8601 duration */
  durations?: Record<string, string>
  playlistsPages?: youtube_v3.Schema$PlaylistListResponse[]
  failOn?: 'playlistItems' | 'videos' | 'playlists'
}

export interface FakeYoutube {
  client: youtube_v3.Youtube
  calls: { playlistItems: number; videos: number; playlists: number }
}

export function fakeYoutube(spec: FakeYoutubeSpec = {}): FakeYoutube {
  const calls = { playlistItems: 0, videos: 0, playlists: 0 }

  const client = {
    playlistItems: {
      list: async () => {
        if (spec.failOn === 'playlistItems')
          throw new Error('playlistItems boom')
        const page = spec.playlistItemsPages?.[calls.playlistItems] ?? {
          items: [],
        }
        calls.playlistItems++
        return { data: page }
      },
    },
    videos: {
      list: async (params: { id?: string[] }) => {
        if (spec.failOn === 'videos') throw new Error('videos boom')
        calls.videos++
        const ids = params.id ?? []
        return {
          data: {
            items: ids.map((id) => ({
              id,
              contentDetails: { duration: spec.durations?.[id] ?? 'PT1M0S' },
            })),
          },
        }
      },
    },
    playlists: {
      list: async () => {
        if (spec.failOn === 'playlists') throw new Error('playlists boom')
        const page = spec.playlistsPages?.[calls.playlists] ?? { items: [] }
        calls.playlists++
        return { data: page }
      },
    },
  } as unknown as youtube_v3.Youtube

  return { client, calls }
}

export function makeContext(
  opts: { youtube?: youtube_v3.Youtube | null; config?: Partial<Config> } = {},
): AppContext {
  return {
    db: openDb(':memory:'),
    config: testConfig(opts.config),
    oauthClient: {} as OAuth2Client,
    getYoutube: () => opts.youtube ?? null,
  }
}

/** Builds a playlistItems API item without the ceremony. */
export function playlistItem(overrides: {
  videoId?: string
  id?: string
  position?: number
  title?: string
  channel?: string
  privacyStatus?: string
}): youtube_v3.Schema$PlaylistItem {
  return {
    id: overrides.id ?? `pli-${overrides.videoId}`,
    snippet: {
      title: overrides.title ?? `Video ${overrides.videoId}`,
      position: overrides.position ?? 0,
      videoOwnerChannelTitle: overrides.channel ?? 'Test Channel',
      resourceId: overrides.videoId
        ? { kind: 'youtube#video', videoId: overrides.videoId }
        : undefined,
      thumbnails: { medium: { url: `https://img/${overrides.videoId}.jpg` } },
    },
    status: overrides.privacyStatus
      ? { privacyStatus: overrides.privacyStatus }
      : undefined,
  }
}

export function seedVideo(
  ctx: AppContext,
  row: {
    id: string
    position: number
    title?: string
    playlistId?: string
  },
): void {
  ctx.db
    .prepare(
      `INSERT INTO videos (id, playlist_id, title, channel, duration, thumbnail_url, url, position, playlist_item_id, synced_at)
       VALUES (?, ?, ?, 'Ch', '1:00', 'https://img', ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.playlistId ?? ctx.config.playlistId,
      row.title ?? `Video ${row.id}`,
      `https://www.youtube.com/watch?v=${row.id}`,
      row.position,
      `pli-${row.id}`,
      Date.now(),
    )
}

export function seedDecision(
  ctx: AppContext,
  videoId: string,
  action: 'keep' | 'move' | 'watch' = 'keep',
): void {
  ctx.db
    .prepare(
      'INSERT INTO decisions (video_id, action, decided_at) VALUES (?, ?, ?)',
    )
    .run(videoId, action, Date.now())
}

export function seedToken(
  ctx: AppContext,
  scope = 'https://www.googleapis.com/auth/youtube.force-ssl',
): void {
  ctx.db
    .prepare(
      `INSERT INTO oauth_token (id, refresh_token, scope, updated_at)
       VALUES (1, 'rt', ?, ?)
       ON CONFLICT (id) DO UPDATE SET scope = excluded.scope`,
    )
    .run(scope, Date.now())
}

export function seedMoveOp(
  ctx: AppContext,
  row: {
    videoId: string
    target: string
    remove: string
    kind?: 'move' | 'revert'
    state?: 'pending' | 'done' | 'failed' | 'superseded'
    attempts?: number
  },
): number {
  const now = Date.now()
  const info = ctx.db
    .prepare(
      `INSERT INTO move_queue (video_id, target_playlist_id, remove_playlist_id, kind, state, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.videoId,
      row.target,
      row.remove,
      row.kind ?? 'move',
      row.state ?? 'pending',
      row.attempts ?? 0,
      now,
      now,
    )
  return Number(info.lastInsertRowid)
}

/**
 * A YouTube fake that models playlist membership in memory, so `playlistItems`
 * list/insert/delete behave like the real API for the mover.
 */
export function fakeYoutubePlaylists(initial: Record<string, string[]> = {}): {
  client: youtube_v3.Youtube
  playlists: Record<string, string[]>
  calls: { list: number; insert: number; delete: number }
  failNext: (op: 'list' | 'insert' | 'delete') => void
} {
  const playlists: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(initial)) playlists[k] = [...v]
  const calls = { list: 0, insert: 0, delete: 0 }
  const fail = { list: 0, insert: 0, delete: 0 }

  const itemId = (playlistId: string, videoId: string) =>
    `pli:${playlistId}:${videoId}`
  const parseItemId = (id: string) => {
    const [, playlistId, videoId] = id.split(':')
    return { playlistId, videoId }
  }

  const client = {
    playlistItems: {
      list: async (params: { playlistId?: string; videoId?: string }) => {
        calls.list++
        if (fail.list > 0) {
          fail.list--
          throw new Error('list boom')
        }
        const ids = playlists[params.playlistId ?? ''] ?? []
        const match = params.videoId
          ? ids.filter((v) => v === params.videoId)
          : ids
        return {
          data: {
            items: match.map((v) => ({
              id: itemId(params.playlistId ?? '', v),
              snippet: {
                resourceId: { kind: 'youtube#video', videoId: v },
              },
            })),
          },
        }
      },
      insert: async (params: {
        requestBody?: {
          snippet?: { playlistId?: string; resourceId?: { videoId?: string } }
        }
      }) => {
        calls.insert++
        if (fail.insert > 0) {
          fail.insert--
          throw new Error('insert boom')
        }
        const pid = params.requestBody?.snippet?.playlistId ?? ''
        const vid = params.requestBody?.snippet?.resourceId?.videoId ?? ''
        playlists[pid] = playlists[pid] ?? []
        playlists[pid].push(vid)
        return { data: { id: itemId(pid, vid) } }
      },
      delete: async (params: { id?: string }) => {
        calls.delete++
        if (fail.delete > 0) {
          fail.delete--
          // A concurrent delete of the same item is the realistic delete
          // failure — the mover should swallow it.
          const err = new Error('Playlist item not found') as Error & {
            code: number
          }
          err.code = 404
          throw err
        }
        const { playlistId, videoId } = parseItemId(params.id ?? '')
        const list = playlists[playlistId]
        if (!list) {
          const err = new Error('Playlist item not found') as Error & {
            code: number
          }
          err.code = 404
          throw err
        }
        const idx = list.indexOf(videoId)
        if (idx === -1) {
          const err = new Error('Playlist item not found') as Error & {
            code: number
          }
          err.code = 404
          throw err
        }
        list.splice(idx, 1)
        return { data: {} }
      },
    },
  } as unknown as youtube_v3.Youtube

  return {
    client,
    playlists,
    calls,
    failNext: (op) => {
      fail[op]++
    },
  }
}

export function markSynced(
  ctx: AppContext,
  playlistId = ctx.config.playlistId,
) {
  ctx.db
    .prepare(
      `INSERT INTO sync_state (playlist_id, last_synced_at, item_count) VALUES (?, ?, 0)
       ON CONFLICT (playlist_id) DO UPDATE SET last_synced_at = excluded.last_synced_at`,
    )
    .run(playlistId, Date.now())
}
