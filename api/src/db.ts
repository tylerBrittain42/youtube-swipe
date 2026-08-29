import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export type DB = Database.Database

const SCHEMA = `
CREATE TABLE IF NOT EXISTS oauth_token (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  access_token  TEXT,
  refresh_token TEXT NOT NULL,
  expiry_date   INTEGER,
  scope         TEXT,
  token_type    TEXT,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id               TEXT PRIMARY KEY,
  playlist_id      TEXT NOT NULL,
  title            TEXT NOT NULL,
  channel          TEXT NOT NULL,
  duration         TEXT NOT NULL,
  thumbnail_url    TEXT NOT NULL,
  url              TEXT NOT NULL,
  position         INTEGER NOT NULL,
  playlist_item_id TEXT NOT NULL,
  synced_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_videos_playlist ON videos (playlist_id, position);

CREATE TABLE IF NOT EXISTS sync_state (
  playlist_id    TEXT PRIMARY KEY,
  last_synced_at INTEGER NOT NULL,
  item_count     INTEGER NOT NULL
);
`

/**
 * Opens the SQLite database (creating the file and parent dir if needed) and
 * applies the schema. Pass ":memory:" for tests.
 */
export function openDb(path: string): DB {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}
