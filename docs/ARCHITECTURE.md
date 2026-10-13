# Architecture

Last reviewed: 2026-10-13

## Layers

- `src/engine/`: pure TypeScript game engine (no React/UI imports)
- `src/ai/`: AI decision logic
- `src/ui/`: React presentation and interaction components
- `src/hooks/`: Zustand store integration
- `src/persistence/`: save/load and state hydration
- `src/multiplayer/`: the Node server (WebSocket rooms, accounts, stats) and
  the browser client. The server is authoritative; `stateSplitter.ts` splits
  each state into a public view and one private view per seat. Cast rooms
  drive a TV + phone controllers; friend rooms ("Play a friend") give both
  players the full board (`GameBoard`, fed `toBoardState(public, private)`).

## Engine Principles

- Immutable state only (no in-place mutation)
- Validation before action execution
- Resolution pipeline driven by tagged unions in `pendingResolution`
- Deterministic shuffles via seeded Mulberry32 RNG

## Card Resolution Flow

1. Action dispatch (e.g. `PLAY_CARD`, `ACTIVATE_UTILITY`)
2. Resolution initialization
3. `pendingResolution` creation when interaction is needed
4. Interaction response dispatch
5. Resolver handles response and either advances or clears `pendingResolution`

## Reliability Pattern: Prevent Resolution Stalls

Every interaction feature must include all of the following:

1. Validation preconditions in action validator
2. Resolver auto-resolve guards before response-type checks
3. AI dummy responses instead of `null` when guard paths exist
4. UI fallback controls (e.g. Continue) when no selectable items exist

## Invariant Expectations

- Total card accounting remains consistent
- Gold cannot go negative
- Market/hand/utility constraints are enforced by validation and invariant checks
