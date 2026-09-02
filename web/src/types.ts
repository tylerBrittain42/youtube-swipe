export interface Video {
  id: string
  title: string
  channel: string
  /** Pre-formatted for display, e.g. "12:34" or "1:02:03". */
  duration: string
  thumbnailUrl: string
  url: string
}

export type Decision = 'keep' | 'move' | 'watch'

export type AuthState = 'connected' | 'needs_reauth' | 'logged_out'

export interface AuthInfo {
  state: AuthState
  /** Present only when state is 'needs_reauth'. */
  reason?: 'grant_invalid' | 'missing_write_scope'
  /** Days since the last consent, or null if never connected. */
  tokenAgeDays: number | null
}

/**
 * The subset of `GET /api/health` the web UI consumes — hand-written against the
 * API, not shared. The endpoint also returns `playlistId`, `lastSyncedAt`, and
 * `decisionCount`, which the UI doesn't use.
 */
export interface Health {
  status: string
  authenticated: boolean
  writeEnabled: boolean
  auth: AuthInfo
  /** OAuth consent screen still in Google's "Testing" status (7-day token expiry). */
  consentScreenTesting: boolean
  downstreamPlaylistId: string | null
  moveQueue: { pending: number; failed: number }
  quota: { usedToday: number; limit: number }
}

/** Thrown by API helpers when the backend answers 401 (not logged in / dead grant). */
export class AuthRequiredError extends Error {
  constructor() {
    super('not authenticated')
    this.name = 'AuthRequiredError'
  }
}

export type SwipeDirection = 'left' | 'right' | 'up'

export function directionToDecision(direction: SwipeDirection): Decision {
  switch (direction) {
    case 'right':
      return 'keep'
    case 'left':
      return 'move'
    case 'up':
      return 'watch'
  }
}
