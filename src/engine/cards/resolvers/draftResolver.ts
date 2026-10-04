// ============================================================================
// Draft Resolver - Elephant (wares), Ape (cards), Lion (utilities)
// ============================================================================

import type {
  GameState,
  PendingDraft,
  InteractionResponse,
  WareType,
  DeckCardId,
  PlayerState,
  UtilityState,
  UtilityDesignId,
} from '../../types.ts';
import { CONSTANTS } from '../../types.ts';
import { addWareToMarket, getPlacementCapacity } from '../../market/MarketManager.ts';
import { returnToSupply } from '../../market/WareSupply.ts';
import { discardCard } from '../../deck/DeckManager.ts';
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

export function resolveDraft(
  state: GameState,
  pending: PendingDraft,
  response: InteractionResponse
): GameState {
  switch (pending.draftMode) {
    case 'wares':
      return resolveWareDraft(state, pending, response);
    case 'cards':
      return resolveCardDraft(state, pending, response);
    case 'utilities':
      return resolveUtilityDraft(state, pending, response);
    default:
      throw new Error(`Unknown draft mode: ${pending.draftMode}`);
  }
}

// ---------------------------------------------------------------------------
// Elephant: Ware draft — pool wares from BOTH players' markets
// ---------------------------------------------------------------------------

function resolveWareDraft(
  state: GameState,
  pending: PendingDraft,
  response: InteractionResponse
): GameState {
  if (pending.availableWares.length === 0) {
    // No wares to draft — resolve immediately
    return { ...state, pendingResolution: null };
  }

  // Pick phase
  if (response.type !== 'SELECT_WARE') {
    throw new Error('Expected SELECT_WARE response for ware draft pick');
  }

  const { wareIndex } = response;
  if (wareIndex < 0 || wareIndex >= pending.availableWares.length) {
    throw new Error(`Invalid ware index ${wareIndex} for draft`);
  }

  const pickedWare = pending.availableWares[wareIndex];
  const picker = pending.currentPicker;

  let newState = state;
  if (getPlacementCapacity(newState, picker) > 0) {
    newState = addWareToMarket(newState, picker, pickedWare);
  } else {
    // No room (or can't pay the 6th-space fee): the ware goes back to the supply
    newState = returnToSupply(newState, pickedWare, 1);
  }

  const newPicks: [WareType[], WareType[]] = [
    [...pending.picks[0]],
    [...pending.picks[1]],
  ];
  newPicks[picker].push(pickedWare);

  const newAvailable = pending.availableWares.filter((_, i) => i !== wareIndex);

  if (newAvailable.length === 0) {
    return {
      ...newState,
      pendingResolution: null,
      log: [...newState.log, {
        turn: state.turn,
        player: state.currentPlayer,
        action: 'DRAFT_COMPLETE',
        details: `Ware draft finished: P0 got [${newPicks[0].join(',')}], P1 got [${newPicks[1].join(',')}]`,
      }],
    };
  }

  const nextPicker: 0 | 1 = picker === 0 ? 1 : 0;

  return {
    ...newState,
    pendingResolution: {
      ...pending,
      availableWares: newAvailable,
      currentPicker: nextPicker,
      picks: newPicks,
    },
  };
}

// ---------------------------------------------------------------------------
// Ape: Card draft — pool hand cards from both players
// ---------------------------------------------------------------------------

function resolveCardDraft(
  state: GameState,
  pending: PendingDraft,
  response: InteractionResponse
): GameState {
  if (!pending.availableCards || pending.availableCards.length === 0) {
    // No cards to draft — resolve immediately
    return { ...state, pendingResolution: null };
  }

  // Pick phase
  if (response.type !== 'SELECT_CARD') {
    throw new Error('Expected SELECT_CARD response for card draft pick');
  }

  const { cardId } = response;
  if (!pending.availableCards.includes(cardId)) {
    throw new Error(`Card ${cardId} not available for draft`);
  }

  const picker = pending.currentPicker;
  let newState = state;

  // Add card to picker's hand
  const pickerHand = [...newState.players[picker].hand, cardId];
  newState = withPlayer(newState, picker, { hand: pickerHand });

  const newCardPicks: [DeckCardId[], DeckCardId[]] = [
    [...(pending.cardPicks?.[0] ?? [])],
    [...(pending.cardPicks?.[1] ?? [])],
  ];
  newCardPicks[picker].push(cardId);

  const newAvailable = pending.availableCards.filter(id => id !== cardId);

  if (newAvailable.length === 0) {
    return {
      ...newState,
      pendingResolution: null,
      log: [...newState.log, {
        turn: state.turn,
        player: state.currentPlayer,
        action: 'DRAFT_COMPLETE',
        details: `Card draft finished`,
      }],
    };
  }

  const nextPicker: 0 | 1 = picker === 0 ? 1 : 0;

  return {
    ...newState,
    pendingResolution: {
      ...pending,
      availableCards: newAvailable,
      currentPicker: nextPicker,
      cardPicks: newCardPicks,
    },
  };
}

// ---------------------------------------------------------------------------
// Lion: Utility draft — pool utility cards from both players
// ---------------------------------------------------------------------------

function resolveUtilityDraft(
  state: GameState,
  pending: PendingDraft,
  response: InteractionResponse
): GameState {
  if (!pending.availableCards || pending.availableCards.length === 0) {
    // No utilities to draft — resolve immediately
    return { ...state, pendingResolution: null };
  }

  // Pick phase
  if (response.type !== 'SELECT_CARD') {
    throw new Error('Expected SELECT_CARD response for utility draft pick');
  }

  const { cardId } = response;
  if (!pending.availableCards.includes(cardId)) {
    throw new Error(`Card ${cardId} not available for draft`);
  }

  const picker = pending.currentPicker;
  let newState = state;

  // Add utility to picker (max 3 each)
  const pickerUtils = newState.players[picker].utilities;
  if (pickerUtils.length < CONSTANTS.MAX_UTILITIES) {
    // Get design info from card database
    const cardDef = getCard(cardId);
    const newUtils: UtilityState[] = [
      ...pickerUtils,
      {
        cardId,
        designId: cardDef.designId as UtilityDesignId,
        usedThisTurn: false,
      },
    ];
    newState = withPlayer(newState, picker, { utilities: newUtils });
  } else {
    // Max utilities — discard
    newState = discardCard(newState, cardId);
  }

  const newCardPicks: [DeckCardId[], DeckCardId[]] = [
    [...(pending.cardPicks?.[0] ?? [])],
    [...(pending.cardPicks?.[1] ?? [])],
  ];
  newCardPicks[picker].push(cardId);

  const newAvailable = pending.availableCards.filter(id => id !== cardId);

  if (newAvailable.length === 0) {
    return {
      ...newState,
      pendingResolution: null,
      log: [...newState.log, {
        turn: state.turn,
        player: state.currentPlayer,
        action: 'DRAFT_COMPLETE',
        details: `Utility draft finished`,
      }],
    };
  }

  const nextPicker: 0 | 1 = picker === 0 ? 1 : 0;

  return {
    ...newState,
    pendingResolution: {
      ...pending,
      availableCards: newAvailable,
      currentPicker: nextPicker,
      cardPicks: newCardPicks,
    },
  };
}

