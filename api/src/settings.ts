import type { DB } from './db.ts'
import type { Config } from './config.ts'

export type SortOrder = 'oldest' | 'newest'

export interface Settings {
  /** Playlist being triaged. */
  sourcePlaylistId: string
  /** Where a left-swipe ("move") relocates videos, or null for local-only. */
  downstreamPlaylistId: string | null
  /** Deck order: playlist position ascending ('oldest') or descending ('newest'). */
  sortOrder: SortOrder
}

export function isSortOrder(v: unknown): v is SortOrder {
  return v === 'oldest' || v === 'newest'
}

interface SettingsRow {
  source_playlist_id: string | null
  downstream_playlist_id: string | null
  sort_order: SortOrder
}

/**
 * The single settings row. Seeded from env (`config`) on first access — after
 * that the row is authoritative and env is ignored.
 */
export function getSettings(db: DB, config: Config): Settings {
  const row = db
    .prepare(
      'SELECT source_playlist_id, downstream_playlist_id, sort_order FROM settings WHERE id = 1',
    )
    .get() as SettingsRow | undefined

  if (!row) {
    db.prepare(
      `INSERT INTO settings (id, source_playlist_id, downstream_playlist_id, sort_order, updated_at)
       VALUES (1, @source, @downstream, 'oldest', @now)`,
    ).run({
      source: config.playlistId,
      downstream: config.downstreamPlaylistId,
      now: Date.now(),
    })
    return {
      sourcePlaylistId: config.playlistId,
      downstreamPlaylistId: config.downstreamPlaylistId,
      sortOrder: 'oldest',
    }
  }

  return {
    sourcePlaylistId: row.source_playlist_id ?? config.playlistId,
    downstreamPlaylistId: row.downstream_playlist_id,
    sortOrder: row.sort_order,
  }
}

/** Merges a partial update into the settings row and returns the result. */
export function putSettings(
  db: DB,
  config: Config,
  patch: Partial<Settings>,
): Settings {
  const current = getSettings(db, config)
  const next: Settings = {
    sourcePlaylistId: patch.sourcePlaylistId ?? current.sourcePlaylistId,
    downstreamPlaylistId:
      patch.downstreamPlaylistId === undefined
        ? current.downstreamPlaylistId
        : patch.downstreamPlaylistId,
    sortOrder: patch.sortOrder ?? current.sortOrder,
  }

  db.prepare(
    `UPDATE settings SET
       source_playlist_id = @source,
       downstream_playlist_id = @downstream,
       sort_order = @sortOrder,
       updated_at = @now
     WHERE id = 1`,
  ).run({
    source: next.sourcePlaylistId,
    downstream: next.downstreamPlaylistId,
    sortOrder: next.sortOrder,
    now: Date.now(),
  })

  return next
}
