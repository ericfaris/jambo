// ============================================================================
// Ware Cash Conversion Resolver - Dancer (discard ware card, return wares, get gold)
// ============================================================================

import type { GameState, PendingWareCashConversion, InteractionResponse } from '../../types.ts';
import { getCard } from '../CardDatabase.ts';
import { returnToSupply } from '../../market/WareSupply.ts';

export function resolveWareCashConversion(
  state: GameState,
  pending: PendingWareCashConversion,
  response: InteractionResponse
): GameState {
  const activePlayer = state.currentPlayer;

  if (pending.step === 'SELECT_CARD') {
    // Guard: no ware cards in hand — auto-resolve
    const wareCardsInHand = state.players[activePlayer].hand.filter(id => getCard(id).type === 'ware');
    if (wareCardsInHand.length === 0) {
      return {
        ...state,
        pendingResolution: null,
        log: [...state.log, { turn: state.turn, player: activePlayer, action: 'DANCER_CONVERSION', details: 'No ware cards in hand' }],
      };
    }

    // Step 1: Select a ware card from hand to discard
    if (response.type !== 'SELECT_CARD') {
      throw new Error('Expected SELECT_CARD response for Dancer card selection');
    }
    const { cardId } = response;
    const card = getCard(cardId);

    if (card.type !== 'ware' || !card.wares) {
      throw new Error('Must select a ware card');
    }
    if (!state.players[activePlayer].hand.includes(cardId)) {
      throw new Error('Card not in hand');
    }

    return {
      ...state,
      pendingResolution: {
        ...pending,
        step: 'SELECT_WARES',
        selectedCard: cardId,
      },
    };
  }

  if (pending.step === 'SELECT_WARES') {
    // Guard: not enough wares in market — auto-resolve (discard card, no gold)
    const filledSlots = state.players[activePlayer].market.filter(w => w !== null);
    if (filledSlots.length < 3) {
      return {
        ...state,
        pendingResolution: null,
        log: [...state.log, { turn: state.turn, player: activePlayer, action: 'DANCER_CONVERSION', details: 'Not enough wares in market (need 3)' }],
      };
    }

    // Step 2: Select 3 wares from market to return
    if (response.type !== 'SELECT_WARES') {
      throw new Error('Expected SELECT_WARES response for Dancer ware return');
    }
    if (response.wareIndices.length !== 3) {
      throw new Error('Must select exactly 3 wares to return');
    }

    const market = state.players[activePlayer].market;
    // Validate all indices are occupied
    for (const idx of response.wareIndices) {
      if (idx < 0 || idx >= market.length || market[idx] === null) {
        throw new Error(`Invalid or empty market slot ${idx}`);
      }
    }

    // Get the selected ware card's sell price (gold earned)
    const selectedCard = getCard(pending.selectedCard!);
    // Wise Man from Afar's sell bonus applies to the Dancer's sale too (house rule, 2026-10-04)
    const goldEarned = selectedCard.wares!.sellPrice + state.turnModifiers.sellBonus;

    // Remove card from hand, discard it
    const newHand = state.players[activePlayer].hand.filter(c => c !== pending.selectedCard);

    // Remove 3 wares from market, return to supply
    const newMarket = [...market];
    let newState = state;
    for (const idx of response.wareIndices) {
      const ware = newMarket[idx]!;
      newState = returnToSupply(newState, ware, 1);
      newMarket[idx] = null;
    }

    // Add gold and update hand + market
    const newPlayers = [...newState.players] as [typeof newState.players[0], typeof newState.players[1]];
    newPlayers[activePlayer] = {
      ...newPlayers[activePlayer],
      hand: newHand,
      market: newMarket,
      gold: newPlayers[activePlayer].gold + goldEarned,
    };

    return {
      ...newState,
      players: newPlayers,
      discardPile: [pending.selectedCard!, ...newState.discardPile],
      pendingResolution: null,
      log: [...newState.log, {
        turn: state.turn,
        player: activePlayer,
        action: 'DANCER_CONVERSION',
        details: `Discarded ${pending.selectedCard}, returned 3 wares, earned ${goldEarned}g`,
      }],
    };
  }

  throw new Error(`Unknown Dancer step: ${pending.step}`);
}
