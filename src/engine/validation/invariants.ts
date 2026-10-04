// ============================================================================
// Jambo Game State Invariant Checks
// Used for state validation, save/load integrity, and debugging.
// ============================================================================

import type { GameState } from '../types.ts';
import { CONSTANTS, WARE_TYPES } from '../types.ts';

export interface InvariantViolation {
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Run all invariant checks on a game state.
 * Returns an array of violations (empty = valid state).
 */
export function checkInvariants(state: GameState): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  const check = (rule: string, condition: boolean, message: string, severity: 'error' | 'warning' = 'error') => {
    if (!condition) {
      violations.push({ rule, message, severity });
    }
  };

  // --- Action & Turn Invariants ---

  // 1. Actions must be 0-5
  check('ACTIONS_RANGE', state.actionsLeft >= 0 && state.actionsLeft <= CONSTANTS.MAX_ACTIONS,
    `actionsLeft=${state.actionsLeft} outside range 0-${CONSTANTS.MAX_ACTIONS}`);

  // 2. Current player must be 0 or 1
  check('CURRENT_PLAYER', state.currentPlayer === 0 || state.currentPlayer === 1,
    `currentPlayer=${state.currentPlayer} must be 0 or 1`);

  // 3. Phase must be valid
  check('VALID_PHASE', ['DRAW', 'PLAY', 'GAME_OVER'].includes(state.phase),
    `phase="${state.phase}" is not valid`);

  // 4. Turn must be positive
  check('POSITIVE_TURN', state.turn >= 1,
    `turn=${state.turn} must be >= 1`);

  // 5. Draw phase draws in range
  check('DRAW_PHASE_RANGE', state.drawsThisPhase >= 0 && state.drawsThisPhase <= CONSTANTS.MAX_DRAW_PHASE_DRAWS,
    `drawsThisPhase=${state.drawsThisPhase} outside range 0-${CONSTANTS.MAX_DRAW_PHASE_DRAWS}`);

  // --- Player State Invariants (both players) ---
  for (const p of [0, 1] as const) {
    const player = state.players[p];

    // 6-7. Gold must be non-negative
    check(`P${p}_GOLD_NON_NEGATIVE`, player.gold >= 0,
      `Player ${p} gold=${player.gold} must be >= 0`);

    // 8-9. Gold upper bound (sanity check)
    check(`P${p}_GOLD_UPPER`, player.gold <= 200,
      `Player ${p} gold=${player.gold} exceeds sanity limit of 200`, 'warning');

    // 10-11. (No hand-size bound: official Jambo rules have no hand limit;
    // the 110-card total check below already bounds it.)

    // 12-13. Market must have correct number of slots (base 6 + 3 per stand)
    const expectedSlots = CONSTANTS.MARKET_SLOTS + (player.smallMarketStands * CONSTANTS.STAND_EXPANSION_SLOTS);
    check(`P${p}_MARKET_SLOTS`, player.market.length === expectedSlots,
      `Player ${p} market has ${player.market.length} slots, expected ${expectedSlots} (${player.smallMarketStands} stands)`);

    // 14-15. Utilities max 3
    check(`P${p}_MAX_UTILITIES`, player.utilities.length <= CONSTANTS.MAX_UTILITIES,
      `Player ${p} has ${player.utilities.length} utilities, max ${CONSTANTS.MAX_UTILITIES}`);

    // 16-17. Market slots contain valid ware types or null
    for (let s = 0; s < player.market.length; s++) {
      const slot = player.market[s];
      if (slot !== null) {
        check(`P${p}_MARKET_SLOT_${s}`, (WARE_TYPES as readonly string[]).includes(slot),
          `Player ${p} market slot ${s} has invalid ware type "${slot}"`);
      }
    }

    // 18-19. smallMarketStands must be non-negative
    check(`P${p}_STANDS_NON_NEGATIVE`, player.smallMarketStands >= 0,
      `Player ${p} smallMarketStands=${player.smallMarketStands} must be >= 0`);
  }

  // --- Deck & Card Count Invariants ---

  // 20. Total cards in game must equal TOTAL_CARDS_IN_GAME (110)
  const totalCards = countAllCards(state);
  check('TOTAL_CARD_COUNT', totalCards === CONSTANTS.TOTAL_CARDS_IN_GAME,
    `Total cards=${totalCards}, expected ${CONSTANTS.TOTAL_CARDS_IN_GAME}`);

  // 21. Deck size non-negative
  check('DECK_NON_NEGATIVE', state.deck.length >= 0,
    `Deck size=${state.deck.length} must be >= 0`);

  // 22. Discard pile non-negative
  check('DISCARD_NON_NEGATIVE', state.discardPile.length >= 0,
    `Discard size=${state.discardPile.length} must be >= 0`);

  // 23. Reshuffle count non-negative
  check('RESHUFFLE_NON_NEGATIVE', state.reshuffleCount >= 0,
    `reshuffleCount=${state.reshuffleCount} must be >= 0`);

  // --- Ware Supply Invariants ---

  // 24. Each ware supply must be non-negative
  for (const wareType of WARE_TYPES) {
    check(`SUPPLY_${wareType.toUpperCase()}`, state.wareSupply[wareType] >= 0,
      `Ware supply for ${wareType}=${state.wareSupply[wareType]} must be >= 0`);
  }

  // 25. Total ware supply should not exceed maximum
  const totalSupply = WARE_TYPES.reduce((sum, w) => sum + state.wareSupply[w], 0);
  check('TOTAL_SUPPLY', totalSupply <= 36,
    `Total ware supply=${totalSupply} exceeds 36`, 'warning');

  // --- Endgame Invariants ---

