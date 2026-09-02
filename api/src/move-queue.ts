import type { DB } from './db.ts'

export type MoveOpKind = 'move' | 'revert'
export type MoveOpState = 'pending' | 'done' | 'failed' | 'superseded'

export interface MoveOp {
  id: number
  videoId: string
  targetPlaylistId: string
  removePlaylistId: string
  kind: MoveOpKind
  state: MoveOpState
  attempts: number
  lastError: string | null
}

interface MoveOpRow {
  id: number
  video_id: string
  target_playlist_id: string
  remove_playlist_id: string
  kind: MoveOpKind
  state: MoveOpState
  attempts: number
  last_error: string | null
}

function toOp(row: MoveOpRow): MoveOp {
  return {
    id: row.id,
    videoId: row.video_id,
    targetPlaylistId: row.target_playlist_id,
    removePlaylistId: row.remove_playlist_id,
    kind: row.kind,
    state: row.state,
    attempts: row.attempts,
    lastError: row.last_error,
  }
}

function insertOp(
  db: DB,
  op: {
    videoId: string
    target: string
    remove: string
    kind: MoveOpKind
  },
): number {
  const now = Date.now()
  const info = db
    .prepare(
      `INSERT INTO move_queue
         (video_id, target_playlist_id, remove_playlist_id, kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(op.videoId, op.target, op.remove, op.kind, now, now)
  return Number(info.lastInsertRowid)
}

/**
 * Queues moving a video from its source playlist into the downstream playlist.
 * Returns null (nothing queued) if there is no downstream playlist or the video
 * isn't in the local cache.
 */
export function enqueueMove(
  db: DB,
  downstreamPlaylistId: string | null,
  videoId: string,
): number | null {
  if (!downstreamPlaylistId) return null

  const video = db
    .prepare('SELECT playlist_id FROM videos WHERE id = ?')
    .get(videoId) as { playlist_id: string } | undefined
  if (!video) return null

  return insertOp(db, {
    videoId,
    target: downstreamPlaylistId,
    remove: video.playlist_id,
    kind: 'move',
  })
}

/**
 * Queues undoing a prior move: put the video back where it came from and take it
 * out of the downstream playlist. Supersedes the original move if it hasn't run.
 * Returns null if there's no prior move for this video.
 */
export function enqueueRevert(db: DB, videoId: string): number | null {
  const prior = db
    .prepare(
      `SELECT * FROM move_queue
       WHERE video_id = ? AND kind = 'move'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(videoId) as MoveOpRow | undefined
  if (!prior) return null

  if (prior.state !== 'done') {
    db.prepare(
      "UPDATE move_queue SET state = 'superseded', updated_at = ? WHERE id = ?",
    ).run(Date.now(), prior.id)
  }

  return insertOp(db, {
    videoId,
    // swap: put it back where the move took it from, remove it from where the move put it
    target: prior.remove_playlist_id,
    remove: prior.target_playlist_id,
    kind: 'revert',
  })
}

export function nextPendingOp(db: DB): MoveOp | null {
  const row = db
    .prepare(
      "SELECT * FROM move_queue WHERE state = 'pending' ORDER BY id LIMIT 1",
    )
    .get() as MoveOpRow | undefined
  return row ? toOp(row) : null
}

export function markOpDone(db: DB, id: number): void {
  db.prepare(
    "UPDATE move_queue SET state = 'done', updated_at = ? WHERE id = ?",
  ).run(Date.now(), id)
}

/**
 * Records a failed attempt. After `maxAttempts` the op is parked in `failed`;
 * otherwise it stays `pending` for the next drain.
 */
export function bumpAttempt(
  db: DB,
  id: number,
  error: string,
  maxAttempts: number,
): void {
  const row = db
    .prepare('SELECT attempts FROM move_queue WHERE id = ?')
    .get(id) as { attempts: number } | undefined
  const attempts = (row?.attempts ?? 0) + 1
  const state = attempts >= maxAttempts ? 'failed' : 'pending'
  db.prepare(
    'UPDATE move_queue SET attempts = ?, last_error = ?, state = ?, updated_at = ? WHERE id = ?',
  ).run(attempts, error, state, Date.now(), id)
}

export function moveQueueStatus(db: DB): { pending: number; failed: number } {
  const row = db
    .prepare(
      `SELECT
         SUM(state = 'pending') AS pending,
         SUM(state = 'failed')  AS failed
       FROM move_queue`,
    )
    .get() as { pending: number | null; failed: number | null }
  return { pending: row.pending ?? 0, failed: row.failed ?? 0 }
}
