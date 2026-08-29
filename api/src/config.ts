import 'dotenv/config'

export interface Config {
  clientId: string
  clientSecret: string
  redirectUri: string
  playlistId: string
  port: number
  databasePath: string
  syncTtlMs: number
  /** The "reject" playlist a left-swipe moves videos into. Move path is off if unset. */
  downstreamPlaylistId: string | null
  /** Daily YouTube Data API budget the mover is allowed to spend (10k total; leave read headroom). */
  quotaLimit: number
}

const DEFAULT_REDIRECT_URI = 'http://localhost:8080/api/auth/callback'
const DEFAULT_PORT = 8080
const DEFAULT_DATABASE_PATH = 'data/app.sqlite'
const DEFAULT_SYNC_TTL_MS = 10 * 60 * 1000
const DEFAULT_QUOTA_LIMIT = 9500

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy api/.env.example to api/.env and fill it in.`,
    )
  }
  return value
}

/**
 * Reads and validates configuration from the environment. Called once at
 * startup (see index.ts); route/unit tests build their own config instead.
 */
export function loadConfig(): Config {
  return {
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    redirectUri: process.env.GOOGLE_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    playlistId: required('YOUTUBE_PLAYLIST_ID'),
    port: Number(process.env.PORT) || DEFAULT_PORT,
    databasePath: process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH,
    syncTtlMs: Number(process.env.SYNC_TTL_MS) || DEFAULT_SYNC_TTL_MS,
    downstreamPlaylistId: process.env.DOWNSTREAM_PLAYLIST_ID || null,
    quotaLimit: Number(process.env.YOUTUBE_QUOTA_LIMIT) || DEFAULT_QUOTA_LIMIT,
  }
}
