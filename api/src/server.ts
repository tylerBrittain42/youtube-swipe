import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import type { AppContext } from './context.ts'
import { registerAuthRoutes } from './auth/routes.ts'
import { registerHealthRoute } from './routes/health.ts'
import { registerVideosRoute } from './routes/videos.ts'
import { registerPlaylistsRoute } from './routes/playlists.ts'

export interface BuildAppOptions {
  logger?: boolean
}

function resolveWebDist(): string {
  if (process.env.WEB_DIST) return process.env.WEB_DIST
  // Works from both src/ (tsx) and dist/ (built) — each is one level under api/.
  return fileURLToPath(new URL('../../web/dist', import.meta.url))
}

export async function buildApp(
  ctx: AppContext,
  opts: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? true })

  registerHealthRoute(app, ctx)
  registerAuthRoutes(app, ctx)
  registerVideosRoute(app, ctx)
  registerPlaylistsRoute(app, ctx)

  const webDist = resolveWebDist()
  const hasFrontend = existsSync(join(webDist, 'index.html'))

  if (hasFrontend) {
    // Same-origin serving (see docs/implementation-plan.md §3, option 1):
    // no CORS, no third-party-cookie problem.
    await app.register(fastifyStatic, { root: webDist })
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ error: 'not_found' })
    })
  } else {
    app.log.warn(
      `web/dist not found at ${webDist} — the frontend will not be served. Run "npm run build" in web/.`,
    )
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && req.url === '/') {
        return reply
          .type('text/plain')
          .send(
            'youtube-swipe API is running. Frontend is not built.\n' +
              'Health: /api/health   Log in: /api/auth/login\n',
          )
      }
      return reply.code(404).send({ error: 'not_found' })
    })
  }

  return app
}
