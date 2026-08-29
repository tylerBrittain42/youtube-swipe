import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { AppContext } from '../context.ts'
import { getAuthUrl, saveToken } from './google.ts'

/**
 * Outstanding OAuth `state` values, consumed on callback for CSRF protection.
 * In-memory is fine: single user, and a pending login that outlives a restart
 * can just be retried.
 */
const pendingStates = new Set<string>()

export function registerAuthRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/auth/login', (_req, reply) => {
    const state = randomUUID()
    pendingStates.add(state)
    return reply.redirect(getAuthUrl(ctx.oauthClient, state))
  })

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/callback',
    async (req, reply) => {
      const { code, state, error } = req.query

      if (error) {
        return reply.code(400).type('text/plain').send(`OAuth error: ${error}`)
      }
      if (!code || !state || !pendingStates.has(state)) {
        return reply
          .code(400)
          .type('text/plain')
          .send(
            'Invalid or expired OAuth state. Start again at /api/auth/login',
          )
      }
      pendingStates.delete(state)

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

      return reply.redirect('/')
    },
  )
}
