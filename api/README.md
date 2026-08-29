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
   `YOUTUBE_PLAYLIST_ID`, and (for M4 moves) `DOWNSTREAM_PLAYLIST_ID`. Run
   `GET /api/playlists` once authed to find IDs, or copy the `list=` param from a
   playlist's YouTube URL.

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

## Endpoints

| Method | Path                  | Purpose                                                                                                |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------ |
| GET    | `/api/health`         | Liveness, auth/`writeEnabled`, `decisionCount`, `moveQueue`, `quota`                                   |
| GET    | `/api/auth/login`     | Redirect to Google consent                                                                             |
| GET    | `/api/auth/callback`  | OAuth callback; stores the refresh token                                                               |
| GET    | `/api/videos?limit=`  | Next _n_ **undecided** playlist videos (1–50, def 10)                                                  |
| GET    | `/api/playlists`      | Your playlists + IDs, for picking the source                                                           |
| POST   | `/api/decisions`      | `{ videoId, action: "keep"\|"move"\|"watch" }` — records a decision; `move` also queues a YouTube move |
| POST   | `/api/decisions/undo` | Reverses the most recent decision; a reverted `move` queues a revert                                   |

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
