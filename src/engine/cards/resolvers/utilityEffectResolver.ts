// ============================================================================
// Utility Effect Resolver - Drums, Boat, Scale, Kettle, Leopard Statue, Weapons
// ============================================================================

import type {
  GameState,
  PendingUtilityEffect,
  InteractionResponse,
  WareType,
  PlayerState,
} from '../../types.ts';
import { drawFromDeck, discardCard } from '../../deck/DeckManager.ts';
import { addWareToMarket, getPlacementCapacity } from '../../market/MarketManager.ts';
import { takeFromSupply, returnToSupply } from '../../market/WareSupply.ts';

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

function withLog(state: GameState, action: string, details: string): GameState {
  return {
    ...state,
    log: [...state.log, { turn: state.turn, player: state.currentPlayer, action, details }],
  };
}

export function resolveUtilityEffect(
  state: GameState,
  pending: PendingUtilityEffect,
  response: InteractionResponse
): GameState {
  switch (pending.utilityDesign) {
    case 'drums':
      return resolveDrums(state, pending, response);
    case 'boat':
      return resolveBoat(state, pending, response);
    case 'scale':
      return resolveScale(state, pending, response);
    case 'kettle':
      return resolveKettle(state, pending, response);
    case 'leopard_statue':
      return resolveLeopardStatue(state, pending, response);
    case 'weapons':
      return resolveWeapons(state, pending, response);
    default:
      throw new Error(`Unknown utility design: ${pending.utilityDesign}`);
  }
}

/**
 * Drums: Return 1 ware from YOUR market to supply, draw 1 card.
 * Step SELECT_CARD uses RETURN_WARE response (selecting ware slot index).
 */
function resolveDrums(
  state: GameState,
  _pending: PendingUtilityEffect,
  response: InteractionResponse
): GameState {
  const cp = state.currentPlayer;
  const market = state.players[cp].market;

  // Guard: no wares in market — just draw a card
  if (!market.some(w => w !== null)) {
    let next = state;
    const drawResult = drawFromDeck(next);
    if (drawResult.card) {
      next = drawResult.state;
      next = withPlayer(next, cp, { hand: [...next.players[cp].hand, drawResult.card] });
    } else {
      next = drawResult.state;
    }
    next = { ...next, pendingResolution: null };
    next = withLog(next, 'DRUMS_EFFECT', 'No wares to return, drew a card');
    return next;
  }

  if (response.type !== 'RETURN_WARE') {
    throw new Error('Expected RETURN_WARE response for Drums');
  }

  const { wareIndex } = response;

  if (wareIndex < 0 || wareIndex >= market.length || market[wareIndex] === null) {
    throw new Error(`Invalid or empty market slot ${wareIndex}`);
  }

  const ware = market[wareIndex] as WareType;

  // Remove ware from own market
  const newMarket = [...market];
  newMarket[wareIndex] = null;
  let next = withPlayer(state, cp, { market: newMarket });

  // Return to supply
  next = returnToSupply(next, ware, 1);

  // Draw 1 card
  const drawResult = drawFromDeck(next);
  if (drawResult.card) {
    next = drawResult.state;
    const newHand = [...next.players[cp].hand, drawResult.card];
    next = withPlayer(next, cp, { hand: newHand });
  } else {
    next = drawResult.state;
  }

  next = { ...next, pendingResolution: null };
  next = withLog(next, 'DRUMS_EFFECT', `Returned ${ware}, drew a card`);

  return next;
}

/**
 * Boat: Discard 1 card from hand, choose 1 ware type from supply.
 * Step SELECT_CARD: player picks card to discard.
 * Step SELECT_WARE_TYPE: player picks ware type to receive.
 */
