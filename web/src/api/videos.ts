import { AuthRequiredError, type Video } from '../types'

/**
 * `GET /api/videos?limit=n` (see docs/implementation-plan.md §2). Served by the
 * Fastify backend same-origin in prod, via the Vite dev proxy in development.
 */
export async function fetchVideos(limit = 10): Promise<Video[]> {
  const res = await fetch(`/api/videos?limit=${limit}`)
  if (res.status === 401) {
    throw new AuthRequiredError()
  }
  if (!res.ok) {
    throw new Error(`GET /api/videos failed: ${res.status}`)
  }
  return (await res.json()) as Video[]
}
