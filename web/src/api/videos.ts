import { FIXTURE_VIDEOS } from '../data/fixtures'
import type { Video } from '../types'

/**
 * Stands in for `GET /api/videos?limit=n` (see docs/implementation-plan.md §2).
 * Swapped for a real fetch in M2; the frontend contract shouldn't need to change.
 */
export async function fetchVideos(limit = 10): Promise<Video[]> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  return FIXTURE_VIDEOS.slice(0, limit)
}
