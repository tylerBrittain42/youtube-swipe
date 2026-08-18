# Implementation Plan

High-level plan for building `youtube-swipe`. See [design.md](design.md) for the product spec.

---

## 0. Blocking finding: Watch Later is not reachable via the API

The YouTube Data API **cannot read the Watch Later (`WL`) or History (`HL`) playlists.** Google closed this
in September 2016: `playlists.list` and `playlistItems.list` return an *empty list* for `WL`/`HL`, even for
the authenticated owner. There is no scope, no consent screen, no workaround — short of scraping the site
with a browser session cookie, which is against YouTube's ToS and breaks constantly.

**Recommended adaptation:** operate on a normal playlist instead. Create a playlist called e.g. `Triage`,
and drag Watch Later into it once (YouTube's web UI can do this in bulk). All the interesting
behavior — swipe, keep, move-downstream, watch-now — works identically on a normal playlist. The design
doc's "assume it is the watch later playlist for now" becomes "playlist ID is configurable, defaults to
your triage playlist."

This is worth accepting up front rather than discovering it in week two.

---

## 1. Tech stack

| Layer | Recommendation | Why |
| --- | --- | --- |
| **Frontend** | SolidJS + TypeScript, built with Vite — **plain SPA, static build** | Tiny runtime (~7kb, no VDOM) on a UI you'll use over cellular; Vite is the least-config option. See §1.1 for why no SolidStart |
| **Gestures/animation** | `solid-motionone` + `solid-gesture` (or `@use-gesture/vanilla`) | Drag physics, velocity thresholds, and fling-away animation without hand-rolling pointer math |
| **Styling** | Tailwind CSS | Fast to iterate, no naming decisions, good mobile defaults |
| **Backend** | Node + TypeScript with Fastify | One language across the stack; Fastify has first-class TS types and schema validation |
| **Persistence** | SQLite (`better-sqlite3`) | Single file, zero infra, and you need it (see quota section) |
| **Google client** | `googleapis` npm package | Official, handles OAuth token refresh for you |
| **Testing** | Vitest (both sides) + Playwright for one end-to-end swipe test | Gives Claude Code something to verify against — see §7 |

**Alternative worth considering:** if you'd rather write the backend in Python, FastAPI +
`google-api-python-client` is an equally good path. Pick based on which language you want the practice in.
Everything below is stack-agnostic apart from the exact package names.

**Deliberately not included:** no meta-framework (see §1.1), no state-management library (a card queue is a
Solid store at most), no Docker until §6.

### 1.1 Why a plain SPA and not SolidStart

`vite build` emits `index.html` + JS/CSS that any static host will serve. That is all this app needs, and
it's worth being explicit about why the fancier option is wrong here.

**SSG buys nothing for this app.** Prerendering pays off when content is known at build time. Ours is
per-user, auth-gated, and fetched at runtime — prerendering would produce an empty shell that then does all
the real work client-side. That's a SPA with extra build steps. There's no SEO argument either; it's a
private tool.

**SolidStart is the least stable part of the stack.** Solid core is mature; SolidStart has churned (v1 → v2
moved to Vite's Environment API). Adopting it for capabilities we don't need means importing that
instability for free. Its LLM training data is also much thinner than plain Solid's, which compounds the
footgun in §7.

If a public landing page ever matters, add [Astro with Solid islands](https://docs.astro.build/en/concepts/islands/)
alongside the app then. That's additive, not a migration.

### 1.2 Solid + heavy AI assistance: one rule

Claude and Copilot both pattern-match to React and will write `const { video } = props`. Destructuring props
**silently severs Solid's reactivity** — no error, the UI just stops updating. Put "never destructure props
in Solid components" in `CLAUDE.md` on day one, and prefer `props.video` everywhere. This is the main tax
for choosing Solid; it's manageable, but only if you know to watch for it.

---

## 2. Architecture

```
┌─────────────┐   REST/JSON    ┌──────────────┐   OAuth2   ┌──────────────┐
│  Solid SPA  │ ─────────────► │   Fastify    │ ─────────► │  YouTube     │
│ (static)    │ ◄───────────── │   backend    │ ◄───────── │  Data API v3 │
└─────────────┘                └──────┬───────┘            └──────────────┘
                                      │
                                 ┌────▼─────┐
                                 │  SQLite  │  cached video metadata,
                                 │          │  decision log, pending
                                 └──────────┘  move queue, oauth tokens
```

The SPA never sees a Google token. The backend owns OAuth entirely and exposes a small, boring REST API
that any other frontend could implement against — which is the extensibility goal from the design doc.

### Suggested API contract

A refinement of the endpoints in the design doc. The main change: collapse `keep`/`move` into one
`decision` endpoint so adding a fourth swipe direction later is a new enum value, not a new route.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness, and whether we're authenticated |
| `GET` | `/api/auth/login` | Redirects to Google consent |
| `GET` | `/api/auth/callback` | OAuth callback, stores refresh token |
| `GET` | `/api/videos?limit=10` | Next *n* undecided videos (id, title, thumbnail, channel, duration, url) |
| `POST` | `/api/decisions` | `{ videoId, action: "keep" \| "move" \| "watch" }` |
| `POST` | `/api/decisions/undo` | Reverses the last decision — you *will* misswipe |
| `GET` | `/api/playlists` | So the UI can pick source + downstream playlists |

`GET /api/videos` should return everything needed to render a card, so the frontend never makes a second
call per card.

### The quota constraint shapes the design

The YouTube Data API gives you **10,000 quota units per day** by default. Reads are cheap (`playlistItems.list`
is 1 unit per page of 50). Writes are expensive: **50 units each**, and "move a video" is
`playlistItems.insert` + `playlistItems.delete` = **100 units**. That caps you at roughly **100 moves per
day** — very reachable in one enthusiastic triage session.

Design consequences, all of which are why SQLite is in the stack:

1. **Cache playlist contents locally.** Page through the playlist once, store it, serve cards from SQLite.
2. **Record decisions locally first, sync to YouTube asynchronously.** A `pending_moves` table drained by a
   background worker. The UI stays instant and never blocks on Google.
3. **Make `keep` free.** It's a local row; it costs zero quota. (The design doc already has this instinct.)
4. **Surface remaining quota in the UI** so you know when you're near the ceiling, and degrade to
   "decisions queued, will sync tomorrow" rather than erroring.

If you outgrow 10k/day you can request more from Google, but the local-first design means you probably won't.

---

## 3. Infrastructure setup

Do this before writing code — it's the part most likely to have a surprise, and it's mostly clicking.

1. **Create a Google Cloud project** at [console.cloud.google.com](https://console.cloud.google.com).
2. **Enable the YouTube Data API v3** for that project (APIs & Services → Library).
3. **Configure the OAuth consent screen**: User type *External*, add yourself as a test user.
4. **Create an OAuth client ID** of type *Web application*, with redirect URI
   `http://localhost:8080/api/auth/callback`.
5. **Scopes**: request `youtube.readonly` for milestone 2, and add `https://www.googleapis.com/auth/youtube`
   (or the narrower `youtube.force-ssl`) when you start writing in milestone 4. Ask for the minimum until
   you need more — re-consenting is one click.
6. **Know the 7-day token gotcha.** While your consent screen is in *Testing* status, Google expires refresh
   tokens after **7 days**, so your app will silently stop working every week. Two ways out: publish the app
   to *Production* (you'll click through an "unverified app" warning, but tokens stop expiring), or just
   re-run the login flow weekly. For a personal tool, publishing to Production is worth it. Full formal
   verification is only needed if other people use it.
7. **Secrets hygiene**: `.env` for client ID/secret, `.env.example` checked in, `.env` and `*.sqlite` in
   `.gitignore` from the first commit.

**Decide this before M2: where the static bundle is served from.** A static frontend on one origin
(`*.pages.dev`) talking to a backend on another makes your session cookie a **third-party cookie** — Safari
blocks those outright and Chrome restricts them. Your login would silently stop persisting on exactly the
device this app is for. Three ways out, pick one at M2:

1. **Same origin (recommended):** Fastify serves the built `web/dist` as static files. One origin, no CORS,
   no cookie problem. Costs nothing and doesn't compromise decoupling — the frontend is still a standalone
   static bundle that any other host could serve.
2. Frontend and backend on subdomains of one domain you own, with a cookie scoped to the parent.
3. Bearer token held in memory, not a cookie — but then it's lost on every refresh.

**Hosting:** don't. Run it on localhost first. When you want it on your phone (which is where swiping
actually makes sense), the cheapest good option is [Tailscale](https://tailscale.com) — put your laptop and
phone on the same tailnet and hit the dev server directly, no deploy, no public exposure, no OAuth redirect
juggling. Only reach for Fly.io / Railway / a Docker box if you want it running when your laptop is closed.

---

## 4. Milestones

Ordered so that something works end-to-end early, and the risky Google integration is isolated.

### M0 — Scaffolding
- Vite + Solid + TS frontend in `web/`, Fastify + TS backend in `api/` — sibling directories in this repo,
  each with its own `package.json`. **No npm workspaces** (they hoist a shared `node_modules` and assume both
  halves are Node) and **no `shared/` types package** — the frontend hand-writes its types against the
  contract in §2. That duplication is load-bearing: it's what proves the frontend isn't coupled to *this*
  backend. `api/` doesn't need to exist until M2.
- Vitest + Prettier + ESLint wired up, with `test` and `typecheck` scripts that run and pass with zero tests.
- Update `CLAUDE.md` with the real build/test/lint commands once they exist (see §7).
- **Done when:** `npm run dev` in `web/` serves the app and `npm run build` emits a static `dist/`.

### M1 — Swipe UI against a mock API
Build the whole frontend before touching Google. Serve `GET /api/videos` from a hardcoded JSON fixture.
- Card component: thumbnail, title, channel, duration.
- Drag with velocity + distance thresholds; snap back if under threshold, fling off if over.
- Left / right / up map to distinct actions; up opens `youtube.com/watch?v=…` in a new tab.
- Card stack — render the next 2–3 cards behind the top one so it feels continuous.
- Keyboard arrows as well as touch. You'll want them on desktop and they make testing far easier.
- Empty state, loading state, and an undo button.
- **Done when:** you can swipe a deck of 10 fake videos on your phone and it feels good. This is the
  milestone that determines whether the product is fun; spend time here.

### M2 — Real OAuth + read path
- **First, settle the origin question from §3** — same-origin serving is the default recommendation.
- `/api/auth/login` + `/callback`, refresh token persisted to SQLite.
- `GET /api/playlists` and playlist-content sync into SQLite.
- Swap the fixture for real data. Frontend should require **zero** changes — if it does, the contract leaked.
- **Done when:** your real triage playlist renders as cards.

### M3 — Decisions, local only
- `decisions` table, `POST /api/decisions`, `POST /api/decisions/undo`.
- `GET /api/videos` excludes already-decided videos.
- Prefetch: fetch the next batch when fewer than ~3 cards remain.
- **Done when:** decisions survive a page refresh and you never see the same card twice.

### M4 — Write path to YouTube
- Broader OAuth scope; `pending_moves` queue with a background drainer.
- Insert into downstream playlist, then delete from source — **in that order**, so a crash mid-move
  duplicates rather than loses a video.
- Idempotency: retrying a move must not double-insert. Track per-move state, not just "pending/done".
- Quota tracking + graceful degradation when exhausted.
- **Done when:** a right-swipe actually relocates the video in YouTube, and killing the server mid-queue
  loses nothing.

### M5 — Polish
- Playlist picker for source + downstream, persisted.
- Session summary ("42 kept, 17 moved").
- PWA manifest so it installs to your home screen.
- Phone access via Tailscale.

---

## 5. Risks

| Risk | Mitigation |
| --- | --- |
| Watch Later inaccessible | Use a normal playlist (§0). Decided already. |
| 10k/day quota | Local-first writes, queue + drain (§2). |
| 7-day refresh token expiry | Publish consent screen to Production (§3.6). |
| Swipe feel is fiddly on mobile | M1 exists specifically to de-risk this before any backend work. |
| Mid-move crash loses a video | Insert-before-delete + idempotent queue (M4). |
| Third-party cookie blocking kills the session on mobile | Serve the static bundle same-origin from Fastify (§3). |
| AI tools write React idioms that silently break Solid reactivity | `CLAUDE.md` rule + never destructure props (§1.2). |
| Scope creep into recommendations/ML | The design doc is explicit that downstream is a no-op for now. Keep it that way. |

---

## 6. Suggested first commits

1. `chore: scaffold vite + solid frontend in web/`
2. `chore: add eslint, prettier, vitest`
3. `feat(web): static video card component`
4. `feat(web): drag-to-swipe with fixture data`

Scaffold with `npm create vite@latest web -- --template solid-ts`.

---

## 7. Working effectively with Claude Code

You mentioned you're new to Claude Code — these are the practices that matter most for a project like this,
roughly in order of payoff.

**Give Claude a way to verify its own work.** This is the single highest-leverage habit. Claude stops when
work *looks* done; without a check it can run, you become the verification loop. Set up `npm test` and
`npm run typecheck` in M0 so that from then on you can say *"implement X, then run the tests and fix
failures"* and walk away. For UI work, the [Chrome integration](https://code.claude.com/docs/en/chrome)
lets Claude screenshot the result and compare it against a target.

**Keep CLAUDE.md short and factual.** Right now yours is a placeholder. Once M0 lands, put in it the things
Claude can't infer: the dev/test/lint commands, the frontend↔backend contract rule, "never commit `.env`",
the quota constraint. Prune ruthlessly — a bloated CLAUDE.md causes Claude to ignore the rules that matter.
Run `/init` to generate a starter from your actual structure. [Docs](https://code.claude.com/docs/en/memory)

**Explore → plan → code.** For anything touching multiple files (the OAuth flow, the move queue), start in
plan mode (`Shift+Tab` until you see `⏸ plan mode on`) and get a plan before any edits. For a one-line fix,
skip it — plan mode has real overhead.
[Docs](https://code.claude.com/docs/en/permission-modes#analyze-before-you-edit-with-plan-mode)

**`/clear` between unrelated tasks.** Performance degrades as context fills. Finished the swipe UI and moving
to OAuth? `/clear` first. And if you've corrected Claude twice on the same thing, don't correct a third
time — `/clear` and rewrite the prompt with what you learned.

**Let Claude interview you before big features.** For M4 especially, try: *"I want to build the move queue.
Interview me in detail using the AskUserQuestion tool — ask about edge cases and tradeoffs I might not have
considered, then write a spec."* Then implement from the spec in a fresh session.

**Use subagents for investigation.** *"Use a subagent to figure out how googleapis handles token refresh"*
keeps hundreds of lines of file reads out of your main context.

**Review in a fresh context.** After Claude implements something substantial, run `/code-review`, or open a
second session and ask it to review the diff. A fresh context isn't biased toward code it just wrote.

**Checkpoints make experiments cheap.** Every prompt is a checkpoint; `Esc Esc` or `/rewind` restores
conversation and/or code. Try the risky approach — you can always rewind.

Primary reference: [Claude Code best practices](https://code.claude.com/docs/en/best-practices).
Also useful: [common workflows](https://code.claude.com/docs/en/common-workflows),
[skills](https://code.claude.com/docs/en/skills) (for repeatable project-specific workflows),
[hooks](https://code.claude.com/docs/en/hooks-guide) (for things that must happen every time, like running
the linter after every edit).
