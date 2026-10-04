# AI Difficulty Tuning Guide

This document describes the AI difficulty system, target win rates, and the tuning workflow.

## Goal

Each difficulty level should give a human player a distinct experience:

| Difficulty | AI Win Rate vs Human | Feel |
|---|---|---|
| Easy | ~30% | Beatable but not braindead. Makes basic trades, occasionally surprises. |
| Medium | ~50% | Competitive. Plays solid heuristics, misses subtle combos. |
| Hard | ~85% | Tough. Reads the board, chains combos, punishes mistakes. |

These are interim targets. Final numbers will be adjusted after playtesting.

## Current Architecture

```
src/ai/
  difficulties/
    EasyAI.ts              # Light heuristics + random fallback
    MediumAI.ts            # Heuristic scoring (40+ weighted factors)
    HardAI.ts              # Board eval + 1-ply lookahead + tactical bonuses
    index.ts               # Dispatcher: getAiActionByDifficulty()
  RandomAI.ts              # Interaction response handler (shared by all levels)
  strategyHeuristics.ts    # Shared scoring functions (ware priority, utility value, combos)
  telemetry/
    config.ts              # AI_TELEMETRY_ENABLED, AI_TELEMETRY_SAMPLE_RATE
    extract.ts             # Feature vector extraction (18 fields per decision)
    types.ts               # TypeScript interfaces for telemetry documents
```

### How Each Difficulty Works

**Easy AI** (`EasyAI.ts`)
- Uses `getValidActions()` to get legal moves
- 60% bias toward ware plays, otherwise random
- Falls back to `RandomAI` for interaction responses
- Lever: adjust ware bias %, add/remove simple heuristics

**Medium AI** (`MediumAI.ts`)
- Scores every valid action using `scoreAction()`
- Factors: ware acquisition priority, utility play value, sell efficiency, hand/market risk
- Auction logic with valuation ceiling (`getAuctionMaxBid`)
- Lever: adjust scoring weights in `strategyHeuristics.ts`

**Hard AI** (`HardAI.ts`)
- Dual evaluation: board state score + opponent best-reply simulation
- `evaluateBoard()` weights: gold delta (6.5x), market capacity, hand value, utility strength
- Tactical bonuses for animal cards, people combos
- Defers to Medium on early turns (<=3) for stability
- Lever: lookahead depth, board eval weights, tactical bonus thresholds

### Shared Heuristics (`strategyHeuristics.ts`)
- `UTILITY_PLAY_BASE[]` / `UTILITY_ACTIVATE_BASE[]` — base scores per utility type
- `getWareAcquisitionPriority()` — evaluates ware card plays (readiness, supply)
- `getCardPressureBonus()` — situational bonuses for animal/people cards
- `getPeoplePlayComboPriority()` — trade synergy analysis

## Tuning Workflow

### 1. Make Changes

Edit the relevant AI files. Common tuning knobs:

| File | What to Adjust |
|---|---|
| `EasyAI.ts` | Ware bias %, add light heuristics |
| `MediumAI.ts` | `scoreAction()` weights, auction ceiling |
| `HardAI.ts` | `evaluateBoard()` weights, lookahead depth, tactical thresholds |
| `strategyHeuristics.ts` | Shared scoring constants (utility base values, combo bonuses) |

### 2. Type-Check

```bash
npm run typecheck
```

### 3. Run Benchmark

```bash
# Quick sanity check (20 games per matchup, ~30s)
npx tsx scripts/ai-benchmark.ts short

# Reliable measurement (300 games per matchup, ~5 min)
npx tsx scripts/ai-benchmark.ts long
```

Results are written to `reports/ai-benchmark/` as JSON, CSV, and a comparison markdown table.

### 4. Read Results

Key matchups to watch:

| Matchup | What It Tells You |
|---|---|
| easy vs medium | Easy win rate (target: ~30%) |
| medium vs hard | Medium win rate (proxy for human feel) |
| hard vs medium | Hard win rate (target: ~85%) — the primary tuning metric |
| hard vs hard | Should be ~50/50 (sanity check) |

Since we can't benchmark AI vs human directly, we use **Hard vs Medium** as the primary proxy for Hard's strength, and **Easy vs Medium** for Easy's floor.

### 5. Iterate

Repeat until targets are met. Each cycle should change ONE thing at a time so you can attribute win rate shifts to specific changes.

## Target Win Rate Matrix (AI vs AI)

Based on desired human-facing win rates, the AI-vs-AI benchmarks should land near:

| Matchup | Target AI Win Rate |
|---|---|
| Easy vs Medium | Easy wins ~20-25% |
| Easy vs Hard | Easy wins ~10-15% |
| Medium vs Hard | Medium wins ~30-35% |
| Hard vs Medium | Hard wins ~65-70%+ |

Note: AI-vs-AI rates differ from AI-vs-human rates. A Hard AI that wins 70% vs Medium AI will likely win ~85% vs most human players because humans make suboptimal plays that heuristics exploit.

## Baseline Benchmark (2026-02-22, 300 games)

| Matchup | P0 Win% | P1 Win% | Avg Turns | Stalls |
|---|---|---|---|---|
| easy vs easy | 54.7% | 44.7% | 59.17 | 0 |
| easy vs medium | 16.3% | 83.7% | 45.70 | 0 |
| easy vs hard | 15.7% | 84.0% | 44.63 | 0 |
| medium vs medium | 53.3% | 46.0% | 40.33 | 0 |
| medium vs hard | 39.7% | 59.3% | 37.92 | 0 |
| hard vs medium | 58.0% | 41.7% | 40.10 | 0 |
| hard vs hard | 37.0% | 62.0% | 38.20 | 0 |

**Hard vs Medium combined: 58.67%** (target: 65-70%+)

## MongoDB Collections

| Collection | Purpose | Status |
|---|---|---|
| `game_results` | Human game outcomes (gold, winner, seed) | Active — written by client |
| `game_logs` | Full action replays for human games | Active — written by client |
| `ai_games` | Server-side AI game summaries | Empty — future use (requires multiplayer server + env flags) |
| `ai_decisions` | Server-side AI decision telemetry | Empty — future use (requires multiplayer server + env flags) |

**For difficulty tuning, use the offline benchmark scripts.** The MongoDB telemetry collections are for a future phase where live game data feeds automated weight optimization.

### Env Flags (for future server telemetry)

```
AI_TELEMETRY_ENABLED=true        # Master switch
AI_TELEMETRY_SAMPLE_RATE=0.2     # Fraction of games to record (0.0-1.0)
MONGODB_URI=mongodb+srv://...    # Connection string
```

## Tuning Phases

### Phase 1 — Strengthen Hard AI
- Increase gold delta weight in `evaluateBoard()`
- Add endgame rush logic (prioritize selling when near 60g)
- Improve combo detection (sell setup, utility chaining)
- Strengthen animal card timing (play when opponent is vulnerable)
- Consider 2-ply lookahead for critical decisions
- **Target: Hard vs Medium → 65-70%+**

### Phase 2 — Calibrate Medium AI
- Tune scoring weights for "competent but predictable" play
- Reduce auction intelligence slightly
- Keep ware trading solid, skip subtle combos
- **Target: Medium vs Easy → ~75-80%**

### Phase 3 — Lift Easy AI
- Replace pure random with light heuristics
- Add basic "don't waste money" logic (don't buy with full market, sell when profitable)
- Keep beatable but not embarrassingly bad
- **Target: Easy vs Medium → ~20-25%**

### Phase 4 — Validate
- Run long benchmarks for all matchups
- Zero stalls requirement
- Playtest each difficulty as human to confirm feel matches target
