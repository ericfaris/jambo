// ============================================================================
// Supplies Discard Resolver - Follow-up for Supplies binary choice (discard)
// Player picks card to discard, then draw-until-ware executes.
// ============================================================================

import type {
  DeckCardId,
  GameState,
  PendingSuppliesDiscard,
  InteractionResponse,
  PlayerState,
} from '../../types.ts';
import { drawFromDeck, discardCard } from '../../deck/DeckManager.ts';
import { getCard } from '../CardDatabase.ts';

function withPlayer(
  state: GameState,
  player: 0 | 1,
  updates: Partial<PlayerState>
): GameState {
  const newPlayers: [PlayerState, PlayerState] = [
    player === 0 ? { ...state.players[0], ...updates } : state.players[0],
    player === 1 ? { ...state.players[1], ...updates } : state.players[1],
  ];
  return { ...state, players: newPlayers };
}

/**
 * Draw cards from deck until a ware card is found. Keep the ware, discard the rest.
 */
export function drawUntilWare(state: GameState, player: 0 | 1): GameState {
  return drawUntilWareFound(state, player).state;
}

/**
 * drawUntilWare, also returning the ware card found. Every card is revealed,
 * the kept ware card included ("if you use the utility supplies, you reveal
 * every card" — Rüdiger Dorn, BGG 2007), so the caller logs it face up.
 */
export function drawUntilWareFound(state: GameState, player: 0 | 1): { state: GameState; found: DeckCardId | null } {
  let next = state;
  const maxAttempts = next.deck.length + next.discardPile.length;
  let attempts = 0;

  while ((next.deck.length > 0 || next.discardPile.length > 0) && attempts < maxAttempts) {
    const result = drawFromDeck(next);
    if (!result.card) break;
    attempts++;
    next = result.state;
    const card = getCard(result.card);
    if (card.type === 'ware') {
      // Found a ware card — add to hand
      const newHand = [...next.players[player].hand, result.card];
      next = withPlayer(next, player, { hand: newHand });
      return { state: next, found: result.card };
    }
    // Not a ware — discard it
    next = discardCard(next, result.card);
  }
  return { state: next, found: null }; // Deck exhausted without finding a ware
}

/** Log line for a Supplies search: the ware card found is public. */
export function suppliesFoundLog(state: GameState, player: 0 | 1, action: string, prefix: string, found: DeckCardId | null): GameState {
  return {
    ...state,
    log: [...state.log, {
      turn: state.turn,
      player,
      action,
      details: found ? `${prefix}, revealed cards until a ware card: found ${found}` : `${prefix}, no ware card left to find`,
      ...(found ? { card: found } : {}),
    }],
  };
}

export function resolveSuppliesDiscard(
  state: GameState,
  _pending: PendingSuppliesDiscard,
  response: InteractionResponse
): GameState {
  const cp = state.currentPlayer;

  // Guard: no cards in hand — skip discard, just draw until ware
  if (state.players[cp].hand.length === 0) {
    const { state: drawn, found } = drawUntilWareFound(state, cp);
    return suppliesFoundLog({ ...drawn, pendingResolution: null }, cp, 'SUPPLIES_DRAW', 'No cards to discard', found);
  }

  if (response.type !== 'SELECT_CARD') {
    throw new Error('Expected SELECT_CARD response for Supplies discard');
  }

  const { cardId } = response;
  const hand = state.players[cp].hand;

  if (!hand.includes(cardId)) {
    throw new Error(`Card ${cardId} not in hand`);
  }

  // Discard the selected card
  const newHand = hand.filter(id => id !== cardId);
  let next = withPlayer(state, cp, { hand: newHand });
  next = discardCard(next, cardId);

  // Draw until ware
  const { state: drawn, found } = drawUntilWareFound(next, cp);
  return suppliesFoundLog({ ...drawn, pendingResolution: null }, cp, 'SUPPLIES_DRAW', `Discarded ${cardId}`, found);
}
