import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { DB } from '../db.ts'
import type { AppContext } from '../context.ts'
import { getAuthUrl, getStoredToken, saveToken } from './google.ts'

/** OAuth `state` values older than this are pruned as abandoned logins. */
const STATE_TTL_MS = 10 * 60 * 1000

function issueState(db: DB): string {
  const state = randomUUID()
  db.prepare(
    'INSERT INTO oauth_pending_state (state, created_at) VALUES (?, ?)',
  ).run(state, Date.now())
  db.prepare('DELETE FROM oauth_pending_state WHERE created_at < ?').run(
    Date.now() - STATE_TTL_MS,
  )
  return state
}

/**
 * Consumes a pending state, returning whether it was valid: it must exist and be
 * within the TTL (enforced here, not just opportunistically pruned on the next
 * login). Single-use — the row is deleted either way. Also sweeps expired rows.
 */
function consumeState(db: DB, state: string): boolean {
  const cutoff = Date.now() - STATE_TTL_MS
  const info = db
    .prepare(
      'DELETE FROM oauth_pending_state WHERE state = ? AND created_at >= ?',
    )
    .run(state, cutoff)
  db.prepare('DELETE FROM oauth_pending_state WHERE created_at < ?').run(cutoff)
  return info.changes > 0
}

/** Best-effort revoke so a logout actually releases the grant at Google. */
async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      { method: 'POST' },
    )
  } catch {
    // Offline or already-revoked — the local rows are gone either way.
  }
}

export function registerAuthRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/auth/login', (_req, reply) => {
    const state = issueState(ctx.db)
    return reply.redirect(getAuthUrl(ctx.oauthClient, state))
  })

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/callback',
    async (req, reply) => {
      const { code, state, error } = req.query

      if (error) {
        return reply.code(400).type('text/plain').send(`OAuth error: ${error}`)
      }
      if (!code || !state || !consumeState(ctx.db, state)) {
        return reply
          .code(400)
          .type('text/plain')
          .send(
            'Invalid or expired OAuth state. Start again at /api/auth/login',
          )
      }

      try {
        const { tokens } = await ctx.oauthClient.getToken(code)
        saveToken(ctx.db, tokens)
      } catch (err) {
        req.log.error(err)
        return reply
          .code(502)
          .type('text/plain')
          .send('Failed to exchange the OAuth code with Google.')
      }

      // Force the next /api/videos to re-sync instead of serving a cache from
      // before the (re-)auth — otherwise a reconnect looks stale for ~10 min.
      ctx.db
        .prepare('DELETE FROM sync_state WHERE playlist_id = ?')
        .run(ctx.config.playlistId)

      return reply.redirect('/')
    },
  )

  app.post('/api/auth/logout', async (_req, reply) => {
    const token = getStoredToken(ctx.db)
    ctx.db.prepare('DELETE FROM oauth_token WHERE id = 1').run()
    ctx.db.prepare('DELETE FROM auth_status WHERE id = 1').run()
    ctx.db
      .prepare('DELETE FROM sync_state WHERE playlist_id = ?')
      .run(ctx.config.playlistId)
    if (token?.refresh_token) await revokeToken(token.refresh_token)
    return reply.code(204).send()
  })
}
