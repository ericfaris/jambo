# Lessons Learned

## 2026-09-25 — Hard/Expert AI was reading hidden opponent state

Context: an Opus-model review of the AI difficulty tiers (spawned via a
model-overridden subagent) found Hard/Expert scored candidate moves by
running `processAction`/`evaluateBoard` against the true `GameState`, which
includes the opponent's real hand and real deck order. This let them "know"
whether a Guard/Rain Maker would cancel a move, and let Expert's Monte Carlo
rollouts play out real future draws — a genuine information-leak advantage,
not skill.

Fix: `src/ai/determinize.ts` reshuffles what the acting player can't see
(opponent hand + deck, counts preserved) before scoring, on branch
`ai-fair-information`.

**Gotcha**: the first version shuffled `[...opponentHand, ...state.deck]`
directly. Fisher-Yates shuffle output depends on the *input array's order*,
not just its contents — so two states with an identical set of unseen cards
but a different true hand/deck split could still shuffle to different
results, quietly re-leaking a smaller signal correlated with the true
arrangement. Any "reshuffle the unseen cards" fix needs to sort/canonicalize
the pool *before* shuffling, or the fix is incomplete. Caught this by
writing a regression test that builds two states with the same card pool
but a swapped hand/deck split and asserting the AI's chosen move is
identical between them — then verified the test actually fails without the
`.sort()` by temporarily reverting it.

**Balance impact**: Expert vs Hard combined win rate dropped from 70.5% to
58.5% once the leak was closed — most of Expert's prior edge over Hard was
exploiting hidden information, not deeper search. Worth remembering before
assuming any AI benchmark swing is a bug: check whether the "stronger" tier
was cheating first.

## 2026-10-03 — UI playtest (5 games via Playwright driver)

Built `.claude/skills/game-playtest/scripts/driver.py`. It plays real games
through UI clicks, using the engine AI to pick the human's moves, and found
bugs that 294 unit tests missed:
- **Crocodile on an interactive utility (Drums, Boat…) lost the Crocodile
  card** (110 → 109). The inner `UTILITY_EFFECT` replaces `pendingResolution`,
  so post-resolution cleanup discarded based on the *utility's* sourceCard.
  Now `crocodileCleanup.crocodileCardId` carries it. Any resolver that
  swaps in an inner pending resolution has to carry the outer source card
  forward explicitly.
- **Portuguese on an empty market stalled the UI**. The resolver guard
  existed, but the validator and the UI Continue (prongs 1 and 4) were
  missing. Having one prong out of four isn't enough.
- **Hotseat Multiplayer froze whenever the non-active player had to
  respond** (Guard, Rain Maker, auctions, drafts…). The viewer was
  `currentPlayer`. It is now `getResponder(state)` from
  `src/engine/responder.ts` (which also de-duplicates 3 copies).
- The AI played its first turn behind the first-run tutorial. Replays
  didn't record the starting player.

**Gotcha (driver)**: an HMR update mid-run splits module instances, so a
page loaded afterwards gets a different `useGameStore` than
`import('/src/hooks/useGameStore.ts')` returns. I lost a whole batch of 3
games to phantom "AI stalls" before noticing. Restart Vite before a batch,
don't edit `src/` during one, and keep the store/DOM desync guard.
Playwright's fake clock also freezes rAF, so `locator.click()` hangs; click
by coordinates with an `elementFromPoint` occlusion check instead.

## 2026-10-03 — Audit against the official rulebook

The official Rio Grande rules PDF is gone from their site but the Internet
Archive has it (`Game_120_gameRules.pdf`, 2012 snapshot). It has **no
per-card texts** ("exceptions are noted in the text of the cards"), so card
effects can only be cross-checked against reviews and summaries. The Kosmos
German PDF on retailer sites is image-only (render it and read the pages).

