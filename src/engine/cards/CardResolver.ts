// ============================================================================
// Card Resolver - Dispatches card play/activation to the correct resolver
// ============================================================================

import type { GameState, DeckCardId, InteractionResponse, PendingResolution, WareType } from '../types.ts';
import { getCard, isDesign } from './CardDatabase.ts';
import { resolveWareTrade } from './resolvers/wareTradeResolver.ts';
import { resolveActiveSelect } from './resolvers/activeSelectResolver.ts';
import { resolveOpponentSelect } from './resolvers/opponentSelectResolver.ts';
import { resolveAuction } from './resolvers/auctionResolver.ts';
import { resolveDraft } from './resolvers/draftResolver.ts';
import { resolveBinaryChoice } from './resolvers/binaryChoiceResolver.ts';
import { resolveDeckPeek } from './resolvers/deckPeekResolver.ts';
import { resolveWareCashConversion } from './resolvers/wareCashConversionResolver.ts';
import { resolveDiscardPick } from './resolvers/discardPickResolver.ts';
import { resolveWareSelectMultiple } from './resolvers/wareSelectMultipleResolver.ts';
import { resolveWareSellBulk } from './resolvers/wareSellBulkResolver.ts';
import { resolveWareReturn } from './resolvers/wareReturnResolver.ts';
import { resolveTurnModifier } from './resolvers/turnModifierResolver.ts';
import { resolveDrawModifier } from './resolvers/drawModifierResolver.ts';
import { resolveUtilityEffect } from './resolvers/utilityEffectResolver.ts';
import { resolveHandSwap } from './resolvers/handSwapResolver.ts';
import { resolveOpponentChoice } from './resolvers/opponentChoiceResolver.ts';
import { resolveUtilityKeep } from './resolvers/utilityKeepResolver.ts';
import { resolveCrocodileUse } from './resolvers/crocodileResolver.ts';
import { resolveCarrierWareSelect } from './resolvers/carrierWareSelectResolver.ts';
import { resolveSuppliesDiscard } from './resolvers/suppliesDiscardResolver.ts';
import { resolveUtilityReplace } from './resolvers/utilityReplaceResolver.ts';

/**
 * Initialize a pending resolution when a card is played.
 * Returns null if the card auto-resolves (NONE interaction type).
 */
