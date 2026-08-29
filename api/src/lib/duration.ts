/**
 * Formats an ISO 8601 duration (YouTube's `contentDetails.duration`, e.g.
 * "PT1H2M3S") for display: "1:02:03", or "4:05" when under an hour.
 *
 * Returns "0:00" for anything unparseable, zero-length, or non-time (live
 * streams report "P0D").
 */
export function formatDuration(iso: string | null | undefined): string {
  if (!iso) return '0:00'

  const match = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!match) return '0:00'

  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)

  const pad = (n: number) => String(n).padStart(2, '0')

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${minutes}:${pad(seconds)}`
}
