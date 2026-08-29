# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`youtube-swipe` is a Tinder-like swipe UI for triaging a YouTube playlist. See
[docs/design.md](docs/design.md) and [docs/implementation-plan.md](docs/implementation-plan.md) for the
full spec, stack rationale, and milestones. Currently in M2: real OAuth + read path.

## Structure

- `web/` — SolidJS + TypeScript SPA, built with Vite (`npm create vite@latest -- --template solid-ts`), static build only, no SolidStart.
- `api/` — Fastify + TypeScript backend. Owns Google OAuth, caches the playlist in SQLite
  (`better-sqlite3`), serves the read API. See [api/README.md](api/README.md).

`web/` and `api/` are independent packages — no npm workspace, no shared types package. The
frontend hand-writes its types (`web/src/types.ts`) against the API contract in
implementation-plan.md §2; keeping that duplication is deliberate (proves the frontend isn't
coupled to this backend). If a change to `api/` forces a change to `web/src/types.ts`, the
contract leaked.

## Commands

Run from `web/` or `api/` — both expose the same script names:

- `npm run dev` — dev server (`web` on :5173, `api` on :8080)
- `npm run build` — `web`: static build to `web/dist`; `api`: `tsc` to `api/dist`
- `npm test` — run Vitest once
- `npm run typecheck` — `web`: `tsc -b --noEmit`; `api`: `tsc --noEmit`
- `npm run lint` — ESLint
- `npm run format` — Prettier write

In dev, run both: `api` serves the API, and Vite proxies `web`'s `/api/*` to `:8080`. In prod,
Fastify serves the built `web/dist` same-origin.

## Backend notes

- **Never commit `.env` or `*.sqlite`** — both are gitignored. `api/.env.example` is the template.
- YouTube Data API quota is 10k units/day; reads are cheap, writes are 50 each. The playlist is
  synced into SQLite and cards are served from there — don't call the YouTube API per request.
- Log in once by visiting `http://localhost:8080/api/auth/login` in a browser; the refresh token
  persists in `api/data/app.sqlite`.
- Decisions (`POST /api/decisions`) and the write path to YouTube are M3/M4 — not built yet.

## Solid-specific rule

**Never destructure props** (`const { foo } = props`) — it silently severs Solid's reactivity with no
error. Always use `props.foo`. This is enforced by `eslint-plugin-solid`'s `no-destructure` rule
(`npm run lint` will catch it), but don't rely on the linter alone — write `props.x` from the start.
