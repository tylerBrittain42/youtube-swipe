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

/** Shape of `GET /api/health` — hand-written against the API, not shared. */
export interface Health {
  status: string
  authenticated: boolean
  writeEnabled: boolean
  downstreamPlaylistId: string | null
  moveQueue: { pending: number; failed: number }
  quota: { usedToday: number; limit: number }
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
