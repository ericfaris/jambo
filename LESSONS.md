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
