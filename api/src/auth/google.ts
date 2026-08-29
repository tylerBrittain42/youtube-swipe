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
