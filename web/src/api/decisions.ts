import type { Decision } from '../types'

/**
 * `POST /api/decisions` (see docs/implementation-plan.md §2). M3: the decision
 * is persisted locally by the backend; the write path to YouTube is M4.
 */
export async function postDecision(
  videoId: string,
  action: Decision,
): Promise<void> {
  const res = await fetch('/api/decisions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ videoId, action }),
  })
  if (!res.ok) {
    throw new Error(`POST /api/decisions failed: ${res.status}`)
  }
}

/** `POST /api/decisions/undo` — reverses the most recent decision. */
export async function undoDecision(): Promise<void> {
  const res = await fetch('/api/decisions/undo', { method: 'POST' })
  if (!res.ok) {
    throw new Error(`POST /api/decisions/undo failed: ${res.status}`)
  }
}
