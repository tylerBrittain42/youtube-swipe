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

CREATE TABLE IF NOT EXISTS decisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id   TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('keep', 'move', 'watch')),
  decided_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decisions_video ON decisions (video_id);

CREATE TABLE IF NOT EXISTS move_queue (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id           TEXT NOT NULL,
  target_playlist_id TEXT NOT NULL,
  remove_playlist_id TEXT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('move', 'revert')),
  state              TEXT NOT NULL DEFAULT 'pending'
                       CHECK (state IN ('pending', 'done', 'failed', 'superseded')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  last_error         TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_move_queue_state ON move_queue (state, id);
CREATE INDEX IF NOT EXISTS idx_move_queue_video ON move_queue (video_id);

CREATE TABLE IF NOT EXISTS quota_usage (
  day   TEXT PRIMARY KEY,
  units INTEGER NOT NULL
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
  // Rollback-journal mode keeps the database as a single file at rest (a
  // transient `-journal` appears only mid-write). This app is single-user and
  // single-process, so WAL's concurrency wins don't apply. Setting it
  // explicitly also converts an existing WAL database on first open.
  db.pragma('journal_mode = DELETE')
  db.exec(SCHEMA)
  return db
}