Real rule bugs found only by reading the rulebook rather than our docs:
6th large-stand space costs 2g each fill (constant existed, never used);
first small stand is 6g *per game*, not per player; "not enough room → take
what fits, rest stays in supply" (we blocked cards / destroyed Elephant
picks); no hand limit. Our own docs had drifted (CLAUDE.md said 5-card
limit) — treat the rulebook as source of truth, not CLAUDE.md.

**Gotcha**: a stricter `addWaresToMarket` (throws if gold < fee) surfaced a
latent bug — Traveling Merchant's automatic 1g opening bid let a 0g player
win and go to −1g. The AI benchmark's `stallReasons` in
`reports/ai-benchmark/*.json` pinpointed it; always read them when `stalls`
is non-zero. (And `git checkout` those report files afterwards — the bench
overwrites tracked files.)

## 2026-10-03 — Phone player view must never scroll (UI polish pass)
- **Size cards from the measured box, don't hard-code a scale.** The Cast
  `PlayerScreen` used fixed `cardScale=1.25` + a two-row layout, which only
  looked right at 5 cards on one phone. `fitCardsToBox()` (`src/ui/fitLayout.ts`)
  plus a `ResizeObserver`-measured board now fits 0–24 cards at 360×640+.
  Choose layouts by *visible* area `(w − overlap) × w`, not raw card width,
  or the solver picks one huge, mostly-buried row.
- **Gotcha: overlap can go negative.** When cards fit edge-to-edge but not
  with the gap, `(n·w − W)/(n−1)` is negative → the gap was applied and the row
  overflowed by a few px. Tighten the gap first; clamp overlap at 0. The
  1–24-card × 3-box test sweep caught it. A `minScale` floor also silently
  reintroduced overflow for 16+ cards; keep the floor low (0.3).
- **Gotcha: flex `gap` stacks with negative-margin overlap.** `UtilityArea`
  applied both; pass `gapPx=0` whenever `overlapPx > 0`.
- **Buttons on linen were unreadable** (cream on cream, 1.07:1). Fixed with a
  context rule (`.linen-texture button…`) instead of per-button inline color.
- **`/?player=1` dev preview** renders `PlayerScreen` from the local store
  (`hand=N&utils=N&phase=play`) — much faster than standing up the WS server
  and joining a room to test phone layouts. Stage by moving cards out of the
  deck so `checkInvariants()` still passes.
- 2026-10-04 follow-up: solo `GameScreen` got the same treatment behind a
  `(max-width: 640px)` media query, reusing every overlay. Measure the hand
  box itself rather than estimating it from the board — estimates drift
  whenever a hint/banner line appears. And a fit solver needs an explicit
  "at the floor, overlap harder" branch, or the worst case (20 cards + two
  21-slot markets on 360×640) silently overflows. Stage extreme states in
  Playwright via `await import('/src/hooks/useGameStore.ts')` +
  `stagePreviewState()` instead of playing into them.

## 2026-10-04 — Cancel a just-started card/utility
- Undo by **descriptor, not snapshot**: `cancellableAction` records only what
  to reverse (`utilityIndex`, or `cardId` + `handIndex`). A full pre-action
  `GameState` snapshot would ride along to Cast clients and leak the
  opponent's hand/deck. Exactness relies on "nothing else changes between
  starting the action and its first choice" — Scale breaks that once it
  draws, so its first step is "SELECT_CARD with no selectedCards".
- Keep it out of `getValidActions()`: an AI that can cancel will happily loop
  activate → cancel → activate.
- Make the new GameState field optional and only write it when it changes,
  so old saved states / replays and every existing deep-equality test keep
  passing.

## 2026-10-04 — TypeScript 7 + Vite 8
- **TS 7's npm package has no classic JS compiler API** (`main` only exports
  the version), so typescript-eslint (≤ TS 6.0) crashes if `typescript` is 7.
  npm `overrides` can't fix it — they don't apply to peer deps. Working setup:
  `typescript@~6.0` for tooling + `"typescript7": "npm:typescript@^7"` called by
  path in `npm run typecheck`. Bins don't collide in practice (`.bin/tsc` →
  TS 6). Revisit when typescript-eslint supports TS 7.
