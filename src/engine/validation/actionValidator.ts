// ============================================================================
// Action Validator - Pre-play validation for each card and action type
// ============================================================================

import type { GameState, DeckCardId, GameAction, WareType } from '../types.ts';
import { getCard, isDesign } from '../cards/CardDatabase.ts';
import { getPlacementCapacity, getSixthSpaceFee } from '../market/MarketManager.ts';
import { getSmallStandCost } from '../market/standCost.ts';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

const ok: ValidationResult = { valid: true };
const fail = (reason: string): ValidationResult => ({ valid: false, reason });

/**
 * Check if a game action is valid in the current state.
 */
export function validateAction(state: GameState, action: GameAction): ValidationResult {
  // Can't act during GAME_OVER
  if (state.phase === 'GAME_OVER') {
    return fail('Game is over');
  }

  // Can't act while pending resolution exists (except RESOLVE_INTERACTION and GUARD_REACTION)
  if (state.pendingResolution && action.type !== 'RESOLVE_INTERACTION') {
    return fail('Must resolve pending interaction first');
  }
  if (state.pendingGuardReaction && action.type !== 'GUARD_REACTION') {
    return fail('Must respond to Guard reaction first');
  }
  if (state.pendingWareCardReaction && action.type !== 'WARE_CARD_REACTION') {
    return fail('Must respond to ware card reaction first');
  }

  switch (action.type) {
    case 'DRAW_CARD':
      return validateDrawCard(state);
    case 'KEEP_CARD':
      return validateKeepCard(state);
    case 'DISCARD_DRAWN':
      return validateDiscardDrawn(state);
    case 'SKIP_DRAW':
      return validateSkipDraw(state);
    case 'PLAY_CARD':
      return validatePlayCard(state, action.cardId, action.wareMode);
    case 'ACTIVATE_UTILITY':
      return validateActivateUtility(state, action.utilityIndex);
    case 'END_TURN':
      return validateEndTurn(state);
    case 'RESOLVE_INTERACTION':
      return state.pendingResolution ? ok : fail('No pending interaction to resolve');
    case 'GUARD_REACTION':
      return state.pendingGuardReaction ? ok : fail('No pending Guard reaction');
    case 'WARE_CARD_REACTION':
      return state.pendingWareCardReaction ? ok : fail('No pending ware card reaction');
    default:
      return fail('Unknown action type');
  }
}

function validateDrawCard(state: GameState): ValidationResult {
  if (state.phase !== 'DRAW') {
    return fail('Can only draw during DRAW phase');
  }
  if (state.keptCardThisDrawPhase) {
    return fail('Already kept a card this draw phase');
  }
  if (state.drawnCard !== null) {
    return fail('Must keep or discard the current drawn card first');
  }
  if (state.actionsLeft <= 0) {
    return fail('No actions remaining');
  }
  if (state.deck.length === 0 && state.discardPile.length === 0) {
    return fail('No cards available to draw (deadlock)');
  }
  return ok;
}

function validateKeepCard(state: GameState): ValidationResult {
  if (state.phase !== 'DRAW') {
    return fail('Can only keep during DRAW phase');
  }
  if (state.drawnCard === null) {
    return fail('No card drawn to keep');
  }
  return ok;
}

function validateDiscardDrawn(state: GameState): ValidationResult {
  if (state.phase !== 'DRAW') {
    return fail('Can only discard during DRAW phase');
  }
  if (state.drawnCard === null) {
    return fail('No card drawn to discard');
  }
  return ok;
}

function validateSkipDraw(state: GameState): ValidationResult {
  if (state.phase !== 'DRAW') {
    return fail('Can only skip draw during DRAW phase');
  }
  if (state.drawnCard !== null) {
    return fail('Must keep or discard the current drawn card first');
  }
  return ok;
}

