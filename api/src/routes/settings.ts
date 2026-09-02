import type { FastifyInstance } from 'fastify'
import type { AppContext } from '../context.ts'
import { getSettings, putSettings, isSortOrder } from '../settings.ts'

interface PutBody {
  sourcePlaylistId?: unknown
  downstreamPlaylistId?: unknown
  sortOrder?: unknown
}

const INVALID = {
  error: 'invalid_settings',
  message:
    'Expected { sourcePlaylistId?: string, downstreamPlaylistId?: string | null, sortOrder?: "oldest" | "newest" }',
} as const

export function registerSettingsRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/settings', () => getSettings(ctx.db, ctx.config))

  app.put<{ Body: PutBody }>('/api/settings', (req, reply) => {
    const body = req.body ?? {}
    const patch: {
      sourcePlaylistId?: string
      downstreamPlaylistId?: string | null
      sortOrder?: 'oldest' | 'newest'
    } = {}

    if ('sourcePlaylistId' in body) {
      if (typeof body.sourcePlaylistId !== 'string' || !body.sourcePlaylistId) {
        return reply.code(400).send(INVALID)
      }
      patch.sourcePlaylistId = body.sourcePlaylistId
    }
    if ('downstreamPlaylistId' in body) {
      if (
        body.downstreamPlaylistId !== null &&
        (typeof body.downstreamPlaylistId !== 'string' ||
          !body.downstreamPlaylistId)
      ) {
        return reply.code(400).send(INVALID)
      }
      patch.downstreamPlaylistId = body.downstreamPlaylistId
    }
    if ('sortOrder' in body) {
      if (!isSortOrder(body.sortOrder)) return reply.code(400).send(INVALID)
      patch.sortOrder = body.sortOrder
    }

    const before = getSettings(ctx.db, ctx.config)
    const next = putSettings(ctx.db, ctx.config, patch)

    // A new source playlist means the cache is for the wrong list — drop it so
    // the next /api/videos does a full re-sync.
    if (next.sourcePlaylistId !== before.sourcePlaylistId) {
      ctx.db
        .prepare('DELETE FROM sync_state WHERE playlist_id = ?')
        .run(next.sourcePlaylistId)
    }

    return next
  })
}