function resolveBoat(
  state: GameState,
  pending: PendingUtilityEffect,
  response: InteractionResponse
): GameState {
  const cp = state.currentPlayer;

  if (pending.step === 'SELECT_CARD') {
    // Guard: no cards in hand — auto-resolve (skip to no effect)
    if (state.players[cp].hand.length === 0) {
      let next: GameState = { ...state, pendingResolution: null };
      next = withLog(next, 'BOAT_EFFECT', 'No cards in hand to discard');
      return next;
    }

    if (response.type !== 'SELECT_CARD') {
      throw new Error('Expected SELECT_CARD response for Boat');
    }
    const { cardId } = response;
    const hand = state.players[cp].hand;
    if (!hand.includes(cardId)) {
      throw new Error(`Card ${cardId} not in hand`);
    }

    // Remove card from hand and discard
    const newHand = hand.filter(id => id !== cardId);
    let next = withPlayer(state, cp, { hand: newHand });
    next = discardCard(next, cardId);

    return {
      ...next,
      pendingResolution: {
        ...pending,
        step: 'SELECT_WARE_TYPE',
        selectedCards: [cardId],
      },
    };
  }

  if (pending.step === 'SELECT_WARE_TYPE') {
    // Guard: no market space or no available supply — auto-resolve
    const hasAnySupply = Object.values(state.wareSupply).some(v => v > 0);
    if (getPlacementCapacity(state, cp) < 1 || !hasAnySupply) {
      let next: GameState = { ...state, pendingResolution: null };
      next = withLog(next, 'BOAT_EFFECT', 'Cannot receive ware (no market space or supply)');
      return next;
    }

    if (response.type !== 'SELECT_WARE_TYPE') {
      throw new Error('Expected SELECT_WARE_TYPE response for Boat');
    }
    const { wareType } = response;

    // Check supply
    if (state.wareSupply[wareType] < 1) {
      throw new Error(`No ${wareType} in supply`);
    }

    // Check market space (the 6th large-stand space needs its 2g fee)
    if (getPlacementCapacity(state, cp) < 1) {
      throw new Error('No room on market stands');
    }

    let next = takeFromSupply(state, wareType, 1);
    next = addWareToMarket(next, cp, wareType);
    next = { ...next, pendingResolution: null };
    next = withLog(next, 'BOAT_EFFECT', `Discarded card, received ${wareType}`);

    return next;
  }

  throw new Error(`Unknown Boat step: ${pending.step}`);
}

/**
 * Scale: Draw 2 cards, keep 1, give 1 to opponent.
 * Auto-draws 2 on first call, then player picks which to keep.
 */
function resolveScale(
  state: GameState,
  pending: PendingUtilityEffect,
  response: InteractionResponse
): GameState {
  const cp = state.currentPlayer;
  const opponent: 0 | 1 = cp === 0 ? 1 : 0;

  if (pending.step === 'SELECT_CARD') {
    // If no cards drawn yet, draw 2 first
    if (!pending.selectedCards || pending.selectedCards.length === 0) {
      let next = state;
      const drawn: string[] = [];
      for (let i = 0; i < 2; i++) {
        const result = drawFromDeck(next);
        if (result.card) {
          next = result.state;
          drawn.push(result.card);
        }
      }

      if (drawn.length === 0) {
        return { ...next, pendingResolution: null };
      }

      if (drawn.length === 1) {
        // Only 1 card drawn — auto-keep
        const newHand = [...next.players[cp].hand, drawn[0]];
        next = withPlayer(next, cp, { hand: newHand });
        next = { ...next, pendingResolution: null };
        next = withLog(next, 'SCALE_EFFECT', `Drew 1 card and kept it`);
        return next;
      }

      // Present drawn cards to player for selection
      return {
        ...next,
        pendingResolution: {
          ...pending,
          selectedCards: drawn,
        },
      };
    }

    // Player picks which card to keep
    if (response.type !== 'SELECT_CARD') {
      throw new Error('Expected SELECT_CARD response for Scale');
    }
    const { cardId } = response;
    const drawn = pending.selectedCards!;
    if (!drawn.includes(cardId)) {
      throw new Error(`Card ${cardId} not among drawn cards`);
    }

    const otherCard = drawn.find(id => id !== cardId)!;
    let next = state;

    // Keep selected card
    const activeHand = [...next.players[cp].hand, cardId];
    next = withPlayer(next, cp, { hand: activeHand });

    // Give other card to opponent
    const opponentHand = [...next.players[opponent].hand, otherCard];
    next = withPlayer(next, opponent, { hand: opponentHand });

    next = { ...next, pendingResolution: null };
    next = withLog(next, 'SCALE_EFFECT', `Kept ${cardId}, gave ${otherCard} to opponent`);

    return next;
  }

  throw new Error(`Unknown Scale step: ${pending.step}`);
}

/**
 * Kettle: Discard 1-2 cards from hand, draw same number.
 * Step SELECT_CARD: player picks 1-2 cards (via SELECT_CARDS response).
 */
