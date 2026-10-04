# Product Requirements

Last reviewed: 2026-02-15

## Product Goal

Digital implementation of **Jambo** as a deterministic, rules-faithful 2-player card game with strong single-player AI and optional multiplayer support.

## Core Rules Baseline

- 2 players
- 110-card deck (51 unique designs)
- Start gold: 20 each
- Base market slots: 6 (expandable via Small Market Stand)
- Utility limit: 3 in play per player
- No hand limit (official rules: players may hold any number of cards)
- Turn budget: 5 actions
- Endgame trigger: player ends turn at >= 60 gold; opponent gets one final turn

For full card-by-card behavior, see `docs/CARD_REFERENCE.md`.

## Supported Modes

- P0: Human vs AI
- P1: Local hotseat
- P2: Online multiplayer

## Functional Requirements

- Full card resolution flow with `pendingResolution` interactions.
- Immutable state transitions in engine logic.
- Deterministic RNG support for reproducibility and AI testing.
- Rule validation before actions become available.
- Save/load support with defensive validation.

## Non-Goals for Core Requirements

- Historical/experimental mechanics from deprecated specs.
- Any 55-card assumptions (project baseline is 110 cards).