export function validatePlayCard(
  state: GameState,
  cardId: DeckCardId,
  wareMode?: 'buy' | 'sell'
): ValidationResult {
  if (state.phase !== 'PLAY') {
    return fail('Can only play cards during PLAY phase');
  }
  if (state.actionsLeft <= 0) {
    return fail('No actions remaining');
  }

  const player = state.players[state.currentPlayer];

  // Card must be in hand
  if (!player.hand.includes(cardId)) {
    return fail(`Card "${cardId}" not in hand`);
  }

  const cardDef = getCard(cardId);

  // Reaction-only cards cannot be played as normal PLAY_CARD actions.
  // They are only valid through their dedicated reaction flows.
  if (isDesign(cardId, 'guard') || isDesign(cardId, 'rain_maker')) {
    return fail(`Cannot play ${cardDef.name} during PLAY phase: it is a reaction card`);
  }

  // Ware cards require wareMode
  if (cardDef.type === 'ware') {
    if (!wareMode) {
      return fail('wareMode (buy or sell) is required when playing a ware card');
    }
    if (wareMode !== 'buy' && wareMode !== 'sell') {
      return fail(`Invalid wareMode: "${wareMode}"`);
    }

    const requiredWares = cardDef.wares!.types;

    if (wareMode === 'sell') {
      const requiredCounts: Partial<Record<WareType, number>> = {};
      for (const wareType of requiredWares) {
        requiredCounts[wareType] = (requiredCounts[wareType] ?? 0) + 1;
      }

      const marketCounts: Partial<Record<WareType, number>> = {};
      for (const slot of player.market) {
        if (slot !== null) {
          marketCounts[slot] = (marketCounts[slot] ?? 0) + 1;
        }
      }

      for (const [wareType, count] of Object.entries(requiredCounts)) {
        if ((marketCounts[wareType as WareType] ?? 0) < count!) {
          return fail('Cannot sell: player does not have the required wares');
        }
      }
    } else {
      const effectiveBuyPrice = Math.max(0, cardDef.wares!.buyPrice - state.turnModifiers.buyDiscount);
      const emptyMarketSlots = player.market.filter(slot => slot === null).length;
      if (emptyMarketSlots < requiredWares.length) {
        return fail('Cannot buy: insufficient market space');
      }
      // Filling the large stand's 6th space costs 2g on top of the price
      const totalCost = effectiveBuyPrice + getSixthSpaceFee(state, state.currentPlayer, requiredWares.length);
      if (player.gold < totalCost) {
        return fail(`Cannot buy: insufficient gold (need ${totalCost}g, have ${player.gold}g)`);
      }

      const requiredCounts: Partial<Record<WareType, number>> = {};
      for (const wareType of requiredWares) {
        requiredCounts[wareType] = (requiredCounts[wareType] ?? 0) + 1;
      }

      for (const [wareType, count] of Object.entries(requiredCounts)) {
        if (state.wareSupply[wareType as WareType] < count!) {
          return fail(`Cannot buy: insufficient ware supply (${wareType})`);
        }
      }
    }
  }

  // Stand card validation
  if (cardDef.type === 'stand') {
    const cost = getSmallStandCost(state);
    if (player.gold < cost) {
      return fail(`Not enough gold for stand: need ${cost}g, have ${player.gold}g`);
    }
  }

  // Animal card preconditions
  if (cardDef.type === 'animal') {
    const opponent: 0 | 1 = state.currentPlayer === 0 ? 1 : 0;
    const opPlayer = state.players[opponent];

    // Crocodile: opponent must have at least 1 utility
    if (isDesign(cardId, 'crocodile') && opPlayer.utilities.length === 0) {
      return fail('Cannot play Crocodile: opponent has no utilities');
    }
    // Parrot: opponent must have at least 1 ware
    if (isDesign(cardId, 'parrot')) {
      if (!opPlayer.market.some(w => w !== null)) {
        return fail('Cannot play Parrot: opponent has no wares');
      }
      if (getPlacementCapacity(state, state.currentPlayer) < 1) {
        return fail('Cannot play Parrot: your market has no room');
      }
    }
    // Elephant: both markets must have at least 1 ware total
    if (isDesign(cardId, 'elephant')) {
      const totalWares = player.market.filter(w => w !== null).length + opPlayer.market.filter(w => w !== null).length;
      if (totalWares === 0) return fail('Cannot play Elephant: no wares on either market');
    }
    // Ape: both hands must have at least 1 card total (excluding this card)
    if (isDesign(cardId, 'ape')) {
      const totalCards = (player.hand.length - 1) + opPlayer.hand.length; // -1 for the ape card itself
      if (totalCards === 0) return fail('Cannot play Ape: no other cards in either hand');
    }
    // Lion: both players must have at least 1 utility total
    if (isDesign(cardId, 'lion')) {
      const totalUtils = player.utilities.length + opPlayer.utilities.length;
      if (totalUtils === 0) return fail('Cannot play Lion: no utilities on either side');
    }
    // Snake: both players must have at least 1 utility total
    if (isDesign(cardId, 'snake')) {
      const totalUtils = player.utilities.length + opPlayer.utilities.length;
      if (totalUtils === 0) return fail('Cannot play Snake: no utilities on either side');
    }
    // Hyena: opponent must have at least 1 card in hand
    if (isDesign(cardId, 'hyena') && opPlayer.hand.length === 0) {
      return fail('Cannot play Hyena: opponent has no cards in hand');
    }
    if (isDesign(cardId, 'hyena') && player.hand.length <= 1) {
      return fail('Cannot play Hyena: need another card in hand to give');
    }
  }

  // People card preconditions
  if (cardDef.type === 'people') {
    // Drummer: discard pile must contain at least 1 utility
    if (isDesign(cardId, 'drummer') && !state.discardPile.some(id => getCard(id).type === 'utility')) {
      return fail('Cannot play Drummer: no utility cards in discard pile');
    }
    // Dancer: hand must have at least 1 other ware card, market must have >= 3 wares
    if (isDesign(cardId, 'dancer')) {
      const otherWareCards = player.hand.filter(id => id !== cardId && getCard(id).type === 'ware');
      if (otherWareCards.length === 0) {
        return fail('Cannot play Dancer: no ware cards in hand');
      }
      if (player.market.filter(w => w !== null).length < 3) {
        return fail('Cannot play Dancer: need at least 3 wares in market');
      }
    }
    // Basket Maker: need 2g, 2 empty market slots, and at least 1 ware type in supply
    if (isDesign(cardId, 'basket_maker')) {
      if (player.gold < 2) return fail('Cannot play Basket Maker: need at least 2g');
      // Takes up to 2 wares; with room for only 1, the other stays in the supply
      if (getPlacementCapacity(state, state.currentPlayer, player.gold - 2) < 1) return fail('Cannot play Basket Maker: no room on your market stands');
      if (!Object.values(state.wareSupply).some(v => v > 0)) return fail('Cannot play Basket Maker: no wares in supply');
    }
    // Shaman: need at least 1 ware in market to trade
    if (isDesign(cardId, 'shaman') && !player.market.some(w => w !== null)) {
      return fail('Cannot play Shaman: no wares in market to trade');
    }
    // Portuguese: need at least 1 ware in market to sell
    if (isDesign(cardId, 'portuguese') && !player.market.some(w => w !== null)) {
      return fail('Cannot play Portuguese: no wares in market to sell');
    }
    // Traveling Merchant: auctions 2 supply wares — needs supply and room to receive them
    if (isDesign(cardId, 'traveling_merchant')) {
      // Playing it opens the bidding at 1g on your behalf
      if (player.gold < 1) {
        return fail('Cannot play Traveling Merchant: need at least 1g for the opening bid');
      }
      if (!Object.values(state.wareSupply).some(v => v > 0)) {
        return fail('Cannot play Traveling Merchant: no wares in supply');
      }
      if (player.market.filter(w => w === null).length < 2) {
        return fail('Cannot play Traveling Merchant: need at least 2 empty market slots');
      }
    }
    // Arabian Merchant: auctions the top 3 deck cards — deck must not be empty
    if (isDesign(cardId, 'arabian_merchant') && state.deck.length === 0) {
      return fail('Cannot play Arabian Merchant: draw deck is empty');
    }
  }

  return ok;
}

