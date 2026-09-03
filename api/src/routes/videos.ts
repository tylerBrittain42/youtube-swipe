import type { FastifyInstance } from 'fastify'
import type { AppContext } from '../context.ts'
import { getAuthStatus, NotAuthenticatedError } from '../auth/google.ts'
import { getSettings } from '../settings.ts'
import { ensureSynced } from '../youtube/sync.ts'

const NOT_AUTHENTICATED = {
  error: 'not_authenticated',
  loginUrl: '/api/auth/login',
} as const

interface VideoRow {
  id: string
  title: string
  channel: string
  duration: string
  thumbnail_url: string
  url: string
}

function parseLimit(raw: string | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 10
  return Math.min(50, Math.max(1, Math.trunc(n)))
}

export function registerVideosRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get<{ Querystring: { limit?: string } }>(
    '/api/videos',
    async (req, reply) => {
      const limit = parseLimit(req.query.limit)
      const { sourcePlaylistId, sortOrder } = getSettings(ctx.db, ctx.config)

      if (!ctx.getYoutube() || getAuthStatus(ctx.db)?.invalidSince != null) {
        return reply.code(401).send(NOT_AUTHENTICATED)
      }

      try {
        await ensureSynced(ctx, sourcePlaylistId)
      } catch (err) {
        if (err instanceof NotAuthenticatedError) {
          return reply.code(401).send(NOT_AUTHENTICATED)
        }
        req.log.error(err)
        return reply
          .code(502)
          .send({ error: 'youtube_error', message: (err as Error).message })
      }

      const direction = sortOrder === 'newest' ? 'DESC' : 'ASC'
      const rows = ctx.db
        .prepare(
          `SELECT id, title, channel, duration, thumbnail_url, url
           FROM videos
           WHERE playlist_id = ?
             AND id NOT IN (SELECT video_id FROM decisions)
           ORDER BY position ${direction} LIMIT ?`,
        )
        .all(sourcePlaylistId, limit) as VideoRow[]

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        channel: row.channel,
        duration: row.duration,
        thumbnailUrl: row.thumbnail_url,
        url: row.url,
      }))
    },
  )
}
