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
/** Upper bound on a single op: list + insert + list + delete. */
export const OP_COST_ESTIMATE = 1 + 50 + 1 + 50

export type MoveOutcome = 'done' | 'idle' | 'quota' | 'unauthed' | 'retry'

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
 * double-inserts.
 */
async function reconcile(
  ctx: AppContext,
  yt: youtube_v3.Youtube,
  op: MoveOp,
): Promise<void> {
  const inTarget = await videoItemsIn(yt, op.targetPlaylistId, op.videoId)
  spendQuota(ctx.db, 1)

  if (inTarget.length === 0) {
    await yt.playlistItems.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          playlistId: op.targetPlaylistId,
          resourceId: { kind: 'youtube#video', videoId: op.videoId },
        },
      },
    })
    spendQuota(ctx.db, 50)
  }

  const inRemove = await videoItemsIn(yt, op.removePlaylistId, op.videoId)
  spendQuota(ctx.db, 1)

  for (const itemId of inRemove) {
    try {
      await yt.playlistItems.delete({ id: itemId })
    } catch (err) {
      if (!isNotFound(err)) throw err
    }
    spendQuota(ctx.db, 50)
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
    bumpAttempt(ctx.db, op.id, (err as Error).message, MAX_ATTEMPTS)
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
