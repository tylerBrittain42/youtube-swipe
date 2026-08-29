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
   and `YOUTUBE_PLAYLIST_ID` (run `GET /api/playlists` once authed to find IDs, or
   copy the `list=` param from the playlist's YouTube URL).

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

## Endpoints

| Method | Path                  | Purpose                                                                          |
| ------ | --------------------- | -------------------------------------------------------------------------------- |
| GET    | `/api/health`         | Liveness, auth state, and `decisionCount`                                        |
| GET    | `/api/auth/login`     | Redirect to Google consent                                                       |
| GET    | `/api/auth/callback`  | OAuth callback; stores the refresh token                                         |
| GET    | `/api/videos?limit=`  | Next _n_ **undecided** playlist videos (1–50, def 10)                            |
| GET    | `/api/playlists`      | Your playlists + IDs, for picking the source                                     |
| POST   | `/api/decisions`      | `{ videoId, action: "keep"\|"move"\|"watch" }` — records a decision (local only) |
| POST   | `/api/decisions/undo` | Reverses the most recent decision                                                |

Decisions are stored in SQLite only; nothing is written back to YouTube yet (that's M4).

`.env` and `*.sqlite` are gitignored — never commit them.
