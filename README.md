# youtube-swipe

**Disclaimer: I am using this project as an excuse to grow my familiarity with AI tooling and will thus heavilly use Claude and Copilot**

A Tinder-like swiping interface for trimming down a YouTube playlist (e.g. Watch Later).

- [docs/design.md](docs/design.md) — product spec and API notes
- [docs/implementation-plan.md](docs/implementation-plan.md) — tech stack, infra setup, and milestones

## Development

Currently frontend-only (`web/`), built against mocked data — no backend yet.

Requires Node 22+.

```bash
cd web
npm install
npm run dev        # start the dev server
npm test           # run the Vitest suite once
npm run typecheck  # tsc, no emit
npm run lint       # eslint
npm run format     # prettier --write
npm run build      # typecheck + static build to web/dist
```
