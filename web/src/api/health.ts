import type { Health } from '../types'

/** `GET /api/health` — liveness plus auth / move-queue / quota status. */
export async function fetchHealth(): Promise<Health> {
  const res = await fetch('/api/health')
  if (!res.ok) {
    throw new Error(`GET /api/health failed: ${res.status}`)
  }
  return (await res.json()) as Health
}
