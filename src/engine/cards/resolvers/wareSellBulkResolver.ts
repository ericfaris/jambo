// ============================================================================
// Ware Sell Bulk Resolver - Portuguese (sell any wares at flat rate)
// ============================================================================

import type { GameState, PendingWareSellBulk, InteractionResponse, WareType } from '../../types.ts';
import { returnToSupply } from '../../market/WareSupply.ts';

export function resolveWareSellBulk(
  state: GameState,
  pending: PendingWareSellBulk,
  response: InteractionResponse
): GameState {
  const activePlayer = state.currentPlayer;
  const market = state.players[activePlayer].market;

  // Guard: no wares in market — auto-resolve
  if (!market.some(w => w !== null)) {
    return {
      ...state,
      pendingResolution: null,
      log: [...state.log, { turn: state.turn, player: activePlayer, action: 'PORTUGUESE_SELL', details: 'No wares to sell' }],
    };
  }

  if (response.type !== 'SELL_WARES') {
    throw new Error('Expected SELL_WARES response for Portuguese');
  }

  const { wareIndices } = response;

  if (wareIndices.length === 0) {
    throw new Error('Must select at least 1 ware to sell');
  }

  // Validate all indices are occupied slots
  for (const idx of wareIndices) {
    if (idx < 0 || idx >= market.length || market[idx] === null) {
      throw new Error(`Invalid or empty market slot ${idx}`);
    }
  }

  // Check for duplicate indices
  const uniqueIndices = new Set(wareIndices);
  if (uniqueIndices.size !== wareIndices.length) {
    throw new Error('Duplicate ware indices');
  }

  // Calculate gold earned: flat rate per ware
  // Wise Man from Afar's "+2g per sale" applies once per Portuguese sale
  // (house rule, 2026-10-04) — only when something is actually sold
  const bonus = wareIndices.length > 0 ? state.turnModifiers.sellBonus : 0;
  const goldEarned = wareIndices.length * pending.pricePerWare + bonus;

  // Remove wares from market and return to supply
  const newMarket = [...market];
  let newState = state;
  for (const idx of wareIndices) {
    const ware = newMarket[idx] as WareType;
    newState = returnToSupply(newState, ware, 1);
    newMarket[idx] = null;
  }

  const newPlayers = [...newState.players] as [typeof newState.players[0], typeof newState.players[1]];
  newPlayers[activePlayer] = {
    ...newPlayers[activePlayer],
    market: newMarket,
    gold: newPlayers[activePlayer].gold + goldEarned,
  };

  return {
    ...newState,
    players: newPlayers,
    pendingResolution: null,
    log: [...newState.log, {
      turn: state.turn,
      player: activePlayer,
      action: 'PORTUGUESE_SELL',
      details: `Sold ${wareIndices.length} wares at ${pending.pricePerWare}g each${bonus ? ` (+${bonus}g Wise Man)` : ''}, earned ${goldEarned}g`,
    }],
  };
}