export function initializeResolution(
  state: GameState,
  cardId: DeckCardId
): PendingResolution | null {
  const card = getCard(cardId);

  switch (card.interactionType) {
    case 'NONE':
      return null; // Handled directly by GameEngine

    case 'WARE_TRADE':
      return { type: 'WARE_TRADE', sourceCard: cardId, step: 'SELECT_GIVE' };

    case 'ACTIVE_SELECT': {
      const opponent: 0 | 1 = state.currentPlayer === 0 ? 1 : 0;
      // Throne (swap)
      if (isDesign(cardId, 'throne')) {
        const opponentHasWares = state.players[opponent].market.some(w => w !== null);
        if (!opponentHasWares) {
          throw new Error('Cannot activate Throne: opponent has no wares');
        }
        return { type: 'WARE_THEFT_SWAP', sourceCard: cardId, step: 'STEAL' };
      }
      // Parrot (steal single ware)
      if (isDesign(cardId, 'parrot')) {
        return { type: 'WARE_THEFT_SINGLE', sourceCard: cardId };
      }
      // Crocodile (use opponent utility then discard it)
      if (isDesign(cardId, 'crocodile')) {
        return { type: 'CROCODILE_USE', sourceCard: cardId, step: 'SELECT_UTILITY', opponentPlayer: opponent };
      }
      // Hyena (view opponent hand, take 1, give 1)
      if (isDesign(cardId, 'hyena')) {
        return { type: 'HAND_SWAP', sourceCard: cardId, step: 'TAKE', revealedHand: [...state.players[opponent].hand] };
      }
      // Boat (discard card, take ware from supply)
      if (isDesign(cardId, 'boat')) {
        return { type: 'UTILITY_EFFECT', sourceCard: cardId, utilityDesign: 'boat', step: 'SELECT_CARD' };
      }
      // Scale (draw 2, keep 1, give 1 to opponent)
      if (isDesign(cardId, 'scale')) {
        return { type: 'UTILITY_EFFECT', sourceCard: cardId, utilityDesign: 'scale', step: 'SELECT_CARD' };
      }
      // Kettle (discard 1-2 cards, draw same number)
      if (isDesign(cardId, 'kettle')) {
        return { type: 'UTILITY_EFFECT', sourceCard: cardId, utilityDesign: 'kettle', step: 'SELECT_CARD' };
      }
      // Leopard Statue (pay 2g, choose ware from supply)
      if (isDesign(cardId, 'leopard_statue')) {
        return { type: 'UTILITY_EFFECT', sourceCard: cardId, utilityDesign: 'leopard_statue', step: 'SELECT_WARE_TYPE' };
      }
      // Weapons (discard card, +2g)
      if (isDesign(cardId, 'weapons')) {
        return { type: 'UTILITY_EFFECT', sourceCard: cardId, utilityDesign: 'weapons', step: 'SELECT_CARD' };
      }
      return null;
    }

    case 'OPPONENT_SELECT': {
      // Snake (both players keep 1 utility, discard rest)
      if (isDesign(cardId, 'snake')) {
        return { type: 'UTILITY_KEEP', sourceCard: cardId, step: 'ACTIVE_CHOOSE' };
      }
      // Cheetah (opponent chooses: give 2g or active draws 2)
      if (isDesign(cardId, 'cheetah')) {
        return { type: 'OPPONENT_CHOICE', sourceCard: cardId, options: ['Give 2g to opponent', 'Let opponent draw 2 cards'] };
      }
      return null;
    }

    case 'AUCTION':
      // Arabian Merchant: auction the top 3 deck cards; the active player opens
      if (isDesign(cardId, 'arabian_merchant')) {
        const revealedCards = state.deck.slice(0, 3);
        if (revealedCards.length === 0) return null;
        return {
          type: 'AUCTION',
          sourceCard: cardId,
          wares: [],
          revealedCards,
          currentBid: 0,
          // Bids swap current/next, so "current" starts as the opponent
          currentBidder: state.currentPlayer === 0 ? 1 : 0,
          nextBidder: state.currentPlayer,
          passed: [false, false],
        };
      }
      return {
        type: 'AUCTION',
        sourceCard: cardId,
        wares: [],
        currentBid: 0,
        currentBidder: state.currentPlayer,
        nextBidder: state.currentPlayer === 0 ? 1 : 0,
        passed: [false, false],
      };

    case 'DRAFT': {
      const activePlayer = state.currentPlayer;
      const opponent: 0 | 1 = activePlayer === 0 ? 1 : 0;

      // Elephant: pool wares from both markets
      if (isDesign(cardId, 'elephant')) {
        const activeWares = state.players[activePlayer].market.filter((w): w is WareType => w !== null);
        const opponentWares = state.players[opponent].market.filter((w): w is WareType => w !== null);
        return {
          type: 'DRAFT',
          sourceCard: cardId,
          draftMode: 'wares',
          availableWares: [...activeWares, ...opponentWares],
          availableCards: [],
          currentPicker: activePlayer,
          picks: [[], []],
          cardPicks: [[], []],
        };
      }

      // Ape: pool hand cards from both players
      if (isDesign(cardId, 'ape')) {
        return {
          type: 'DRAFT',
          sourceCard: cardId,
          draftMode: 'cards',
          availableWares: [],
          availableCards: [...state.players[activePlayer].hand, ...state.players[opponent].hand],
          currentPicker: activePlayer,
          picks: [[], []],
          cardPicks: [[], []],
        };
      }

      // Lion: pool utilities from both players
      return {
        type: 'DRAFT',
        sourceCard: cardId,
        draftMode: 'utilities',
        availableWares: [],
        availableCards: [
          ...state.players[activePlayer].utilities.map(u => u.cardId),
          ...state.players[opponent].utilities.map(u => u.cardId),
        ],
        currentPicker: activePlayer,
        picks: [[], []],
        cardPicks: [[], []],
      };
    }

    case 'BINARY_CHOICE':
      if (isDesign(cardId, 'carrier')) {
        return {
          type: 'BINARY_CHOICE',
          sourceCard: cardId,
          options: ['Take 2 wares of same type from supply', 'Take 2 cards from deck'],
        };
      }
      if (isDesign(cardId, 'supplies')) {
        return {
          type: 'BINARY_CHOICE',
          sourceCard: cardId,
          options: ['Pay 1g first', 'Discard 1 card from hand first'],
        };
      }
      if (isDesign(cardId, 'tribal_elder')) {
        return {
          type: 'BINARY_CHOICE',
          sourceCard: cardId,
          options: ['Draw up to 5 cards', 'Opponent discards to 3'],
        };
      }
      return null;

    case 'DECK_PEEK':
      // Psychic: top 6 cards (not 5)
      return {
        type: 'DECK_PEEK',
        sourceCard: cardId,
        revealedCards: state.deck.slice(0, 6),
        pickCount: 1,
      };

    case 'WARE_CASH_CONVERSION':
      return {
        type: 'WARE_CASH_CONVERSION',
        sourceCard: cardId,
        step: 'SELECT_CARD',
      };

    case 'DISCARD_PICK':
      return {
        type: 'DISCARD_PICK',
        sourceCard: cardId,
        eligibleCards: state.discardPile.filter(id => {
          const c = getCard(id);
          return c.type === 'utility';
        }),
      };

    case 'WARE_SELECT_MULTIPLE':
      return {
        type: 'WARE_SELECT_MULTIPLE',
        sourceCard: cardId,
        count: 2,
      };

    case 'WARE_SELL_BULK':
      return {
        type: 'WARE_SELL_BULK',
        sourceCard: cardId,
        pricePerWare: 2,
      };

    case 'WARE_RETURN':
      // Drums utility: return YOUR ware, draw a card
      return {
        type: 'UTILITY_EFFECT',
        sourceCard: cardId,
        utilityDesign: 'drums',
        step: 'SELECT_CARD',
      };

    case 'TURN_MODIFIER':
      return {
        type: 'TURN_MODIFIER',
        sourceCard: cardId,
        buyDiscount: 2,
        sellBonus: 2,
      };

    case 'DRAW_MODIFIER':
      return {
        type: 'DRAW_MODIFIER',
        sourceCard: cardId,
      };

    case 'REACTION':
      return null;

    default:
      return null;
  }
}

