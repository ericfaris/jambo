// ============================================================================
// Ware Select Multiple Resolver - Basket Maker (pay 2g, choose type, get 2)
// ============================================================================

import type { GameState, PendingWareSelectMultiple, InteractionResponse, WareType } from '../../types.ts';
import { hasSupply, takeFromSupply } from '../../market/WareSupply.ts';
import { getPlacementCapacity, placeWaresUpToCapacity } from '../../market/MarketManager.ts';

export function resolveWareSelectMultiple(
  state: GameState,
  pending: PendingWareSelectMultiple,
  response: InteractionResponse
): GameState {
  const activePlayer = state.currentPlayer;
  const { count } = pending;

  // Guard: can't afford or no room for even 1 ware — auto-resolve with no effect
  const gold = state.players[activePlayer].gold;
  if (gold < 2 || getPlacementCapacity(state, activePlayer, gold - 2) < 1) {
    return {
      ...state,
      pendingResolution: null,
      log: [...state.log, {
        turn: state.turn,
        player: activePlayer,
        action: 'BASKET_MAKER',
        details: 'Cannot afford or no market space — no effect',
      }],
    };
  }

  // Guard: no ware type has sufficient supply — auto-resolve with no effect
  const hasAnyValidSupply =
    hasSupply(state, 'trinkets', count) ||
    hasSupply(state, 'hides', count) ||
    hasSupply(state, 'tea', count) ||
    hasSupply(state, 'silk', count) ||
    hasSupply(state, 'fruit', count) ||
    hasSupply(state, 'salt', count);
  if (!hasAnyValidSupply) {
    return {
      ...state,
      pendingResolution: null,
      log: [...state.log, {
        turn: state.turn,
        player: activePlayer,
        action: 'BASKET_MAKER',
        details: 'No ware type has enough supply — no effect',
      }],
    };
  }

  if (response.type !== 'SELECT_WARE_TYPE') {
    throw new Error('Expected SELECT_WARE_TYPE response for Basket Maker');
  }

  const { wareType } = response;

  // Validate: supply has enough
  if (!hasSupply(state, wareType, count)) {
    throw new Error(`Supply doesn't have ${count} ${wareType}`);
  }

  // Execute: pay 2g, then take as many as fit (the rest stay in the supply)
  const paidPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
  paidPlayers[activePlayer] = { ...paidPlayers[activePlayer], gold: paidPlayers[activePlayer].gold - 2 };
  let newState: GameState = { ...state, players: paidPlayers };
  const placement = placeWaresUpToCapacity(newState, activePlayer, Array(count).fill(wareType) as WareType[]);
  newState = takeFromSupply(placement.state, wareType, placement.placed.length);
  const newPlayers = newState.players;

  return {
    ...newState,
    players: newPlayers,
    pendingResolution: null,
    log: [...newState.log, {
      turn: state.turn,
      player: activePlayer,
      action: 'BASKET_MAKER',
      details: `Paid 2g, received ${placement.placed.length} ${wareType}`,
    }],
  };
}
