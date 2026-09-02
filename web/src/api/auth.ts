/** `POST /api/auth/logout` — drops (and revokes) the stored Google grant. */
export async function logout(): Promise<void> {
  const res = await fetch('/api/auth/logout', { method: 'POST' })
  if (!res.ok) {
    throw new Error(`POST /api/auth/logout failed: ${res.status}`)
  }
}
