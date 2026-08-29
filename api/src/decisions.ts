import type { DB } from './db.ts'

export type DecisionAction = 'keep' | 'move' | 'watch'

export const DECISION_ACTIONS: DecisionAction[] = ['keep', 'move', 'watch']

export function isDecisionAction(value: unknown): value is DecisionAction {
  return (
    typeof value === 'string' && (DECISION_ACTIONS as string[]).includes(value)
  )
}

export interface DecisionRecord {
  videoId: string
  action: DecisionAction
  decidedAt: number
}

interface DecisionRow {
  id: number
  video_id: string
  action: DecisionAction
  decided_at: number
}

function toRecord(row: DecisionRow): DecisionRecord {
  return {
    videoId: row.video_id,
    action: row.action,
    decidedAt: row.decided_at,
  }
}

/** Appends a decision to the log. */
export function recordDecision(
  db: DB,
  videoId: string,
  action: DecisionAction,
): DecisionRecord {
  const decidedAt = Date.now()
  db.prepare(
    'INSERT INTO decisions (video_id, action, decided_at) VALUES (?, ?, ?)',
  ).run(videoId, action, decidedAt)
  return { videoId, action, decidedAt }
}

/**
 * Removes the most recent decision and returns it, or null if there are none.
 * Uses the autoincrement id so "most recent" is stable even after other undos.
 */
export function undoLastDecision(db: DB): DecisionRecord | null {
  const row = db
    .prepare('SELECT * FROM decisions ORDER BY id DESC LIMIT 1')
    .get() as DecisionRow | undefined
  if (!row) return null
  db.prepare('DELETE FROM decisions WHERE id = ?').run(row.id)
  return toRecord(row)
}

export function countDecisions(db: DB): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM decisions').get() as {
    n: number
  }
  return row.n
}
