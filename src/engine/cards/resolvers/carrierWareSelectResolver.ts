// ============================================================================
// Carrier Ware Select Resolver - Follow-up step for Carrier binary choice
// Target player picks a ware type, receives 2 from supply into market.
// ============================================================================

import type {
  GameState,
  PendingCarrierWareSelect,
  InteractionResponse,
} from '../../types.ts';
import { takeFromSupply } from '../../market/WareSupply.ts';
import { addWaresToMarket, getPlacementCapacity } from '../../market/MarketManager.ts';

export function resolveCarrierWareSelect(
  state: GameState,
  pending: PendingCarrierWareSelect,
  response: InteractionResponse
): GameState {
  const target = pending.targetPlayer;

  // Guard: no market space for target — auto-resolve
  if (getPlacementCapacity(state, target) === 0) {
    return {
      ...state,
      pendingResolution: null,
      log: [...state.log, {
        turn: state.turn,
        player: state.currentPlayer,
        action: 'CARRIER_WARES',
        details: `Player ${target} has no empty market slots`,
      }],
    };
  }

  // Guard: no supply available — auto-resolve
  if (!Object.values(state.wareSupply).some(v => v > 0)) {
    return {
      ...state,
      pendingResolution: null,
      log: [...state.log, {
        turn: state.turn,
        player: state.currentPlayer,
        action: 'CARRIER_WARES',
        details: 'No wares available in supply',
      }],
    };
  }

  if (response.type !== 'SELECT_WARE_TYPE') {
    throw new Error('Expected SELECT_WARE_TYPE response for Carrier ware selection');
  }

  const { wareType } = response;

  // Validate supply has at least 2
  const available = state.wareSupply[wareType];
  const count = Math.min(2, available);
  if (count === 0) {
    throw new Error(`No ${wareType} in supply`);
  }

  // Validate market space
  const toAdd = Math.min(count, getPlacementCapacity(state, target));
  if (toAdd === 0) {
    throw new Error('No empty market slots');
  }

  let next = takeFromSupply(state, wareType, toAdd);
  const wares = Array(toAdd).fill(wareType) as typeof wareType[];
  next = addWaresToMarket(next, target, wares);

  next = {
    ...next,
    pendingResolution: null,
    log: [...next.log, {
      turn: state.turn,
      player: state.currentPlayer,
      action: 'CARRIER_WARES',
      details: `Player ${target} received ${toAdd}x ${wareType} from supply`,
    }],
  };

  return next;
}
