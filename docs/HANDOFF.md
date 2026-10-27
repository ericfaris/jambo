# Handoff

Last reviewed: 2026-10-27 · Scope: current state for whoever picks this up next.
Rules, architecture and conventions live in `CLAUDE.md`; history lives in
`LESSONS.md` and git.

## What it is / where it runs

Digital Jambo (2-player trading card game): solo vs four AI traders,
Play a friend (online rooms), and Chromecast TV.

- Prod: `https://jambo.mooseflip.com`, the `jambo-app-1` container on the local
  Docker lab (`127.0.0.1:8500` → container `3001`), behind a Cloudflare Tunnel.
- Deploy: push to `main` → `.github/workflows/ci-cd.yml` (typecheck/test/build) →
  self-hosted `lab` runner asks Sentinel (`:7891/api/deploy`) to rebuild. Manual:
  the `deploy` skill.
- Version: `package.json` (1.31.0, shipped 2026-10-27: pass-and-play removed); bump with
  `npm run version:bump` / `version:minor` when shipping.

## Commands

Run via `zsh -i -c "…"` (nvm).

- `npm run typecheck` (TS 7), `npm test` (Vitest), `npm run lint`, `npx vite build`
- `npm run fuzz -- 500`, `npm run ai:bench:short`
- Cast TV playtest (no Chromecast): server `PORT=3031 MONGODB_URI= npm run server`,
  Vite `JAMBO_API_PORT=3031 npx vite --port 5180`, then
  `python3 scripts/e2e/cast-tv.py <ai|pvp> [games] [seed] [outdir] [vite] [paceMs]`
  (real receiver page + fake CAF; bots play over WS; checkpoints compare the TV
  with `/api/cast/public-room`). An AI-room game takes ~15–20 min.
- Playtest: `game-playtest` skill (`.claude/skills/game-playtest/scripts/driver.py`).
  Server on :3031 against the test DB, Vite on :5180 with `JAMBO_API_PORT=3031`.
  `PT_PANELSHOTS=1` screenshots each panel once it settles, for copy review.

## Config not in git

`.env` (names only): `MONGODB_URI`, `MONGODB_DB`, `MONGODB_TEST_URI`,
`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `APP_BASE_URL`, `VITE_CAST_APP_ID`,
`RESEND_API_KEY`, `TURNSTILE_SITE_KEY/SECRET_KEY`. Playtests must use
`MONGODB_TEST_URI` + `MONGODB_DB=jambo-test` (or `MONGODB_URI=`), never prod.

## Open items (priority order)

0. **Watch a real Cast game on the TV** with the 1.30.0 board (playtested only
   headlessly at 1280×720 with a fake CAF; old Chromecast Chrome ignores the
   few `:has()`/`color-mix()` rules — decorative only). Cast from Android
   Chrome works since 1.29.1 (SDK warm-up).
1. "More below ↓" pill flashes briefly while a resolve panel pops in
   (`ResolveMegaView.tsx`); harmless, but could wait for the pop animation.
2. Resolve breadcrumbs (`formatResolutionBreadcrumb`) still say "Opponent discard
   to 3" etc. in the eyebrow; panel prompts name the seat.
3. Tribal Elder "opponent discards to 3" is offered even when it does nothing (the
   opponent already has ≤3 cards); the panel now explains it, but validation could
   warn before the action is spent.
4. The red "DISCARD" pick stamp (`selectedMark` on `SelectableCardArea`) and the
   `SelectionCounter` pill are only on the Tribal Elder discard so far; other
   multi-card pickers (Kettle etc.) still use the thin gold ring and could adopt
   them. Preview: `/?online=1&slot=0&stage=tribalelder`.

## Decisions that may get revisited

- Pass & play (local hotseat) was removed 2026-10-27 — not going to be used.
  Local play is solo only; both-seats-human testing goes through the driver's
  `online` mode. Old `mode: 'multiplayer'` saves are discarded on load, the
  abandon API rejects that mode, and legacy stats/abandon rows may still carry it.
  `viewer: null` / "Player 1/2" label paths remain for the TV.

- Panels name the other seat everywhere (trader name / "Player 2" / friend);
  only Cast keeps the generic "opponent". Card face text stays as printed.
- The desktop hand fans into its measured width; it scrolls sideways at 12+ cards
  only when even half-overlapped cards don't fit.

## Gotchas

- The TV (`TVScreen`) is the desktop board with `viewer: null` (both seats
  watched): keep shared components' no-viewer paths working (`FlightLayer`,
  `CenterRow`, `TurnSweep`, `spotlitPlayer: 'both'`). TV spotlights are capped
  (`maxBacklog`) and take turns (`held`) because the TV can't pause the game.

- Cast sender SDK loads lazily, but `Router` calls `controller.prepare()` on
  mount and when the TV dialog opens. Don't drop that: loading the SDK on the
  tap itself opens Android Chrome's picker before any device is confirmed for
  the app id, so the TV is missing from the list.

- Never edit `src/` while driver games run (HMR splits the store → fake findings);
  restart Vite before each batch.
- Driver `res-*` screenshots are taken mid-fade; use `PT_PANELSHOTS` for review.
- Log lines are written from the actor's side and flipped to "you" for the viewer
  (`describeLogEntry`): avoid "opponent <verb>s" phrasing beyond has/is/was/does.
