import { google, type youtube_v3 } from 'googleapis'
import type { Config } from './config.ts'
import { openDb, type DB } from './db.ts'
import {
  createOAuthClient,
  getAuthorizedClient,
  saveToken,
  type OAuth2Client,
} from './auth/google.ts'

/**
 * Everything the routes need, bundled so tests can swap real implementations
 * (SQLite file, Google clients) for fakes.
 */
export interface AppContext {
  db: DB
  config: Config
  oauthClient: OAuth2Client
  /** An authenticated YouTube Data API client, or null if not logged in yet. */
  getYoutube: () => youtube_v3.Youtube | null
}

export function createContext(config: Config): AppContext {
  const db = openDb(config.databasePath)
  const oauthClient = createOAuthClient(config)
  // Persist access tokens that googleapis refreshes behind our back.
  oauthClient.on('tokens', (tokens) => saveToken(db, tokens))

  return {
    db,
    config,
    oauthClient,
    getYoutube: () => {
      const auth = getAuthorizedClient(db, oauthClient)
      if (!auth) return null
      return google.youtube({ version: 'v3', auth })
    },
  }
}
