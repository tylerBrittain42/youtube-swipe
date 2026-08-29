import type { youtube_v3 } from 'googleapis'
import type { AppContext } from '../context.ts'
import { getStoredToken, hasWriteScope } from '../auth/google.ts'
import {
  bumpAttempt,
  markOpDone,
  nextPendingOp,
  type MoveOp,
} from '../move-queue.ts'
import { quotaRemaining, spendQuota } from './quota.ts'

export const MAX_ATTEMPTS = 5
/** Upper bound on a single op: list + insert + list + one delete. */
export const OP_COST_ESTIMATE = 1 + 50 + 1 + 50

export type MoveOutcome = 'done' | 'idle' | 'quota' | 'unauthed' | 'retry'

/** Raised mid-op when the day's remaining quota can't cover the next call. */
class QuotaExhaustedError extends Error {
  constructor() {
    super('daily YouTube quota exhausted')
    this.name = 'QuotaExhaustedError'
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as {
    code?: number
    status?: number
    response?: { status?: number }
  }
  return e?.code === 404 || e?.status === 404 || e?.response?.status === 404
}

async function videoItemsIn(
  yt: youtube_v3.Youtube,
  playlistId: string,
  videoId: string,
): Promise<string[]> {
  const { data } = await yt.playlistItems.list({
    part: ['id'],
    playlistId,
    videoId,
    maxResults: 50,
  })
  return (data.items ?? [])
    .map((i) => i.id)
    .filter((id): id is string => typeof id === 'string')
}

/**
 * Reconciles one op: ensure the video is in `target`, then ensure it is not in
 * `remove`. Insert-before-delete, and every step re-checks membership, so a
 * crash or retry can only duplicate a video, never drop it, and never
 * double-inserts. Every billed call is charged to the day's quota *before* it
 * is made and only when the budget covers it, so a video with many duplicate
 * entries can't push spend past `quotaLimit`, and a crash mid-op can't cause an
 * undercount that overshoots the budget on restart. The tradeoff — a call that
 * fails after being billed by Google is still counted — is the safe direction.
 */
async function reconcile(
  ctx: AppContext,
  yt: youtube_v3.Youtube,
  op: MoveOp,
): Promise<void> {
  const charge = <T>(cost: number, run: () => Promise<T>): Promise<T> => {
    if (quotaRemaining(ctx.db, ctx.config) < cost) {
      throw new QuotaExhaustedError()
    }
    spendQuota(ctx.db, cost)
    return run()
  }

  const inTarget = await charge(1, () =>
    videoItemsIn(yt, op.targetPlaylistId, op.videoId),
  )

  if (inTarget.length === 0) {
    await charge(50, () =>
      yt.playlistItems.insert({
        part: ['snippet'],
        requestBody: {
          snippet: {
            playlistId: op.targetPlaylistId,
            resourceId: { kind: 'youtube#video', videoId: op.videoId },
          },
        },
      }),
    )
  }

  const inRemove = await charge(1, () =>
    videoItemsIn(yt, op.removePlaylistId, op.videoId),
  )

  for (const itemId of inRemove) {
    await charge(50, async () => {
      try {
        await yt.playlistItems.delete({ id: itemId })
      } catch (err) {
        if (!isNotFound(err)) throw err
      }
    })
  }
}

/** Processes at most one queued op. No timers — safe to call from tests. */
export async function processNextOp(ctx: AppContext): Promise<MoveOutcome> {
  if (!hasWriteScope(getStoredToken(ctx.db)?.scope)) return 'unauthed'
  if (quotaRemaining(ctx.db, ctx.config) < OP_COST_ESTIMATE) return 'quota'

  const op = nextPendingOp(ctx.db)
  if (!op) return 'idle'

  const yt = ctx.getYoutube()
  if (!yt) return 'unauthed'

  try {
    await reconcile(ctx, yt, op)
    markOpDone(ctx.db, op.id)
    return 'done'
  } catch (err) {
    // Running out of budget isn't a failure — leave the op pending, don't burn
    // an attempt. Partial progress is safe because reconcile re-checks state.
    if (err instanceof QuotaExhaustedError) return 'quota'
    bumpAttempt(ctx.db, op.id, errorMessage(err), MAX_ATTEMPTS)
    return 'retry'
  }
}

const DELAYS: Record<MoveOutcome, number> = {
  done: 50,
  retry: 10_000,
  idle: 30_000,
  unauthed: 30_000,
  quota: 5 * 60_000,
}

interface Logger {
  info: (msg: string) => void
  error: (obj: unknown, msg?: string) => void
}

/**
 * Runs the queue drainer on a self-scheduling loop. Call once from index.ts
 * after the server is listening; never from buildApp (tests must not spawn it).
 */
export function startMover(
  ctx: AppContext,
  logger: Logger = console,
): { stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  async function tick(): Promise<void> {
    if (stopped) return
    let outcome: MoveOutcome = 'retry'
    try {
      outcome = await processNextOp(ctx)
      if (outcome === 'done') logger.info('move-queue: op completed')
    } catch (err) {
      logger.error(err, 'move-queue: unexpected error')
    }
    if (stopped) return
    timer = setTimeout(() => void tick(), DELAYS[outcome])
  }

  void tick()
  return {
    stop: () => {
      stopped = true
      if (timer) clearTimeout(timer)
    },
  }
}
