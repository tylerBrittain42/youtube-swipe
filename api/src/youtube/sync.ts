import type { youtube_v3 } from 'googleapis'
import type { AppContext } from '../context.ts'
import { NotAuthenticatedError } from '../auth/google.ts'
import { formatDuration } from '../lib/duration.ts'
import { spendQuota } from './quota.ts'

/** Records one billed API call. */
type Spend = () => void

const SKIP_TITLES = new Set([
  'Private video',
  'Deleted video',
  '[Private video]',
  '[Deleted video]',
])

interface StagedItem {
  videoId: string
  playlistItemId: string
  position: number
  title: string
  channel: string
  thumbnailUrl: string
}

/** Pages through every item in the playlist. */
async function listPlaylistItems(
  yt: youtube_v3.Youtube,
  playlistId: string,
  spend: Spend,
): Promise<StagedItem[]> {
  const items: StagedItem[] = []
  let pageToken: string | undefined

  do {
    const { data } = await yt.playlistItems.list({
      part: ['snippet', 'contentDetails', 'status'],
      playlistId,
      maxResults: 50,
      pageToken,
    })
    spend()

    for (const item of data.items ?? []) {
      const snippet = item.snippet
      const videoId = snippet?.resourceId?.videoId
      if (!videoId) continue
      if (snippet?.title && SKIP_TITLES.has(snippet.title)) continue
      if (item.status?.privacyStatus === 'private') continue

      const thumbs = snippet?.thumbnails
      items.push({
        videoId,
        playlistItemId: item.id ?? '',
        position: snippet?.position ?? items.length,
        title: snippet?.title ?? '(untitled)',
        channel: snippet?.videoOwnerChannelTitle ?? snippet?.channelTitle ?? '',
        thumbnailUrl:
          thumbs?.medium?.url ??
          thumbs?.high?.url ??
          thumbs?.default?.url ??
          '',
      })
    }

    pageToken = data.nextPageToken ?? undefined
  } while (pageToken)

  return items
}

/** Looks up ISO 8601 durations for up to 50 video IDs per request. */
async function fetchDurations(
  yt: youtube_v3.Youtube,
  videoIds: string[],
  spend: Spend,
): Promise<Map<string, string>> {
  const durations = new Map<string, string>()

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50)
    const { data } = await yt.videos.list({
      part: ['contentDetails'],
      id: batch,
    })
    spend()
    for (const video of data.items ?? []) {
      if (video.id) {
        durations.set(video.id, formatDuration(video.contentDetails?.duration))
      }
    }
  }

  return durations
}

/**
 * Pulls the playlist's current contents from YouTube into the local `videos`
 * cache: upserts what's there now, prunes what's gone, records the sync time.
 */
export async function syncPlaylist(
  ctx: AppContext,
  playlistId: string,
): Promise<void> {
  const yt = ctx.getYoutube()
  if (!yt) throw new NotAuthenticatedError()

  const spend: Spend = () => spendQuota(ctx.db, 1)
  const staged = await listPlaylistItems(yt, playlistId, spend)
  const durations = await fetchDurations(
    yt,
    staged.map((s) => s.videoId),
    spend,
  )
  const now = Date.now()

  const upsert = ctx.db.prepare(
    `INSERT INTO videos (id, playlist_id, title, channel, duration, thumbnail_url, url, position, playlist_item_id, synced_at)
     VALUES (@id, @playlist_id, @title, @channel, @duration, @thumbnail_url, @url, @position, @playlist_item_id, @synced_at)
     ON CONFLICT (id) DO UPDATE SET
       playlist_id = excluded.playlist_id,
       title = excluded.title,
       channel = excluded.channel,
       duration = excluded.duration,
       thumbnail_url = excluded.thumbnail_url,
       url = excluded.url,
       position = excluded.position,
       playlist_item_id = excluded.playlist_item_id,
       synced_at = excluded.synced_at`,
  )

  const writeAll = ctx.db.transaction((rows: StagedItem[]) => {
    for (const row of rows) {
      upsert.run({
        id: row.videoId,
        playlist_id: playlistId,
        title: row.title,
        channel: row.channel,
        duration: durations.get(row.videoId) ?? '0:00',
        thumbnail_url: row.thumbnailUrl,
        url: `https://www.youtube.com/watch?v=${row.videoId}`,
        position: row.position,
        playlist_item_id: row.playlistItemId,
        synced_at: now,
      })
    }

    const keepIds = rows.map((r) => r.videoId)
    const placeholders = keepIds.map(() => '?').join(', ')
    ctx.db
      .prepare(
        `DELETE FROM videos WHERE playlist_id = ?${
          keepIds.length ? ` AND id NOT IN (${placeholders})` : ''
        }`,
      )
      .run(playlistId, ...keepIds)

    ctx.db
      .prepare(
        `INSERT INTO sync_state (playlist_id, last_synced_at, item_count)
         VALUES (?, ?, ?)
         ON CONFLICT (playlist_id) DO UPDATE SET
           last_synced_at = excluded.last_synced_at,
           item_count = excluded.item_count`,
      )
      .run(playlistId, now, rows.length)
  })

  writeAll(staged)
}

interface SyncStateRow {
  last_synced_at: number
  item_count: number
}

export function getSyncState(
  ctx: AppContext,
  playlistId: string,
): SyncStateRow | undefined {
  return ctx.db
    .prepare(
      'SELECT last_synced_at, item_count FROM sync_state WHERE playlist_id = ?',
    )
    .get(playlistId) as SyncStateRow | undefined
}

const inFlight = new Map<string, Promise<void>>()

/**
 * Syncs the playlist only if it has never been synced or the cache is older
 * than the configured TTL. Concurrent callers share one sync.
 */
export async function ensureSynced(
  ctx: AppContext,
  playlistId: string,
): Promise<void> {
  const state = getSyncState(ctx, playlistId)
  if (state && Date.now() - state.last_synced_at < ctx.config.syncTtlMs) {
    return
  }

  const existing = inFlight.get(playlistId)
  if (existing) return existing

  const run = syncPlaylist(ctx, playlistId).finally(() => {
    inFlight.delete(playlistId)
  })
  inFlight.set(playlistId, run)
  return run
}
