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