export function validateActivateUtility(state: GameState, utilityIndex: number): ValidationResult {
  if (state.actionsLeft <= 0) {
    return fail('No actions remaining');
  }

  const player = state.players[state.currentPlayer];
  const opponent: 0 | 1 = state.currentPlayer === 0 ? 1 : 0;

  if (utilityIndex < 0 || utilityIndex >= player.utilities.length) {
    return fail(`Invalid utility index ${utilityIndex}`);
  }

  const utility = player.utilities[utilityIndex];

  // Mask of Transformation can ONLY be activated during DRAW phase (before drawing).
  // All other utilities can ONLY be activated during PLAY phase.
  if (utility.designId === 'mask_of_transformation') {
    if (state.phase !== 'DRAW') {
      return fail('Mask of Transformation can only be activated before drawing');
    }
    if (state.drawnCard !== null) {
      return fail('Cannot activate Mask of Transformation after drawing a card');
    }
  } else {
    if (state.phase !== 'PLAY') {
      return fail('Can only activate utilities during PLAY phase');
    }
  }

  if (utility.usedThisTurn) {
    return fail(`Utility "${utility.cardId}" already used this turn`);
  }

  // Utility-specific precondition checks
  switch (utility.designId) {
    case 'well':
      if (player.gold < 1) return fail('Cannot activate Well: need at least 1g');
      break;
    case 'supplies':
      if (player.gold < 1 && player.hand.length === 0) return fail('Cannot activate Supplies: need at least 1g or 1 card in hand');
      break;
    case 'leopard_statue':
      if (player.gold < 2) return fail('Cannot activate Leopard Statue: need at least 2g');
      if (getPlacementCapacity(state, state.currentPlayer, player.gold - 2) < 1) return fail('Cannot activate Leopard Statue: no room on your market stands');
      if (!Object.values(state.wareSupply).some(v => v > 0)) return fail('Cannot activate Leopard Statue: no wares available in supply');
      break;
    case 'throne':
      if (!state.players[opponent].market.some(w => w !== null)) return fail('Cannot activate Throne: opponent has no wares');
      // Throne exchanges wares — you need one to give
      if (!player.market.some(w => w !== null)) return fail('Cannot activate Throne: you have no wares to exchange');
      break;
    case 'drums':
      if (!player.market.some(w => w !== null)) return fail('Cannot activate Drums: no wares in market to return');
      break;
    case 'boat':
      if (player.hand.length === 0) return fail('Cannot activate Boat: no cards in hand to discard');
      if (getPlacementCapacity(state, state.currentPlayer) < 1) return fail('Cannot activate Boat: no room on your market stands');
      break;
    case 'weapons':
      if (player.hand.length === 0) return fail('Cannot activate Weapons: no cards in hand to discard');
      break;
    case 'kettle':
      if (player.hand.length === 0) return fail('Cannot activate Kettle: no cards in hand to discard');
      break;
    case 'mask_of_transformation':
      if (player.hand.length === 0) return fail('Cannot activate Mask: no cards in hand to trade');
      if (state.discardPile.length === 0) return fail('Cannot activate Mask: discard pile is empty');
      break;
  }

  return ok;
}

