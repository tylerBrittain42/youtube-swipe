import { AuthRequiredError, type Playlist } from '../types'

/** `GET /api/playlists` — the signed-in account's playlists, for the pickers. */
export async function fetchPlaylists(): Promise<Playlist[]> {
  const res = await fetch('/api/playlists')
  if (res.status === 401) throw new AuthRequiredError()
  if (!res.ok) throw new Error(`GET /api/playlists failed: ${res.status}`)
  return (await res.json()) as Playlist[]
}