function resolveKettle(
  state: GameState,
  _pending: PendingUtilityEffect,
  response: InteractionResponse
): GameState {
  const cp = state.currentPlayer;

  // Guard: no cards in hand — auto-resolve
  if (state.players[cp].hand.length === 0) {
    let next: GameState = { ...state, pendingResolution: null };
    next = withLog(next, 'KETTLE_EFFECT', 'No cards in hand to discard');
    return next;
  }

  if (response.type !== 'SELECT_CARDS') {
    throw new Error('Expected SELECT_CARDS response for Kettle');
  }
  const { cardIds } = response;

  if (cardIds.length < 1 || cardIds.length > 2) {
    throw new Error('Kettle: must discard 1 or 2 cards');
  }

  const hand = state.players[cp].hand;
  for (const id of cardIds) {
    if (!hand.includes(id)) {
      throw new Error(`Card ${id} not in hand`);
    }
  }

  // Remove cards from hand and discard
  let newHand = hand.filter(id => !cardIds.includes(id));
  let next = withPlayer(state, cp, { hand: newHand });
  for (const id of cardIds) {
    next = discardCard(next, id);
  }

  // Draw same number of cards
  for (let i = 0; i < cardIds.length; i++) {
    const result = drawFromDeck(next);
    if (result.card) {
      next = result.state;
      newHand = [...next.players[cp].hand, result.card];
      next = withPlayer(next, cp, { hand: newHand });
    } else {
      next = result.state;
    }
  }

  next = { ...next, pendingResolution: null };
  next = withLog(next, 'KETTLE_EFFECT', `Discarded ${cardIds.length} card(s), drew ${cardIds.length}`);

  return next;
}

/**
 * Leopard Statue: Pay 2g, choose 1 ware type from supply.
 * Step SELECT_WARE_TYPE: player picks ware type.
 */
function resolveLeopardStatue(
  state: GameState,
  _pending: PendingUtilityEffect,
  response: InteractionResponse
): GameState {
  const cp = state.currentPlayer;

  // Guard: insufficient gold, no market space, or no available supply — auto-resolve
  const hasAnySupply = Object.values(state.wareSupply).some(v => v > 0);
  if (state.players[cp].gold < 2 || getPlacementCapacity(state, cp, state.players[cp].gold - 2) < 1 || !hasAnySupply) {
    let next: GameState = { ...state, pendingResolution: null };
    next = withLog(next, 'LEOPARD_STATUE_EFFECT', 'Cannot receive ware from Leopard Statue');
    return next;
  }

  if (response.type !== 'SELECT_WARE_TYPE') {
    throw new Error('Expected SELECT_WARE_TYPE response for Leopard Statue');
  }
  const { wareType } = response;

  if (state.wareSupply[wareType] < 1) {
    throw new Error(`No ${wareType} in supply`);
  }

  let next = withPlayer(state, cp, { gold: state.players[cp].gold - 2 });
  next = takeFromSupply(next, wareType, 1);
  next = addWareToMarket(next, cp, wareType);
  next = { ...next, pendingResolution: null };
  next = withLog(next, 'LEOPARD_STATUE_EFFECT', `Paid 2g, received ${wareType}`);

  return next;
}

/**
 * Weapons: Discard 1 card from hand, receive 2g.
 * Step SELECT_CARD: player picks card to discard.
 */
function resolveWeapons(
  state: GameState,
  _pending: PendingUtilityEffect,
  response: InteractionResponse
): GameState {
  const cp = state.currentPlayer;

  // Guard: no cards in hand — auto-resolve (still get 2g)
  if (state.players[cp].hand.length === 0) {
    let next = withPlayer(state, cp, { gold: state.players[cp].gold + 2 });
    next = { ...next, pendingResolution: null };
    next = withLog(next, 'WEAPONS_EFFECT', 'No cards to discard, received 2g');
    return next;
  }

  if (response.type !== 'SELECT_CARD') {
    throw new Error('Expected SELECT_CARD response for Weapons');
  }
  const { cardId } = response;

  const hand = state.players[cp].hand;
  if (!hand.includes(cardId)) {
    throw new Error(`Card ${cardId} not in hand`);
  }

  // Discard the card
  const newHand = hand.filter(id => id !== cardId);
  let next = withPlayer(state, cp, { hand: newHand });
  next = discardCard(next, cardId);

  // Receive 2g
  next = withPlayer(next, cp, { gold: next.players[cp].gold + 2 });

  next = { ...next, pendingResolution: null };
  next = withLog(next, 'WEAPONS_EFFECT', `Discarded ${cardId}, received 2g`);

  return next;
}
