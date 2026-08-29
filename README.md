# youtube-swipe

**Disclaimer: I am using this project as an excuse to grow my familiarity with AI tooling and will thus heavilly use Claude and Copilot**

A Tinder-like swiping interface for trimming down a YouTube playlist (e.g. Watch Later).

- [docs/design.md](docs/design.md) — product spec and API notes
- [docs/implementation-plan.md](docs/implementation-plan.md) — tech stack, infra setup, and milestones

## Development

Two independent packages: `web/` (SolidJS SPA) and `api/` (Fastify backend).
Requires Node 22+.

### Frontend (`web/`)

```bash
cd web
npm install
npm run dev        # dev server; proxies /api/* to the backend on :8080
npm test           # Vitest, once
npm run typecheck  # tsc, no emit
npm run lint        # eslint
npm run format      # prettier --write
npm run build       # static build to web/dist
```

### Backend (`api/`)

```bash
cd api
npm install
cp .env.example .env   # then fill in Google OAuth creds + YOUTUBE_PLAYLIST_ID
npm run dev            # dev server on :8080
```

One-time: with the backend running, open <http://localhost:8080/api/auth/login>
once to authorize with Google. See [api/README.md](api/README.md) for the Google
Cloud setup and the full endpoint list.

Run both together in dev; in production Fastify serves the built `web/dist`
same-origin.
