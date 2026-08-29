import { describe, expect, it } from 'vitest'
import { openDb } from '../db.ts'
import { testConfig } from '../test/helpers.ts'
import {
  pacificDay,
  quotaRemaining,
  quotaUsedToday,
  spendQuota,
} from './quota.ts'

describe('quota', () => {
  it('accumulates spend within a Pacific day', () => {
    const db = openDb(':memory:')
    const day = new Date('2026-08-28T12:00:00-07:00')

    spendQuota(db, 50, day)
    spendQuota(db, 1, day)
    spendQuota(db, 50, day)

    expect(quotaUsedToday(db, day)).toBe(101)
  })

  it('rolls over to a fresh budget on the next day', () => {
    const db = openDb(':memory:')
    const mon = new Date('2026-08-24T20:00:00-07:00')
    const tue = new Date('2026-08-25T09:00:00-07:00')

    spendQuota(db, 9000, mon)
    expect(quotaUsedToday(db, tue)).toBe(0)
    expect(quotaRemaining(db, testConfig({ quotaLimit: 9500 }), tue)).toBe(9500)
  })

  it('clamps remaining at zero', () => {
    const db = openDb(':memory:')
    spendQuota(db, 12000)
    expect(quotaRemaining(db, testConfig({ quotaLimit: 9500 }))).toBe(0)
  })

  it('formats the Pacific day as YYYY-MM-DD', () => {
    // 01:00 UTC on the 25th is still the 24th in Los Angeles.
    expect(pacificDay(new Date('2026-08-25T01:00:00Z'))).toBe('2026-08-24')
  })
})