- Vite 8 = Rolldown: Rollup is gone from the tree, so the Dockerfile's
  `@rollup/rollup-linux-x64-musl` workaround was removed — the lockfile now
  carries `@rolldown/binding-linux-x64-musl` itself. `build.rollupOptions` →
  `rolldownOptions`; `__dirname` in vite.config → `import.meta.dirname`.
- Proved the 0.2s TS 7 check is real by planting a type error.

## 2026-10-04 — Sound effects
- Generate 3 takes per SFX and pick by measurement, not by ear: ~1 in 9 takes
  was a near-silent dud (-48/-55 LUFS), and "short" prompts still returned
  2–7s clips. ffmpeg `ebur128` + `showwavespic`/`showspectrumpic` contact
  sheets made the picks obvious (single transient vs. multi-hit vs. ringing).
- Don't `loudnorm` sub-second clips — its integrated measurement is unreliable
  that short and the true-peak cap left transients 8 dB apart. Peak-normalize
  each clip to a chosen level instead (mix intent in DESIGN.md › Sound).
- Trim the lead-in: generated swishes often swell late, which makes the sound
  lag the click by ~300ms.
- SFX were Cast-only for months because the files never existed *and* solo
  never called the player. `detectAudioEvent()` now lives in
  `src/multiplayer/audioEvents.ts` and drives both paths; a test asserts every
  mapped file exists, so a missing file can't go unnoticed again.
- Shell gotcha: `pkill -f "<pattern>"` inside a Bash call can match that same
  call's command line and kill it (exit 144). Kill by port's pid instead.

## 2026-10-04 — Refresh no longer kills a game
- Solo/hotseat state lived only in the Zustand store. Autosave the full
  `GameState` (not just the replay): a snapshot stays loadable across engine
  changes between deploys, while a replay can diverge. Validate on load with
  `checkInvariants()` and discard anything that fails.
- Two storages on purpose: the save in `localStorage` (survives closing the
  tab → "Resume Game"), the "was mid-game" flag in `sessionStorage` (per tab →
  a refresh skips the menu, but a second tab doesn't hijack the game).
- **Server bug found on the way**: `removeConnectionFromRoom` deleted a room
  as soon as `connections` hit 0, right after reserving the leaver's seat. In
  AI Cast games the human is the *only* WebSocket (the TV uses SSE), so one
  refresh destroyed the game server-side and the reconnect token was useless.
  Rooms now live until every reservation expires (`roomLifecycle.ts`).
- The Cast client already kept reconnect tokens per tab, but not *which*
  room — after a refresh it had nothing to rejoin. It now remembers the room
  and rejoins on socket open; "Room not found"/"Room is full" forgets it so a
  dead room can't cause a retry loop.

## 2026-10-04 — Playtest session (3 driver batches, 23 games + manual Cast/refresh)
- **Real bug — phone layout broke after the tutorial or the hotseat
  pass-device screen.** `useElementSize` attached its ResizeObserver once on
  mount via `useRef`; GameScreen first renders those other screens, so the
  board mounted later, stayed 0×0, and `fitCardsToBox` fell back to *max*
  scale → oversized, overflowing cards. Fix: a callback ref (observe whenever
  the node changes) + the solver now returns *min* scale for an unmeasured
  box. Rule: measuring hooks must use callback refs when the target can mount
  after the component does.
- **UX gaps fixed:** auctions now stay visible read-only while the AI bids
  (like drafts); resolve-panel art is capped at 45vh on tall screens too, so
  Confirm doesn't fall below the fold at 900px.
- **Most findings were driver artifacts** — always confirm a finding by
  replaying to that exact action (bisect `game<N>.replay.json` with tsx), then
  reproducing in a real-clock browser, before "fixing" the game. Three Draw/
  Keep "gaps" all came from the frozen fake clock; the auction ones from a
  stale responder copy in the driver.
- Running the driver with exploration also stress-tested Cancel for free:
  ~2,300 play→cancel cycles, invariants checked every step, zero violations.
