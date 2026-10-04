// ============================================================================
// Shaman Ware Trade Resolver - Trade ALL of one ware type for another
// ============================================================================

import type { GameState, PendingWareTrade, InteractionResponse, WareType } from '../../types.ts';
import { WARE_TYPES } from '../../types.ts';
import { countWaresOfType } from '../../market/MarketManager.ts';
import { hasSupply } from '../../market/WareSupply.ts';

export function resolveWareTrade(
  state: GameState,
  pending: PendingWareTrade,
  response: InteractionResponse
): GameState {
  if (pending.step === 'SELECT_GIVE') {
    // Guard: no wares in market — auto-resolve
    if (!state.players[state.currentPlayer].market.some(w => w !== null)) {
      return {
        ...state,
        pendingResolution: null,
        log: [...state.log, { turn: state.turn, player: state.currentPlayer, action: 'SHAMAN_TRADE', details: 'No wares in market to trade' }],
      };
    }

    if (response.type !== 'SELECT_WARE_TYPE') {
      throw new Error('Expected SELECT_WARE_TYPE response for trade give step');
    }
    const giveType = response.wareType;
    const count = countWaresOfType(state, state.currentPlayer, giveType);
    if (count === 0) {
      throw new Error(`No ${giveType} wares on market to trade`);
    }

    // Move to SELECT_RECEIVE step
    return {
      ...state,
      pendingResolution: {
        ...pending,
        step: 'SELECT_RECEIVE',
        giveType,
        giveCount: count,
      },
    };
  }

  if (pending.step === 'SELECT_RECEIVE') {
    const giveType = pending.giveType!;
    const count = pending.giveCount!;

    // Guard: no valid receive type available for required count — auto-resolve
    const hasAnyValidReceive = WARE_TYPES.some(w => w !== giveType && hasSupply(state, w, count));
    if (!hasAnyValidReceive) {
      return {
        ...state,
        pendingResolution: null,
        log: [...state.log, {
          turn: state.turn,
          player: state.currentPlayer,
          action: 'SHAMAN_TRADE',
          details: `No valid receive type for ${count} ${giveType}; trade cancelled`,
        }],
      };
    }

    if (response.type !== 'SELECT_WARE_TYPE') {
      throw new Error('Expected SELECT_WARE_TYPE response for trade receive step');
    }
    const receiveType = response.wareType;

    // Validate: can't trade for same type
    if (receiveType === giveType) {
      throw new Error('Cannot trade for the same ware type');
    }

    // Validate: supply has enough
    if (!hasSupply(state, receiveType, count)) {
      throw new Error(`Supply doesn't have ${count} ${receiveType}`);
    }

    // Execute atomic trade: remove all giveType from market, add receiveType
    const player = state.currentPlayer;
    const newMarket = [...state.players[player].market];

    // Swap each giveType ware for a receiveType ware in the same space, so the
    // trade never fills a new (e.g. paid 6th) market space
    for (let i = 0; i < newMarket.length; i++) {
      if (newMarket[i] === giveType) {
        newMarket[i] = receiveType;
      }
    }

    // Update supply
    const newSupply = { ...state.wareSupply };
    newSupply[giveType] += count;
    newSupply[receiveType] -= count;

    const newPlayers: [typeof state.players[0], typeof state.players[1]] = [
      state.currentPlayer === 0
        ? { ...state.players[0], market: newMarket }
        : state.players[0],
      state.currentPlayer === 1
        ? { ...state.players[1], market: newMarket }
        : state.players[1],
    ];

    return {
      ...state,
      players: newPlayers,
      wareSupply: newSupply,
      pendingResolution: null,
      log: [...state.log, {
        turn: state.turn,
        player: state.currentPlayer,
        action: 'SHAMAN_TRADE',
        details: `Traded ${count} ${giveType} for ${count} ${receiveType}`,
      }],
    };
  }

  throw new Error(`Unknown ware trade step: ${pending.step}`);
}

/**
 * Get valid ware types the player can trade away (has at least 1 on market).
 */
export function getValidGiveTypes(state: GameState): WareType[] {
  return WARE_TYPES.filter(w => countWaresOfType(state, state.currentPlayer, w) > 0);
}

/**
 * Get valid ware types the player can receive (supply has enough).
 */
export function getValidReceiveTypes(state: GameState, giveType: WareType, count: number): WareType[] {
  return WARE_TYPES.filter(w => w !== giveType && hasSupply(state, w, count));
}
