import { google } from 'googleapis'
import type { DB } from '../db.ts'
import type { Config } from '../config.ts'

// `googleapis` bundles its own copy of google-auth-library, so derive the
// types from the client it hands back rather than importing the top-level
// package (which is a structurally-incompatible second copy).
export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>
type Credentials = OAuth2Client['credentials']

/**
 * `youtube.force-ssl` grants both read and the playlist writes M4 needs. Users
 * who authorized under M2's `youtube.readonly` must re-run /api/auth/login.
 */
export const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl']

const WRITE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube',
]

/** Whether the stored grant can modify playlists (not just read them). */
export function hasWriteScope(scope: string | null | undefined): boolean {
  if (!scope) return false
  const granted = scope.split(/\s+/)
  return WRITE_SCOPES.some((s) => granted.includes(s))
}

/**
 * Whether an error from a Google call means the grant itself is dead — a
 * revoked or expired refresh token (`invalid_grant`, common once the consent
 * screen's 7-day Testing window lapses) or a 401 from the Data API. Retrying
 * won't help; the user has to log in again. Kept narrow on purpose: 403 is not
 * included because it also covers quota and per-playlist permission errors.
 */
export function isAuthError(err: unknown): boolean {
  const e = err as {
    code?: number | string
    status?: number
    message?: string
    response?: { status?: number; data?: { error?: string } }
  }
  if (e?.code === 401 || e?.status === 401 || e?.response?.status === 401) {
    return true
  }
  if (e?.response?.data?.error === 'invalid_grant') return true
  return typeof e?.message === 'string' && e.message.includes('invalid_grant')
}

export interface AuthStatus {
  connectedAt: number | null
  invalidSince: number | null
  lastError: string | null
}

export function getAuthStatus(db: DB): AuthStatus | undefined {
  const row = db
    .prepare(
      'SELECT connected_at, invalid_since, last_error FROM auth_status WHERE id = 1',
    )
    .get() as
    | {
        connected_at: number | null
        invalid_since: number | null
        last_error: string | null
      }
    | undefined
  if (!row) return undefined
  return {
    connectedAt: row.connected_at,
    invalidSince: row.invalid_since,
    lastError: row.last_error,
  }
}

/**
 * Records that the grant looks dead. Keeps the first failure's timestamp if one
 * is already set, so `invalid_since` reflects when the trouble started.
 */
export function markGrantInvalid(db: DB, message: string): void {
  db.prepare(
    `INSERT INTO auth_status (id, invalid_since, last_error)
     VALUES (1, @now, @message)
     ON CONFLICT (id) DO UPDATE SET
       invalid_since = COALESCE(auth_status.invalid_since, @now),
       last_error = @message`,
  ).run({ now: Date.now(), message })
}

/** Clears the "grant is dead" flag after a call succeeds. */
export function markGrantValid(db: DB): void {
  db.prepare(
    `INSERT INTO auth_status (id, invalid_since, last_error) VALUES (1, NULL, NULL)
     ON CONFLICT (id) DO UPDATE SET invalid_since = NULL, last_error = NULL`,
  ).run()
}

/** Thrown by the sync/YouTube layer when there is no stored OAuth token. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super('Not authenticated with Google')
    this.name = 'NotAuthenticatedError'
  }
}

interface TokenRow {
  access_token: string | null
  refresh_token: string
  expiry_date: number | null
  scope: string | null
  token_type: string | null
}

export function createOAuthClient(config: Config): OAuth2Client {
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  )
}

export function getAuthUrl(client: OAuth2Client, state: string): string {
  return client.generateAuthUrl({
    access_type: 'offline',
    // Force the consent screen so Google always returns a refresh_token,
    // even on a re-login.
    prompt: 'consent',
    scope: SCOPES,
    state,
  })
}

export function getStoredToken(db: DB): TokenRow | undefined {
  return db
    .prepare(
      'SELECT access_token, refresh_token, expiry_date, scope, token_type FROM oauth_token WHERE id = 1',
    )
    .get() as TokenRow | undefined
}

/**
 * Upserts the single OAuth token row. Google only returns a refresh_token on
 * the initial consent, so an incoming set without one must not clobber the
 * stored value.
 */
export function saveToken(db: DB, tokens: Credentials): void {
  const existing = getStoredToken(db)
  const refreshToken = tokens.refresh_token ?? existing?.refresh_token
  if (!refreshToken) {
    throw new Error('OAuth response had no refresh_token and none is stored')
  }

  // A fresh refresh_token means the user just went through consent — reset the
  // "grant is dead" flag and stamp connected_at (the anchor for the 7-day
  // Testing-window expiry warning). A plain access-token refresh has no
  // refresh_token and must not move connected_at.
  if (tokens.refresh_token) {
    db.prepare(
      `INSERT INTO auth_status (id, connected_at, invalid_since, last_error)
       VALUES (1, @now, NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET
         connected_at = @now, invalid_since = NULL, last_error = NULL`,
    ).run({ now: Date.now() })
  }

  db.prepare(
    `INSERT INTO oauth_token (id, access_token, refresh_token, expiry_date, scope, token_type, updated_at)
     VALUES (1, @access_token, @refresh_token, @expiry_date, @scope, @token_type, @updated_at)
     ON CONFLICT (id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expiry_date = excluded.expiry_date,
       scope = excluded.scope,
       token_type = excluded.token_type,
       updated_at = excluded.updated_at`,
  ).run({
    access_token: tokens.access_token ?? null,
    refresh_token: refreshToken,
    expiry_date: tokens.expiry_date ?? null,
    scope: tokens.scope ?? existing?.scope ?? null,
    token_type: tokens.token_type ?? existing?.token_type ?? null,
    updated_at: Date.now(),
  })
}

/**
 * Returns an OAuth client primed with the stored credentials, or null if the
 * user has never completed the login flow. googleapis refreshes the access
 * token on demand from the refresh_token; the `tokens` listener persists it.
 */
export function getAuthorizedClient(
  db: DB,
  client: OAuth2Client,
): OAuth2Client | null {
  const token = getStoredToken(db)
  if (!token) return null
  client.setCredentials({
    refresh_token: token.refresh_token,
    access_token: token.access_token ?? undefined,
    expiry_date: token.expiry_date ?? undefined,
    scope: token.scope ?? undefined,
    token_type: token.token_type ?? undefined,
  })
  return client
}
