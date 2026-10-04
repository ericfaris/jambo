# Test Strategy

Last reviewed: 2026-02-15

## Test Priorities

- Engine correctness and invariants
- Resolver interaction safety (no stalls)
- AI legality and stability
- UI behavior for interaction flows and empty-state fallbacks

## Coverage Areas

- Card play and utility activation
- Ware buy/sell/trade/steal/draft behavior
- Endgame and final-turn rules
- Deck exhaustion and discard reshuffle
- Save/load validation behavior

## Quality Gates

- Type check: `npm run typecheck` (TypeScript 7)
- Build: `npx vite build`
- Tests: `npm test`

## Regression Focus

Any new resolver or interaction must include:

1. Validation precondition checks
2. Auto-resolve guard path tests
3. AI interaction-response coverage
4. UI fallback behavior coverage
