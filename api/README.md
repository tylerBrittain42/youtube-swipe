# api

Fastify + TypeScript backend for `youtube-swipe`. Owns Google OAuth, caches the
source playlist's contents in SQLite, and serves the read API the frontend swipes
against. See [../docs/implementation-plan.md](../docs/implementation-plan.md) §2 for the
contract and §3 for infra notes.

## One-time setup

1. Create a Google Cloud project, enable **YouTube Data API v3**, configure the
   OAuth consent screen (External; add yourself as a test user), and create an
   **OAuth client ID → Web application** with redirect URI
   `http://localhost:8080/api/auth/callback`.
2. `cp .env.example .env` and fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   and `YOUTUBE_PLAYLIST_ID` (plus `DOWNSTREAM_PLAYLIST_ID` for M4 moves). Those
   two playlist vars only seed the `settings` row on first run — after that the
   in-app pickers own them. Run `GET /api/playlists` once authed to find IDs, or
   copy the `list=` param from a playlist's YouTube URL.

## Commands

```bash
npm run dev         # watch-mode dev server (tsx) on :8080
npm run build       # tsc -> dist/
npm start           # node dist/index.js
npm test            # vitest run
npm run typecheck   # tsc --noEmit (includes tests)
npm run lint        # eslint
npm run format      # prettier --write
```

## Logging in

With the server running, open <http://localhost:8080/api/auth/login> in a browser
once. Google redirects back to `/api/auth/callback`, the refresh token is stored
in SQLite (`data/app.sqlite`), and `GET /api/health` then reports
`"authenticated": true`.

M4 needs the `youtube.force-ssl` scope (read **and** write). If you first
authorized under M2's read-only scope, re-run `/api/auth/login` — `GET /api/health`
shows `"writeEnabled": true` once the new grant is stored.

`GET /api/health` reports an `auth` object the frontend uses to gate the UI:
`{ state: "connected" | "needs_reauth" | "logged_out", reason?, tokenAgeDays }`.
When a Google call comes back with `invalid_grant` or a 401 (revoked grant, or the
7-day Testing-window expiry), the API flags the stored grant dead — `state`
becomes `needs_reauth` / `grant_invalid`, `/api/videos` returns 401, and the move
worker parks (it does **not** fail queued moves). Re-running `/api/auth/login`
clears the flag and forces an immediate re-sync. `POST /api/auth/logout` drops the
stored grant entirely.

**Publish the consent screen to Production** (Google Cloud Console → OAuth consent
screen) to remove the 7-day refresh-token expiry — single-user access to your own
data needs no verification review. Then set `CONSENT_SCREEN_TESTING=false` to
silence the frontend's "reconnect soon" nudge.

## Endpoints

| Method  | Path                  | Purpose                                                                                                |
| ------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| GET     | `/api/health`         | Liveness, `auth` state / `writeEnabled`, `decisionCount`, `moveQueue`, `quota`                         |
| GET     | `/api/auth/login`     | Redirect to Google consent                                                                             |
| GET     | `/api/auth/callback`  | OAuth callback; stores the refresh token, clears the sync cache                                        |
| POST    | `/api/auth/logout`    | Drops the stored grant (and revokes it at Google); 204                                                 |
| GET     | `/api/videos?limit=`  | Next _n_ **undecided** videos (1–50, def 10) from the settings source playlist, in the settings order  |
| GET     | `/api/playlists`      | Your playlists + IDs, for the pickers                                                                  |
| GET PUT | `/api/settings`       | `{ sourcePlaylistId, downstreamPlaylistId, sortOrder }` — see below                                    |
| POST    | `/api/decisions`      | `{ videoId, action: "keep"\|"move"\|"watch" }` — records a decision; `move` also queues a YouTube move |
| POST    | `/api/decisions/undo` | Reverses the most recent decision; a reverted `move` queues a revert                                   |

## Settings (M5)

`GET` / `PUT /api/settings` holds `{ sourcePlaylistId, downstreamPlaylistId,
sortOrder: "oldest" | "newest" }`. `YOUTUBE_PLAYLIST_ID` and
`DOWNSTREAM_PLAYLIST_ID` seed the row the first time it's read; after that the row
wins and the env vars are ignored. `PUT` merges a partial body (`downstreamPlaylistId:
null` clears the move target). Changing `sourcePlaylistId` drops its cached
`sync_state` so the next `/api/videos` does a full re-sync; queued `move_queue`
rows keep their original playlist IDs. The web UI's settings bar drives this.

## Moving videos (M4)

A `move` decision enqueues a row in `move_queue`. A background worker
(`startMover`, launched from `index.ts`) drains it: for each op it ensures the
video is in the target playlist (insert if missing), then removes it from the
other playlist. Insert-before-delete + membership re-checks make it crash-safe
(an interrupted move duplicates, never drops) and idempotent on retry. Undo
enqueues the same reconciler with the playlists swapped.

Every billed YouTube call (reads included) is counted in `quota_usage` per
US-Pacific day. When `YOUTUBE_QUOTA_LIMIT` (default 9500) is hit the worker
pauses and resumes after the daily reset; `move_queue` rows just wait.

`.env` and `*.sqlite` are gitignored — never commit them.
