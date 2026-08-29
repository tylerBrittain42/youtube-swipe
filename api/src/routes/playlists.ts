import type { FastifyInstance } from 'fastify'
import type { AppContext } from '../context.ts'

export function registerPlaylistsRoute(
  app: FastifyInstance,
  ctx: AppContext,
): void {
  app.get('/api/playlists', async (req, reply) => {
    const yt = ctx.getYoutube()
    if (!yt) {
      return reply
        .code(401)
        .send({ error: 'not_authenticated', loginUrl: '/api/auth/login' })
    }

    try {
      const playlists: { id: string; title: string; itemCount: number }[] = []
      let pageToken: string | undefined

      do {
        const { data } = await yt.playlists.list({
          part: ['snippet', 'contentDetails'],
          mine: true,
          maxResults: 50,
          pageToken,
        })
        for (const p of data.items ?? []) {
          if (!p.id) continue
          playlists.push({
            id: p.id,
            title: p.snippet?.title ?? '',
            itemCount: p.contentDetails?.itemCount ?? 0,
          })
        }
        pageToken = data.nextPageToken ?? undefined
      } while (pageToken)

      return playlists
    } catch (err) {
      req.log.error(err)
      return reply
        .code(502)
        .send({ error: 'youtube_error', message: (err as Error).message })
    }
  })
}
