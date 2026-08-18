# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`youtube-swipe` is a Tinder-like swipe UI for triaging a YouTube playlist. See
[docs/design.md](docs/design.md) and [docs/implementation-plan.md](docs/implementation-plan.md) for the
full spec, stack rationale, and milestones. Currently in M0/M1: frontend only, backend not started.

## Structure

- `web/` — SolidJS + TypeScript SPA, built with Vite (`npm create vite@latest -- --template solid-ts`), static build only, no SolidStart.
- `api/` — Fastify backend. Not created yet (starts at M2).

## Commands (run from `web/`)

- `npm run dev` — dev server
- `npm run build` — typecheck + static build to `web/dist`
- `npm test` — run Vitest once
- `npm run typecheck` — `tsc -b --noEmit`
- `npm run lint` — ESLint
- `npm run format` — Prettier write

## Solid-specific rule

**Never destructure props** (`const { foo } = props`) — it silently severs Solid's reactivity with no
error. Always use `props.foo`. This is enforced by `eslint-plugin-solid`'s `no-destructure` rule
(`npm run lint` will catch it), but don't rely on the linter alone — write `props.x` from the start.
