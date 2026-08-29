import type { FastifyInstance } from 'fastify'
import type { AppContext } from '../context.ts'
import { getStoredToken, hasWriteScope } from '../auth/google.ts'
import { getSyncState } from '../youtube/sync.ts'
import { countDecisions } from '../decisions.ts'
import { moveQueueStatus } from '../move-queue.ts'
import { quotaUsedToday } from '../youtube/quota.ts'

export function registerHealthRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/health', () => {
    const state = getSyncState(ctx, ctx.config.playlistId)
    const token = getStoredToken(ctx.db)
    return {
      status: 'ok',
      authenticated: token !== undefined,
      writeEnabled: hasWriteScope(token?.scope),
      playlistId: ctx.config.playlistId,
      downstreamPlaylistId: ctx.config.downstreamPlaylistId,
      lastSyncedAt: state?.last_synced_at ?? null,
      decisionCount: countDecisions(ctx.db),
      moveQueue: moveQueueStatus(ctx.db),
      quota: {
        usedToday: quotaUsedToday(ctx.db),
        limit: ctx.config.quotaLimit,
      },
    }
  })
}
