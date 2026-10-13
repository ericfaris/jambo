# Roadmap

Last reviewed: 2026-10-13

## Now

- Leaderboards that weigh abandons (online abandons are logged per user)

## Done (this cycle)

- **Play a friend online** — invite link, the full solo board for both
  players over the server, presence + reconnect countdown, abandons,
  online results recorded per signed-in player
- **Multiplayer robustness and reconnect** — seat held for 5 minutes with a
  countdown, refresh rejoins, WS heartbeat, a replaced socket can't swallow
  messages

- **Harden docs** — CARD_REFERENCE.md, CLAUDE.md, and CardDatabase.ts fully cross-checked; all three sources consistent
- **Rules audit** — every card's gold values, ware counts, and interaction timing verified; Traveling Merchant corrected to match digital implementation
- **Stall prevention test coverage** — resolver guards and validation gates covered for all 22 resolution types (278 tests total, 0 failures)
- **AI difficulty balancing** — Expert AI reaches 70% combined win rate vs Hard (target was 65-70%); Expert P1 improved from 54% → 69% via deeper MC rollouts (depth 16, interaction rollouts 16)
- **Deeper AI strategy** — Endgame-aware rollout policy (getRolloutAction) triggers 60g sells in MC simulations; fixed evaluateBoard to penalize the non-triggering player (−25) instead of rewarding both sides equally
- **UX clarity** — Draft, WareTradePanel, OpponentDiscard, DeckPeek panels clarified; uiHints breadcrumbs added for DRAFT and WARE_TRADE

## Next

- Tighten persistence compatibility and migration coverage

## Later

- Additional polish for visuals/audio/accessibility
- Optional analytics and telemetry for balancing workflows