function validateEndTurn(state: GameState): ValidationResult {
  if (state.phase !== 'PLAY') {
    return fail('Can only end turn during PLAY phase');
  }
  if (state.pendingResolution) {
    return fail('Must resolve pending interaction before ending turn');
  }
  return ok;
}

/**
 * Get all valid actions for the current state.
 * Used by AI and UI to show available moves.
 */
export function getValidActions(state: GameState): GameAction[] {
  const actions: GameAction[] = [];

  if (state.phase === 'GAME_OVER') return actions;

  // Pending resolution takes priority
  if (state.pendingResolution) {
    return actions;
  }

  if (state.pendingGuardReaction) {
    actions.push({ type: 'GUARD_REACTION', play: true });
    actions.push({ type: 'GUARD_REACTION', play: false });
    return actions;
  }

  if (state.pendingWareCardReaction) {
    actions.push({ type: 'WARE_CARD_REACTION', play: true });
    actions.push({ type: 'WARE_CARD_REACTION', play: false });
    return actions;
  }

  const player = state.players[state.currentPlayer];

  if (state.phase === 'DRAW') {
      // Pre-draw Mask window
      for (let i = 0; i < player.utilities.length; i++) {
        if (validateActivateUtility(state, i).valid) {
          actions.push({ type: 'ACTIVATE_UTILITY', utilityIndex: i });
        }
      }

    if (validateDrawCard(state).valid) {
      actions.push({ type: 'DRAW_CARD' });
    }
    if (validateKeepCard(state).valid) {
      actions.push({ type: 'KEEP_CARD' });
    }
    if (validateDiscardDrawn(state).valid) {
      actions.push({ type: 'DISCARD_DRAWN' });
    }
    if (validateSkipDraw(state).valid) {
      actions.push({ type: 'SKIP_DRAW' });
    }
  }

  if (state.phase === 'PLAY') {
    if (state.actionsLeft > 0) {
      for (const cardId of player.hand) {
        const cardDef = getCard(cardId);
        if (cardDef.type === 'ware') {
          // Ware cards produce two possible actions: buy and sell
          const buyAction: GameAction = { type: 'PLAY_CARD', cardId, wareMode: 'buy' };
          const sellAction: GameAction = { type: 'PLAY_CARD', cardId, wareMode: 'sell' };
          if (validatePlayCard(state, cardId, 'buy').valid) actions.push(buyAction);
          if (validatePlayCard(state, cardId, 'sell').valid) actions.push(sellAction);
        } else {
          if (validatePlayCard(state, cardId).valid) {
            actions.push({ type: 'PLAY_CARD', cardId });
          }
        }
      }

      // Activate utilities
      for (let i = 0; i < player.utilities.length; i++) {
        if (validateActivateUtility(state, i).valid) {
          actions.push({ type: 'ACTIVATE_UTILITY', utilityIndex: i });
        }
      }
    }

    // Can always end turn during PLAY
    actions.push({ type: 'END_TURN' });
  }

  return actions;
}