/**
 * Process a player's response to a pending resolution.
 */
export function resolveInteraction(
  state: GameState,
  response: InteractionResponse
): GameState {
  const pending = state.pendingResolution;
  if (!pending) {
    throw new Error('No pending resolution to resolve');
  }

  switch (pending.type) {
    case 'WARE_TRADE':
      return resolveWareTrade(state, pending, response);
    case 'WARE_THEFT_SWAP':
    case 'WARE_THEFT_SINGLE':
      return resolveActiveSelect(state, pending, response);
    case 'OPPONENT_DISCARD':
      return resolveOpponentSelect(state, pending, response);
    case 'AUCTION':
      return resolveAuction(state, pending, response);
    case 'DRAFT':
      return resolveDraft(state, pending, response);
    case 'BINARY_CHOICE':
      return resolveBinaryChoice(state, pending, response);
    case 'DECK_PEEK':
      return resolveDeckPeek(state, pending, response);
    case 'WARE_CASH_CONVERSION':
      return resolveWareCashConversion(state, pending, response);
    case 'DISCARD_PICK':
      return resolveDiscardPick(state, pending, response);
    case 'WARE_SELECT_MULTIPLE':
      return resolveWareSelectMultiple(state, pending, response);
    case 'WARE_SELL_BULK':
      return resolveWareSellBulk(state, pending, response);
    case 'WARE_RETURN':
      return resolveWareReturn(state, pending, response);
    case 'TURN_MODIFIER':
      return resolveTurnModifier(state, pending);
    case 'DRAW_MODIFIER':
      return resolveDrawModifier(state, pending, response);
    case 'UTILITY_EFFECT':
      return resolveUtilityEffect(state, pending, response);
    case 'HAND_SWAP':
      return resolveHandSwap(state, pending, response);
    case 'OPPONENT_CHOICE':
      return resolveOpponentChoice(state, pending, response);
    case 'UTILITY_KEEP':
      return resolveUtilityKeep(state, pending, response);
    case 'CROCODILE_USE':
      return resolveCrocodileUse(state, pending, response);
    case 'CARRIER_WARE_SELECT':
      return resolveCarrierWareSelect(state, pending, response);
    case 'SUPPLIES_DISCARD':
      return resolveSuppliesDiscard(state, pending, response);
    case 'UTILITY_REPLACE':
      return resolveUtilityReplace(state, pending, response);
    default:
      throw new Error(`Unknown pending resolution type`);
  }
}
