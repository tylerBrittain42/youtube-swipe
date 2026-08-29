import type { FastifyInstance } from 'fastify'
import type { AppContext } from '../context.ts'
import { getStoredToken } from '../auth/google.ts'
import { getSyncState } from '../youtube/sync.ts'
import { countDecisions } from '../decisions.ts'

export function registerHealthRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/health', () => {
    const state = getSyncState(ctx, ctx.config.playlistId)
    return {
      status: 'ok',
      authenticated: getStoredToken(ctx.db) !== undefined,
      playlistId: ctx.config.playlistId,
      lastSyncedAt: state?.last_synced_at ?? null,
      decisionCount: countDecisions(ctx.db),
    }
  })
}
