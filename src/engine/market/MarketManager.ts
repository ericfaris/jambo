// ============================================================================
// MarketManager - Manages a player's 6-slot market stand
// Pure functions, immutable state updates
// ============================================================================

import type { GameState, PlayerState, WareType } from '../types.ts';
import { CONSTANTS } from '../types.ts';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Creates a new GameState with an updated market for the given player.
 */
function withUpdatedMarket(
  state: GameState,
  player: 0 | 1,
  newMarket: (WareType | null)[]
): GameState {
  const newPlayers: [PlayerState, PlayerState] = [
    player === 0 ? { ...state.players[0], market: newMarket } : state.players[0],
    player === 1 ? { ...state.players[1], market: newMarket } : state.players[1],
  ];
  return { ...state, players: newPlayers };
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Returns the indices of all empty (null) slots in the player's market.
 */
export function getEmptySlots(state: GameState, player: 0 | 1): number[] {
  const market = state.players[player].market;
  const empty: number[] = [];
  for (let i = 0; i < market.length; i++) {
    if (market[i] === null) {
      empty.push(i);
    }
  }
  return empty;
}

/**
 * Returns the indices of all occupied (non-null) slots in the player's market.
 */
export function getOccupiedSlots(state: GameState, player: 0 | 1): number[] {
  const market = state.players[player].market;
  const occupied: number[] = [];
  for (let i = 0; i < market.length; i++) {
    if (market[i] !== null) {
      occupied.push(i);
    }
  }
  return occupied;
}

/**
 * Returns a list of all wares currently on the player's market (no nulls).
 */
export function getMarketWares(state: GameState, player: 0 | 1): WareType[] {
  return state.players[player].market.filter((slot): slot is WareType => slot !== null);
}

/**
 * Returns true if every slot in the player's market is occupied.
 */
export function isMarketFull(state: GameState, player: 0 | 1): boolean {
  return state.players[player].market.every((slot) => slot !== null);
}

/**
 * Counts how many slots contain the specified ware type.
 */
export function countWaresOfType(state: GameState, player: 0 | 1, wareType: WareType): number {
  return state.players[player].market.filter((slot) => slot === wareType).length;
}

// ---------------------------------------------------------------------------
// Placement — official rule: "The large market stands have space for 6 wares.
// The players pay nothing to use five of these spaces. However, when a player
// fills a sixth space with a ware, he must pay 2 gold to the bank."
// ---------------------------------------------------------------------------

/**
 * Empty slots in the order wares are placed: the large stand's free spaces
 * first, then small-stand spaces, and the large stand's 6th (paid) space last.
 */
function getPlacementPlan(market: (WareType | null)[]): { order: number[]; sixthSpace: number | null } {
  const largeEmpty: number[] = [];
  const standEmpty: number[] = [];
  for (let i = 0; i < market.length; i++) {
    if (market[i] !== null) continue;
    if (i < CONSTANTS.MARKET_SLOTS) largeEmpty.push(i);
    else standEmpty.push(i);
  }
  const largeOccupied = CONSTANTS.MARKET_SLOTS - largeEmpty.length;
  const freeLarge = largeEmpty.slice(0, Math.max(0, CONSTANTS.MARKET_SLOTS - 1 - largeOccupied));
  const sixthSpace = largeEmpty.length > freeLarge.length ? largeEmpty[largeEmpty.length - 1] : null;
  return { order: [...freeLarge, ...standEmpty, ...(sixthSpace === null ? [] : [sixthSpace])], sixthSpace };
}

/** Slot index of the large stand's paid 6th space (filled last), or null if it's occupied. */
export function getSixthSpaceIndex(market: (WareType | null)[]): number | null {
  return getPlacementPlan(market).sixthSpace;
}

/** Gold owed for placing `count` new wares (2g if it fills the large stand's 6th space). */
export function getSixthSpaceFee(state: GameState, player: 0 | 1, count: number): number {
  const { order, sixthSpace } = getPlacementPlan(state.players[player].market);
  return sixthSpace !== null && order.slice(0, count).includes(sixthSpace) ? CONSTANTS.SIXTH_SLOT_PENALTY : 0;
}

/**
 * How many wares the player can place right now. The 6th large-stand space
 * only counts if they can afford its fee from `goldAvailable`.
 */
export function getPlacementCapacity(state: GameState, player: 0 | 1, goldAvailable: number = state.players[player].gold): number {
  const { order, sixthSpace } = getPlacementPlan(state.players[player].market);
  if (sixthSpace === null) return order.length;
  return goldAvailable >= CONSTANTS.SIXTH_SLOT_PENALTY ? order.length : order.length - 1;
}

// ---------------------------------------------------------------------------
// Mutation functions (return new state)
// ---------------------------------------------------------------------------

/**
 * Place one ware (see addWaresToMarket for placement order and the 6th-space fee).
 */
export function addWareToMarket(
  state: GameState,
  player: 0 | 1,
  wareType: WareType
): GameState {
  return addWaresToMarket(state, player, [wareType]);
}

/**
 * Remove and return the ware at the given slot index.
 * Throws if the slot is empty.
 */
export function removeWareFromMarket(
  state: GameState,
  player: 0 | 1,
  slotIndex: number
): { state: GameState; ware: WareType } {
  const market = state.players[player].market;
  const ware = market[slotIndex];

  if (ware === null || ware === undefined) {
    throw new Error(
      `Player ${player}'s market slot ${slotIndex} is empty: cannot remove ware`
    );
  }

  const newMarket = [...market];
  newMarket[slotIndex] = null;

  return {
    state: withUpdatedMarket(state, player, newMarket),
    ware,
  };
}

/**
 * Place wares on the player's stands — free large-stand spaces, then small
 * stands, then the 6th large-stand space (charging its 2g fee).
 * Throws if there isn't room or the player can't pay the fee.
 */
export function addWaresToMarket(
  state: GameState,
  player: 0 | 1,
  wares: WareType[]
): GameState {
  const { order } = getPlacementPlan(state.players[player].market);
  if (order.length < wares.length) {
    throw new Error(
      `Player ${player}'s market has ${order.length} empty slot(s) but ${wares.length} ware(s) need to be added`
    );
  }
  const fee = getSixthSpaceFee(state, player, wares.length);
  const gold = state.players[player].gold;
  if (gold < fee) {
    throw new Error(`Player ${player} cannot pay ${fee}g for the 6th market space`);
  }

  const newMarket = [...state.players[player].market];
  for (let i = 0; i < wares.length; i++) {
    newMarket[order[i]] = wares[i];
  }

  const next = withUpdatedMarket(state, player, newMarket);
  if (fee === 0) return next;
  const newPlayers: [PlayerState, PlayerState] = [
    player === 0 ? { ...next.players[0], gold: gold - fee } : next.players[0],
    player === 1 ? { ...next.players[1], gold: gold - fee } : next.players[1],
  ];
  return { ...next, players: newPlayers };
}

/**
 * For wares received from card effects: place as many as fit (and whose 6th
 * space fee the player can pay); the rest stay in / go back to the supply.
 * Official rule: "If a player does not have enough room on his market stands
 * for wares he receives as a result of the effects of people and animal cards,
 * he can choose which to take and which to leave in the supply."
 */
export function placeWaresUpToCapacity(
  state: GameState,
  player: 0 | 1,
  wares: WareType[]
): { state: GameState; placed: WareType[]; leftover: WareType[] } {
  const capacity = getPlacementCapacity(state, player);
  const placed = wares.slice(0, capacity);
  const leftover = wares.slice(capacity);
  return { state: placed.length > 0 ? addWaresToMarket(state, player, placed) : state, placed, leftover };
}

/**
 * Put a ware into a specific (empty) slot — used by in-place swaps such as
 * Throne, which exchange wares rather than filling a new space.
 */
export function setWareAtSlot(state: GameState, player: 0 | 1, slotIndex: number, wareType: WareType): GameState {
  const market = state.players[player].market;
  if (market[slotIndex] !== null) {
    throw new Error(`Player ${player}'s market slot ${slotIndex} is not empty`);
  }
  const newMarket = [...market];
  newMarket[slotIndex] = wareType;
  return withUpdatedMarket(state, player, newMarket);
}

/**
 * Remove multiple wares at the given slot indices.
 * Throws if any slot is empty.
 */
export function removeWaresFromMarket(
  state: GameState,
  player: 0 | 1,
  slotIndices: number[]
): { state: GameState; wares: WareType[] } {
  const market = state.players[player].market;
  const removedWares: WareType[] = [];

  // Validate all slots first before mutating
  for (const idx of slotIndices) {
    const ware = market[idx];
    if (ware === null || ware === undefined) {
      throw new Error(
        `Player ${player}'s market slot ${idx} is empty: cannot remove ware`
      );
    }
    removedWares.push(ware);
  }

  const newMarket = [...market];
  for (const idx of slotIndices) {
    newMarket[idx] = null;
  }

  return {
    state: withUpdatedMarket(state, player, newMarket),
    wares: removedWares,
  };
}

/**
 * Expand a player's market by adding 3 null slots (for Small Market Stand).
 */
export function expandMarket(
  state: GameState,
  player: 0 | 1
): GameState {
  const market = state.players[player].market;
  const expanded: (WareType | null)[] = [...market, null, null, null];
  return withUpdatedMarket(state, player, expanded);
}
