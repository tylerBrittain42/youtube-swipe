import type { FastifyInstance } from 'fastify'
import type { AppContext } from '../context.ts'
import {
  isDecisionAction,
  recordDecision,
  undoLastDecision,
} from '../decisions.ts'

export function registerDecisionsRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.post<{ Body: { videoId?: unknown; action?: unknown } }>(
    '/api/decisions',
    (req, reply) => {
      const { videoId, action } = req.body ?? {}

      if (
        typeof videoId !== 'string' ||
        videoId.length === 0 ||
        !isDecisionAction(action)
      ) {
        return reply.code(400).send({
          error: 'invalid_decision',
          message:
            "Expected { videoId: string, action: 'keep' | 'move' | 'watch' }",
        })
      }

      recordDecision(ctx.db, videoId, action)
      return reply.send({ ok: true })
    },
  )

  app.post('/api/decisions/undo', (_req, reply) => {
    const undone = undoLastDecision(ctx.db)
    return reply.send({ undone })
  })
}
