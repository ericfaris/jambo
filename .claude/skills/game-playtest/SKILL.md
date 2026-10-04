---
name: game-playtest
description: End-to-end playtest of Jambo by actually playing full games through the real UI — solo vs every AI difficulty, a two-browser PvP room over the WebSocket server, the cast TV view, rematch, tutorial — exercising every card/resolution type. Finds real bugs that unit tests miss (resolution stalls, UI panels with nothing clickable, desynced public/private state) and fixes them as it goes. Use when the user wants to stress-test, playtest, or "find bugs in" the game, or wants a full regression pass before a release.
---

# Game Playtest

Play real games of Jambo end-to-end through the browser to surface
integration bugs — the kind unit tests don't catch because they live in the
wiring between the engine, `InteractionPanel.tsx`, the Zustand store, the
WebSocket server, and `stateSplitter.ts`. Adapted from the vandal-preachers
`campaign-playtest` skill.

**Play it straight.** Don't take shortcuts a real player wouldn't. Make
real buy/sell decisions, play people/animal/utility cards, activate
utilities, react with Guard/Rain Maker, and play each game to `GAME_OVER`.
The bugs live in the realistic paths, not the happy-path minimum. The #1
historical bug class is the **resolution stall** (see CLAUDE.md "Stall
Prevention Pattern"), so drive every resolution type into its empty-state
edge case on purpose.

## 0. Before you start

- Confirm scope with the user if they haven't given it: how many games,
  which modes (solo / PvP / cast), and fix-as-you-go vs log-and-batch.
  Default to fix-as-you-go: stop, patch, verify, resume.
- Load the `frontend-testing` skill for the Playwright toolkit and pattern
  (`sync_playwright`, headless chromium, wait for `networkidle`).
- Open a running scratch file at `<scratchpad>/game-playtest-log.md` and
  log every bug the moment you spot it: what you did, what you expected,
  what happened, the suspected file, and the **seed / replay log** if you
  have one. That file is your paper trail even in fix-as-you-go mode, and
  it's what you summarize for the user at the end.
- Run `npm` / `npx` via `zsh -i -c "..."` so nvm loads.

## 1. Stand up the stack

1. **Keep the playtest off the production DB.** `.env` has the real Atlas
   `MONGODB_URI` with `MONGODB_DB=jambo`, and the server writes stats and
   AI telemetry there. `loadEnv.ts` never overrides an env var that's
   already set, so always start the server with an explicit override:
   `MONGODB_DB=jambo-playtest`. Alternatively, `MONGODB_URI=` disables
   Mongo entirely, which is fine unless you're testing stats or login.
   **Never run the playtest server without one of these overrides.**
2. Start both processes with `run_in_background: true` on the Bash tool.
   Never use `&`/`disown`: that detaches from the harness and the process
   dies silently.
   - `zsh -i -c "MONGODB_DB=jambo-playtest npm run server"` (:3001,
     WebSocket at `/ws`)
   - `zsh -i -c "npm run dev"` (Vite proxies `/api` and `/ws` to :3001;
     check the log for the port Vite picked)
   If a port is already bound, run `lsof -i :PORT` before assuming the
   start failed. An orphaned prior run may still be healthy, or prod's
   container may be on 8500 (it doesn't conflict with 3001).
3. Confirm the server log shows `Jambo Cast Server running`, then load the
   UI root in Playwright before you start playing.
4. Run a baseline `zsh -i -c "npx tsc --noEmit && npm test"` so you know
   which failures were already there before you started.

## 2. Drive games with the bundled driver

`scripts/driver.py` plays whole games through real clicks. The human seat's
moves come from the engine's own AI (plus epsilon-random exploration). Each
move is executed by clicking real DOM nodes, which `scripts/scan.js` labels
via React fiber props (cardId, ware type). Anything the UI can't express is
logged as `UI_GAP` (with a screenshot) and then dispatched straight to the
store so the game can continue. Every step also checks
`checkInvariants()`, `store.error`, AI stalls, and click occlusion.

```bash
PT_OUT=<scratchpad> python3 .claude/skills/game-playtest/scripts/driver.py \
  2 solo medium medium 0.25 202        # id mode ai human-policy eps seed
PT_OUT=<scratchpad> python3 .claude/skills/game-playtest/scripts/driver.py \
  5 hotseat medium medium 0.25 505     # both seats through the UI
```

It writes `game<N>.log`, `game<N>.json` (findings, stats, endgame),
`game<N>.replay.json`, and `shots/`. Several games can run in parallel
against one dev server. Run it with `run_in_background` in a single command
that ends in `wait`: detached `&` processes get killed.

**Driver gotchas (learned the hard way):**
- **Restart Vite before a batch, and never edit `src/` while games run.**
  An HMR update splits module instances, so pages loaded afterwards get a
  *different* `useGameStore` from the one the driver imports. The driver
  then reads a frozen store, and every finding becomes garbage (fake
  AI_STALLs and UI_GAPs). The driver aborts on a store/DOM turn mismatch
  (`DRIVER DESYNC`).
- It uses Playwright's fake clock (`page.clock`) to skip the 3s AI delay.
  The fake clock freezes `requestAnimationFrame`, so `locator.click()` hangs
  on its stability check. The driver clicks by coordinates after an
  `elementFromPoint` occlusion check instead, which is also how
  `CLICK_BLOCKED` findings (overlapping UI) are detected.
- `UI_GAP` / `CLICK_BLOCKED` include driver limitations. Confirm each one
  against its screenshot before calling it a bug.
- To replay a failure, bisect `game<N>.replay.json` with `processAction` +
  `checkInvariants` under `npx tsx` (the replay includes the starting
  player).

## 3. Instrument the browser (manual play)

- Capture `page.on('console')` and `page.on('pageerror')` for every page.
  Any uncaught error or React warning is a finding.
- **Stall detector:** after every action, wait for the UI to settle. If
  `pendingResolution` is set (on the human's turn, or during a DRAFT) and
  there is **no enabled clickable control** in the interaction panel (no
  selectable card/ware, no choice button, no Continue), that's a stall bug.
  The same goes for an AI turn that hasn't advanced in ~15s.
- Screenshot every resolution panel you see at least once (save to
  scratchpad). This is cheap evidence for UI bugs.

## 4. Playthrough checklist

Work through this in order. Each row is a real feature surface. Don't skip
a row because a nearby one worked: sibling code paths (per-resolver
guards, per-panel empty states) commonly diverge.

**Menu & setup**
- [ ] Main menu → Play Solo → PreGameSetupModal: each difficulty
      selectable
- [ ] First-player reveal shows and the correct player actually starts
- [ ] Tutorial overlay opens, steps through, and closes cleanly
- [ ] Settings (audio toggles persist across reload)

**Solo vs AI**: at least one full game per difficulty
- [ ] Easy, Medium, Hard, Expert, each played to `GAME_OVER`
- [ ] Endgame trigger: end a turn with ≥60g, the opponent gets exactly one
      final turn, the winner is correct, and the final-turn player wins ties
- [ ] EndgameOverlay shows the right scores and rematch/menu work

**Turn mechanics**
- [ ] Draw phase: discard-and-redraw up to the limit, then keep; each draw
      costs an action
- [ ] Buy and sell with each ware-card shape (6-ware, triple, pair+one,
      three-different), including a buy blocked by insufficient gold or
      empty supply, and a sell blocked by missing wares
- [ ] Small Market Stand: first (6g) and second (3g); market grows by 3
- [ ] No hand limit (official rules) — large hands stay playable; +1g bonus with 2+ unused
      actions
- [ ] Deck exhaustion → discard reshuffle (play a long game or seed for it)

**Every resolution type**: hit the normal path **and** the empty-state path
(empty hand, empty market, opponent has no utilities/wares, empty supply,
empty discard)
- [ ] People: Shaman, Psychic, Tribal Elder (both choices), Wise Man,
      Portuguese, Basket Maker, Traveling Merchant + Arabian Merchant
      (auction: bid, pass, outbid), Dancer, Carrier (both choices),
      Drummer (with and without a utility in the discard pile)
- [ ] Animals: Crocodile (→ inner UTILITY_EFFECT), Parrot, Hyena, Snake,
      Cheetah (both opponent choices)
- [ ] Drafts: Elephant / Ape / Lion. The panel stays visible and read-only
      during the opponent's pick, and the pool shrinks live
- [ ] Reactions: Guard cancels an animal (both cards discarded); Rain
      Maker takes the opponent's ware card. Test both as the human
      reacting to the AI **and** the AI reacting to the human
- [ ] Utilities, each activated at least once: Well, Drums, Throne, Boat,
      Scale, Mask, Supplies (pay-gold and discard paths), Kettle (1 and 2
      cards), Leopard Statue, Weapons. Also try a 4th utility (max 3) and a
      second activation in the same turn (should be blocked)

**Hotseat multiplayer**: the main menu's "Multiplayer" is a *local*
pass-and-play game on one screen (no server); the driver's `hotseat` mode
covers it
- [ ] The non-active player can answer everything aimed at them: Guard,
      Rain Maker, auction bids, draft picks, Cheetah, Tribal Elder discard,
      Carrier, Snake

**Networked PvP** exists only through the Chromecast flow (Setup →
Chromecast TV, phones join at `/#/play`): two `browser.new_context()`s
against the WebSocket server
- [ ] Host creates a room; Player B joins with the code
- [ ] Hidden info holds: each context sees only its own hand, and
      the opponent's hand count is right (check `stateSplitter.ts` if not)
- [ ] Reactions cross the wire: B plays Guard against A's animal
- [ ] Draft and auction alternate correctly between the two browsers
- [ ] Disconnect one context mid-game, then reconnect (reconnect token).
      The game resumes on the same turn
- [ ] Play to `GAME_OVER`; both vote rematch → a fresh game starts

**Cast / TV**
- [ ] `/?tv=1` dev TV preview renders without errors
- [ ] `/#/play` join flow works. Skip real Chromecast unless
      `VITE_CAST_APP_ID` is set (that's a documented limitation, not a bug)

**AI robustness** (cheap, run in background alongside the UI play)
- [ ] `zsh -i -c "npm run ai:bench:short"`: no thrown errors, no games
      hitting the turn cap, and win rates in line with the baseline in
      memory

## 5. Verify against the engine, not just the UI

The UI can render something the engine never did, or the reverse.

- After any suspicious state, pull the game state (store/replay log) and
  run `checkInvariants()` from `src/engine/validation/invariants.ts`: 110
  cards accounted for, gold ≥ 0, supply counts consistent.
- For a stall or wrong outcome, export the replay log
  (`src/persistence/replayLog.ts`) and reproduce it with `replayToState()`
  in a Vitest test. That test becomes the regression test for the fix.
- For PvP, compare both clients' public state. They must agree.

## 6. When you find a bug

1. Log it immediately in the scratch file: repro steps, expected vs.
   actual, seed/replay, and file/line if you can pin it down.
2. Find the root cause and don't patch a symptom. For a stall, check all
   four prongs: validator precondition, resolver guard **before** the
   response type check, an AI dummy response that is never `null`, and a
   UI Continue button.
3. Add a Vitest regression test (`tests/...`), then fix. Run
   `npx tsc --noEmit` and `npm test`, then re-run the exact step in the
   browser.
4. Keep playing. Don't let one fix derail the rest of the checklist.
5. If a bug can't be fixed cleanly in-session (it needs a design or rules
   decision, or touches auth/infra), log it and use the `create-issue`
   skill instead of forcing a rushed fix.

## 7. Playwright practicalities

- Prefer `page.get_by_role('button', name=X, exact=True)` over
  `button:has-text(X)`. `has-text` is a case-insensitive substring match.
- AI turns and animations take time (`src/ui/animationTimings.ts`). Wait
  on a state change (whose turn it is, the gold value, hand size), not
  fixed sleeps.
- Use a separate `browser.new_context()` per simulated player, not tabs in
  the same context, so each one gets its own WebSocket identity and
  reconnect token.
- To steer into specific card situations (Drummer with a utility in the
  discard pile, Snake with full tableaus), it's fine to try several seeds
  first, or to drive the engine directly in a script. The UI pass still
  has to cover the resulting panel.

## 8. Wrap-up

When the run ends (or the user calls time), report back:
- Games played per mode/difficulty, and which checklist rows were actually
  exercised. Call out anything skipped and why
- Every bug found, one line each, marked fixed or logged, with the commit
  or file:line for fixes and the regression test name
- Anything logged with `create-issue` instead of fixed, and why
- Confirm the background servers were stopped. Mention that
  `jambo-playtest` DB rows can be dropped if you used it
- Append a `LESSONS.md` entry if anything non-obvious turned up
