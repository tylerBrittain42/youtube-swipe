import type { DB } from '../db.ts'
import type { Config } from '../config.ts'

/**
 * The current day in `YYYY-MM-DD`, US Pacific — the timezone YouTube resets the
 * Data API quota at midnight.
 */
export function pacificDay(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

/** Records `units` of YouTube Data API cost against today's budget. */
export function spendQuota(
  db: DB,
  units: number,
  now: Date = new Date(),
): void {
  db.prepare(
    `INSERT INTO quota_usage (day, units) VALUES (?, ?)
     ON CONFLICT (day) DO UPDATE SET units = units + excluded.units`,
  ).run(pacificDay(now), units)
}

export function quotaUsedToday(db: DB, now: Date = new Date()): number {
  const row = db
    .prepare('SELECT units FROM quota_usage WHERE day = ?')
    .get(pacificDay(now)) as { units: number } | undefined
  return row?.units ?? 0
}

export function quotaRemaining(
  db: DB,
  config: Config,
  now: Date = new Date(),
): number {
  return Math.max(0, config.quotaLimit - quotaUsedToday(db, now))
}