  // 26. If endgame is set, trigger player must be valid
  if (state.endgame) {
    check('ENDGAME_TRIGGER_PLAYER',
      state.endgame.triggerPlayer === 0 || state.endgame.triggerPlayer === 1,
      `Endgame trigger player=${state.endgame.triggerPlayer} must be 0 or 1`);

    check('ENDGAME_FINAL_PLAYER',
      state.endgame.finalTurnPlayer === 0 || state.endgame.finalTurnPlayer === 1,
      `Endgame final turn player=${state.endgame.finalTurnPlayer} must be 0 or 1`);

    check('ENDGAME_DIFFERENT_PLAYERS',
      state.endgame.triggerPlayer !== state.endgame.finalTurnPlayer,
      'Endgame trigger and final turn player must be different');
  }

  // 27. If phase is GAME_OVER, endgame must be set
  if (state.phase === 'GAME_OVER') {
    check('GAME_OVER_HAS_ENDGAME', state.endgame !== null,
      'Phase is GAME_OVER but endgame state is null');
  }

  return violations;
}

/**
 * Count total cards across all locations in the game.
 */
function countAllCards(state: GameState): number {
  let count = 0;

  // Deck
  count += state.deck.length;

  // Discard pile
  count += state.discardPile.length;

  // Drawn card awaiting keep/discard decision
  if (state.drawnCard !== null) {
    count += 1;
  }

  // Both players' hands
  count += state.players[0].hand.length;
  count += state.players[1].hand.length;

  // Both players' utilities in play
  count += state.players[0].utilities.length;
  count += state.players[1].utilities.length;

  // Cards "in flight" — removed from hand but not yet discarded.
  // These are referenced by pending state but not in any counted location.
  const allCounted = new Set([
    ...state.deck,
    ...state.discardPile,
    ...(state.drawnCard ? [state.drawnCard] : []),
    ...state.players[0].hand,
    ...state.players[1].hand,
    ...state.players[0].utilities.map(u => u.cardId),
    ...state.players[1].utilities.map(u => u.cardId),
  ]);

  // pendingResolution.sourceCard — played card awaiting resolution
  if (state.pendingResolution?.sourceCard && !allCounted.has(state.pendingResolution.sourceCard)) {
    count += 1;
  }

  // Cards in pending resolution pools (draft available cards, scale auto-drawn cards, etc.)
  if (state.pendingResolution) {
    const pending = state.pendingResolution as unknown as Record<string, unknown>;
    if (Array.isArray(pending.availableCards)) {
      for (const cardId of pending.availableCards) {
        if (!allCounted.has(cardId as string)) {
          count += 1;
        }
      }
    }
    if (Array.isArray(pending.selectedCards)) {
      for (const cardId of pending.selectedCards) {
        if (!allCounted.has(cardId as string)) {
          count += 1;
        }
      }
    }
  }

  // Crocodile card while its borrowed utility's effect is resolving
  const crocodileCardId = state.crocodileCleanup?.crocodileCardId;
  if (crocodileCardId && !allCounted.has(crocodileCardId) && crocodileCardId !== state.pendingResolution?.sourceCard) {
    count += 1;
  }

  // pendingGuardReaction.animalCard — animal card awaiting guard decision
  if (state.pendingGuardReaction?.animalCard && !allCounted.has(state.pendingGuardReaction.animalCard)) {
    count += 1;
  }

  return count;
}

/**
 * Validate state and throw if any errors found.
 */
export function assertValidState(state: GameState): void {
  const violations = checkInvariants(state);
  const errors = violations.filter(v => v.severity === 'error');
  if (errors.length > 0) {
    const messages = errors.map(e => `[${e.rule}] ${e.message}`).join('\n');
    throw new Error(`Game state invariant violations:\n${messages}`);
  }
}

/**
 * Normalize a potentially invalid state by clamping values to valid ranges.
 * Used for loading corrupt saves gracefully.
 */
export function normalizeState(state: GameState): GameState {
  const normalized = structuredClone(state);

  // Clamp actions
  normalized.actionsLeft = Math.max(0, Math.min(CONSTANTS.MAX_ACTIONS, normalized.actionsLeft));

  // Clamp player values
  for (const player of normalized.players) {
    // Gold floor
    player.gold = Math.max(0, player.gold);

    // Ensure market has correct number of slots for stands
    const expectedSlots = CONSTANTS.MARKET_SLOTS + (player.smallMarketStands * CONSTANTS.STAND_EXPANSION_SLOTS);
    while (player.market.length < expectedSlots) {
      player.market.push(null);
    }
    if (player.market.length > expectedSlots) {
      player.market = player.market.slice(0, expectedSlots);
    }

    // Truncate utilities to max 3
    if (player.utilities.length > CONSTANTS.MAX_UTILITIES) {
      player.utilities = player.utilities.slice(0, CONSTANTS.MAX_UTILITIES);
    }

    // Filter invalid ware types from market
    player.market = player.market.map(slot =>
      slot !== null && (WARE_TYPES as readonly string[]).includes(slot) ? slot : null
    );
  }

  // Ensure ware supply non-negative
  for (const wareType of WARE_TYPES) {
    normalized.wareSupply[wareType] = Math.max(0, normalized.wareSupply[wareType]);
  }

  // Ensure valid phase
  if (!['DRAW', 'PLAY', 'GAME_OVER'].includes(normalized.phase)) {
    normalized.phase = 'DRAW';
  }

  // Ensure valid currentPlayer
  if (normalized.currentPlayer !== 0 && normalized.currentPlayer !== 1) {
    normalized.currentPlayer = 0;
  }

  return normalized;
}
