import type { FastifyInstance } from 'fastify'
import type { AppContext } from '../context.ts'
import { getAuthStatus, getStoredToken, hasWriteScope } from '../auth/google.ts'
import { getSettings } from '../settings.ts'
import { getSyncState } from '../youtube/sync.ts'
import { countDecisions } from '../decisions.ts'
import { moveQueueStatus } from '../move-queue.ts'
import { quotaUsedToday } from '../youtube/quota.ts'

const DAY_MS = 24 * 60 * 60 * 1000

type AuthState = 'connected' | 'needs_reauth' | 'logged_out'
type ReauthReason = 'grant_invalid' | 'missing_write_scope'

function describeAuth(
  ctx: AppContext,
  downstreamPlaylistId: string | null,
): {
  state: AuthState
  reason?: ReauthReason
  tokenAgeDays: number | null
} {
  const token = getStoredToken(ctx.db)
  const status = getAuthStatus(ctx.db)
  const tokenAgeDays =
    status?.connectedAt != null
      ? Math.floor((Date.now() - status.connectedAt) / DAY_MS)
      : null

  if (!token) return { state: 'logged_out', tokenAgeDays }
  if (status?.invalidSince != null) {
    return { state: 'needs_reauth', reason: 'grant_invalid', tokenAgeDays }
  }
  if (!hasWriteScope(token.scope) && downstreamPlaylistId != null) {
    return {
      state: 'needs_reauth',
      reason: 'missing_write_scope',
      tokenAgeDays,
    }
  }
  return { state: 'connected', tokenAgeDays }
}

export function registerHealthRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/health', () => {
    const { sourcePlaylistId, downstreamPlaylistId } = getSettings(
      ctx.db,
      ctx.config,
    )
    const state = getSyncState(ctx, sourcePlaylistId)
    const token = getStoredToken(ctx.db)
    return {
      status: 'ok',
      authenticated: token !== undefined,
      writeEnabled: hasWriteScope(token?.scope),
      auth: describeAuth(ctx, downstreamPlaylistId),
      consentScreenTesting: ctx.config.consentScreenTesting,
      playlistId: sourcePlaylistId,
      downstreamPlaylistId,
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
