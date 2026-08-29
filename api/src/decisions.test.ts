import { describe, expect, it } from 'vitest'
import { openDb } from './db.ts'
import {
  countDecisions,
  recordDecision,
  undoLastDecision,
} from './decisions.ts'

function db() {
  return openDb(':memory:')
}

describe('decisions', () => {
  it('records a decision and counts it', () => {
    const d = db()
    const rec = recordDecision(d, 'v1', 'keep')

    expect(rec).toMatchObject({ videoId: 'v1', action: 'keep' })
    expect(typeof rec.decidedAt).toBe('number')
    expect(countDecisions(d)).toBe(1)
  })

  it('undoes the most recent decision (LIFO) across mixed actions', () => {
    const d = db()
    recordDecision(d, 'v1', 'keep')
    recordDecision(d, 'v2', 'move')
    recordDecision(d, 'v3', 'watch')

    expect(undoLastDecision(d)).toMatchObject({
      videoId: 'v3',
      action: 'watch',
    })
    expect(undoLastDecision(d)).toMatchObject({ videoId: 'v2', action: 'move' })
    expect(countDecisions(d)).toBe(1)
  })

  it('returns null when there is nothing to undo', () => {
    const d = db()
    expect(undoLastDecision(d)).toBeNull()

    recordDecision(d, 'v1', 'keep')
    expect(undoLastDecision(d)).not.toBeNull()
    expect(undoLastDecision(d)).toBeNull()
  })

  it('undo targets the highest id, not insertion-time order', () => {
    const d = db()
    recordDecision(d, 'a', 'keep')
    recordDecision(d, 'b', 'keep')
    undoLastDecision(d) // removes b
    recordDecision(d, 'c', 'move')

    expect(undoLastDecision(d)).toMatchObject({ videoId: 'c' })
    expect(undoLastDecision(d)).toMatchObject({ videoId: 'a' })
  })
})
