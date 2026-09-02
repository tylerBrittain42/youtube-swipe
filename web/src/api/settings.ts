import { AuthRequiredError, type Settings } from '../types'

/** `GET /api/settings` — the persisted source/destination playlists and sort order. */
export async function fetchSettings(): Promise<Settings> {
  const res = await fetch('/api/settings')
  if (res.status === 401) throw new AuthRequiredError()
  if (!res.ok) throw new Error(`GET /api/settings failed: ${res.status}`)
  return (await res.json()) as Settings
}

/** `PUT /api/settings` — merges a partial update, returns the merged settings. */
export async function updateSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (res.status === 401) throw new AuthRequiredError()
  if (!res.ok) throw new Error(`PUT /api/settings failed: ${res.status}`)
  return (await res.json()) as Settings
}
