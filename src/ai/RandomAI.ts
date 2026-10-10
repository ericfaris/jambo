import type { GameState, GameAction, InteractionResponse, WareType, WareCardWares } from '../engine/types.ts';
import { throneGiveOptions, throneStealOptions } from '../engine/market/throneSwap.ts';
import { isAuctionBidding } from '../engine/responder.ts';
import { WARE_TYPES, CONSTANTS } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { validateAction } from '../engine/validation/actionValidator.ts';
import { processAction } from '../engine/GameEngine.ts';
import { createRng } from '../utils/rng.ts';
import {
  getAuctionMaxBidFor,
  pickBestUtilityIndex,
  pickBestWareType,
  pickDiscardCardForValue,
} from './strategyHeuristics.ts';

type RngFn = () => number;

function canBuyWares(state: GameState, player: 0 | 1, wares: WareCardWares): boolean {
  const p = state.players[player];
  const effectivePrice = Math.max(0, wares.buyPrice - state.turnModifiers.buyDiscount);
  const emptySlots = p.market.filter(s => s === null).length;
  return p.gold >= effectivePrice && emptySlots >= wares.types.length;
}

function canSellWares(state: GameState, player: 0 | 1, wares: WareCardWares): boolean {
  const market = state.players[player].market;
  const needed: Partial<Record<WareType, number>> = {};
  for (const w of wares.types) needed[w] = (needed[w] ?? 0) + 1;
  const have: Partial<Record<WareType, number>> = {};
  for (const s of market) if (s) have[s] = (have[s] ?? 0) + 1;
  for (const [w, count] of Object.entries(needed)) {
    if ((have[w as WareType] ?? 0) < count!) return false;
  }
  return true;
}

function pick<T>(arr: readonly T[], rng: RngFn): T {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffleWithRng<T>(arr: readonly T[], rng: RngFn): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function createAiRngFromState(state: GameState): RngFn {
  let seed = state.rngSeed | 0;
  seed ^= ((state.rngState + 0x9e3779b9) | 0);
  seed ^= Math.imul(state.turn | 0, 0x85ebca6b);
  seed ^= Math.imul(state.actionsLeft | 0, 0xc2b2ae35);
  seed ^= Math.imul((state.currentPlayer + 1) | 0, 0x27d4eb2f);
  seed ^= Math.imul(state.log.length | 0, 0x165667b1);
  if (state.pendingResolution) {
    seed ^= Math.imul(state.pendingResolution.type.length | 0, 0x9e3779b1);
  }
  if (state.pendingGuardReaction) {
    seed ^= 0x1f123bb5;
  }
  if (state.pendingWareCardReaction) {
    seed ^= 0x5a4f9d3b;
  }
  return createRng(seed);
}

function tryAction(state: GameState, action: GameAction): boolean {
  return validateAction(state, action).valid;
}

/** Try executing an action; return true if it doesn't throw. */
function safeExec(state: GameState, action: GameAction): boolean {
  try {
    processAction(state, action);
    return true;
  } catch {
    return false;
  }
}

/** Get ware types that have supply available. */
function availableWareTypes(state: GameState): WareType[] {
  return WARE_TYPES.filter(w => state.wareSupply[w] > 0);
}

export function getRandomInteractionResponse(state: GameState, rng: RngFn): InteractionResponse | null {
  const pr = state.pendingResolution;
  if (!pr) return null;

  const cp = state.currentPlayer;
  const player = state.players[cp];

  switch (pr.type) {
    case 'WARE_TRADE': {
      if (pr.step === 'SELECT_GIVE') {
        const wareTypesInMarket = player.market.filter((w): w is WareType => w !== null);
        const marketCount: Partial<Record<WareType, number>> = {};
        for (const ware of wareTypesInMarket) {
          marketCount[ware] = (marketCount[ware] ?? 0) + 1;
        }

        const giveTypesWithValidReceive = WARE_TYPES.filter((giveType) => {
          const giveCount = marketCount[giveType] ?? 0;
          if (giveCount === 0) return false;
          return WARE_TYPES.some(
            receiveType => receiveType !== giveType && state.wareSupply[receiveType] >= giveCount,
          );
        });

        // Resolver auto-resolves when market empty; send dummy to trigger guard
        if (wareTypesInMarket.length === 0) return { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' };
        if (giveTypesWithValidReceive.length > 0) {
          return { type: 'SELECT_WARE_TYPE', wareType: pick(giveTypesWithValidReceive, rng) };
        }
        return { type: 'SELECT_WARE_TYPE', wareType: pick(wareTypesInMarket, rng) };
      }
      // SELECT_RECEIVE: pick from supply, exclude give type
      const requiredCount = pr.giveCount ?? 1;
      const available = WARE_TYPES.filter(
        w => w !== pr.giveType && state.wareSupply[w] >= requiredCount,
      );
      if (available.length === 0) {
        const fallbackType = WARE_TYPES.find(
          w => w !== pr.giveType && state.wareSupply[w] > 0,
        ) ?? 'trinkets';
        return { type: 'SELECT_WARE_TYPE', wareType: fallbackType };
      }
      return { type: 'SELECT_WARE_TYPE', wareType: pickBestWareType(state, cp, available) };
    }

    case 'WARE_SELECT_MULTIPLE': {
      // Need supply >= count and market space >= count
      const emptySlots = player.market.filter(s => s === null).length;
      const available = availableWareTypes(state).filter(w => state.wareSupply[w] >= pr.count);
      if (available.length === 0 || emptySlots < pr.count) return { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' }; // guard handles
      return { type: 'SELECT_WARE_TYPE', wareType: pickBestWareType(state, cp, available) };
    }

    case 'CARRIER_WARE_SELECT': {
      const target = state.players[pr.targetPlayer];
      const emptySlots = target.market.filter(s => s === null).length;
      const available = availableWareTypes(state).filter(w => state.wareSupply[w] >= 1);
      if (available.length === 0 || emptySlots < 1) return { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' };
      return { type: 'SELECT_WARE_TYPE', wareType: pickBestWareType(state, pr.targetPlayer, available) };
    }

    case 'WARE_THEFT_SINGLE': {
      const opponent: 0 | 1 = cp === 0 ? 1 : 0;
      const opMarket = state.players[opponent].market;
      const filledSlots = opMarket.map((w, i) => ({ w, i })).filter(s => s.w !== null);
      // Resolver auto-resolves when opponent has no wares; send dummy to trigger guard
      if (filledSlots.length === 0) return { type: 'SELECT_WARE', wareIndex: 0 };
      return { type: 'SELECT_WARE', wareIndex: pick(filledSlots, rng).i };
    }

    case 'WARE_THEFT_SWAP': {
      // Only exchanges that change something (never tea for tea)
      const options = pr.step === 'STEAL'
        ? throneStealOptions(state, cp)
        : throneGiveOptions(state, cp, pr.stolenWare);
      // Resolver auto-resolves when no useful swap exists; send dummy to trigger guard
      if (options.length === 0) return { type: 'SELECT_WARE', wareIndex: 0 };
      return { type: 'SELECT_WARE', wareIndex: pick(options, rng) };
    }


    case 'HAND_SWAP': {
      if (pr.step === 'TAKE') {
        // Resolver auto-resolves when opponent hand empty; send dummy to trigger guard
        if (pr.revealedHand.length === 0) return { type: 'SELECT_CARD', cardId: '' };
        return { type: 'SELECT_CARD', cardId: pick(pr.revealedHand, rng) };
      }
      const giveOptions = player.hand.filter((cardId) => cardId !== pr.takenCard);
      if (giveOptions.length === 0) return { type: 'SELECT_CARD', cardId: '' };
      return { type: 'SELECT_CARD', cardId: pick(giveOptions, rng) };
    }

    case 'BINARY_CHOICE':
      return { type: 'BINARY_CHOICE', choice: rng() < 0.5 ? 0 : 1 };

    case 'OPPONENT_CHOICE': {
      // Cheetah: paying 2g is only legal with at least 2g
      const payer = state.currentPlayer === 0 ? 1 : 0;
      if (state.players[payer].gold < 2) return { type: 'OPPONENT_CHOICE', choice: 1 };
      return { type: 'OPPONENT_CHOICE', choice: rng() < 0.5 ? 0 : 1 };
    }

    case 'AUCTION': {
      // Ware selection step: pick ware types from supply
      if (!isAuctionBidding(pr)) {
        const wareTypes: import('../engine/types.ts').WareType[] = ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt'];
        const available = wareTypes.filter(wt => state.wareSupply[wt] > 0);
        if (available.length === 0) return { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' }; // guard handles
        return { type: 'SELECT_WARE_TYPE', wareType: pickBestWareType(state, cp, available) };
      }
      // Bidding rounds — use value-based bidding
      const bidAmount = pr.currentBid + 1;
      const bidder = state.players[pr.nextBidder];
      const maxBid = getAuctionMaxBidFor(state, pr.nextBidder, pr);
      // Only bid if we can afford it AND the price is within our valuation
      if (bidAmount <= maxBid && bidder.gold >= bidAmount) {
        return { type: 'AUCTION_BID', amount: bidAmount };
      }
      return { type: 'AUCTION_PASS' };
    }

    case 'DECK_PEEK': {
      if (pr.revealedCards.length === 0) return { type: 'DECK_PEEK_PICK', cardIndex: 0 };
      return { type: 'DECK_PEEK_PICK', cardIndex: Math.floor(rng() * pr.revealedCards.length) };
    }

    case 'DISCARD_PICK': {
      if (pr.eligibleCards.length === 0) return { type: 'DISCARD_PICK', cardId: '' };
      return { type: 'DISCARD_PICK', cardId: pick(pr.eligibleCards, rng) };
    }

    case 'WARE_CASH_CONVERSION': {
      if (pr.step === 'SELECT_CARD') {
        const wareCards = player.hand.filter(id => getCard(id).type === 'ware');
        // Resolver auto-resolves when no ware cards; send dummy to trigger guard
        if (wareCards.length === 0) return { type: 'SELECT_CARD', cardId: '' };
        return { type: 'SELECT_CARD', cardId: pick(wareCards, rng) };
      }
      if (pr.step === 'SELECT_WARES') {
        const filledSlots = player.market
          .map((w, i) => ({ w, i }))
          .filter(s => s.w !== null);
        // Resolver auto-resolves when < 3 wares; send dummy to trigger guard
        if (filledSlots.length < 3) return { type: 'SELECT_WARES', wareIndices: [0, 1, 2] };
        const toReturn = shuffleWithRng(filledSlots, rng).slice(0, 3);
        return { type: 'SELECT_WARES', wareIndices: toReturn.map(s => s.i) };
      }
      return null;
    }

    case 'WARE_SELL_BULK': {
      const filledSlots = player.market
        .map((w, i) => ({ w, i }))
        .filter(s => s.w !== null);
      // Sell at least 1 ware — validation should prevent empty, but send dummy for safety
      if (filledSlots.length === 0) return { type: 'SELL_WARES', wareIndices: [] };
      const count = Math.min(1 + Math.floor(rng() * 3), filledSlots.length);
      const shuffled = shuffleWithRng(filledSlots, rng).slice(0, count);
      return { type: 'SELL_WARES', wareIndices: shuffled.map(s => s.i) };
    }

    case 'WARE_RETURN': {
      const opponent: 0 | 1 = cp === 0 ? 1 : 0;
      const opMarket = state.players[opponent].market;
      const filledSlots = opMarket
        .map((w, i) => ({ w, i }))
        .filter(s => s.w !== null);
      // Resolver auto-resolves when opponent has no wares; send dummy to trigger guard
      if (filledSlots.length === 0) return { type: 'RETURN_WARE', wareIndex: 0 };
      return { type: 'RETURN_WARE', wareIndex: pick(filledSlots, rng).i };
    }

    case 'OPPONENT_DISCARD': {
      const target = pr.targetPlayer;
      const targetPlayer = state.players[target];
      const handSize = targetPlayer.hand.length;
      const discardCount = handSize - pr.discardTo;
      // Nothing to discard — send dummy to let resolver auto-resolve
      if (discardCount <= 0) return { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: [] };
      const indices = shuffleWithRng(Array.from({ length: handSize }, (_, i) => i), rng)
        .slice(0, discardCount);
      return { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: indices };
    }

    case 'DRAFT': {
      if (pr.draftMode === 'wares') {
        if (pr.availableWares.length === 0) return { type: 'SELECT_WARE', wareIndex: 0 };
        const wareIdx = Math.floor(rng() * pr.availableWares.length);
        return { type: 'SELECT_WARE', wareIndex: wareIdx };
      }
      if (pr.availableCards && pr.availableCards.length > 0) {
        return { type: 'SELECT_CARD', cardId: pick(pr.availableCards, rng) };
      }
      return { type: 'SELECT_CARD', cardId: '' };
    }

    case 'SUPPLIES_DISCARD': {
      // Resolver auto-resolves when hand empty; send dummy to trigger guard
      if (player.hand.length === 0) return { type: 'SELECT_CARD', cardId: '' };
      return { type: 'SELECT_CARD', cardId: pick(player.hand, rng) };
    }

    case 'UTILITY_REPLACE': {
      const utils = state.players[cp].utilities;
      // Pick a random utility to replace (guard handles < max case)
      if (utils.length === 0) return { type: 'SELECT_UTILITY', utilityIndex: 0 };
      const utilityIndex = Math.floor(rng() * utils.length);
      return { type: 'SELECT_UTILITY', utilityIndex };
    }

    case 'UTILITY_KEEP': {
      const responder = pr.step === 'ACTIVE_CHOOSE' ? cp : (cp === 0 ? 1 : 0);
      const utils = state.players[responder].utilities;
      // Resolver auto-skips when no utilities; send dummy response to trigger it
      if (utils.length === 0) return { type: 'SELECT_UTILITY', utilityIndex: 0 };
      const utilityIndex = pickBestUtilityIndex(
        state,
        responder,
        utils.map((u) => u.designId),
      );
      return { type: 'SELECT_UTILITY', utilityIndex };
    }

    case 'CROCODILE_USE': {
      if (pr.step === 'SELECT_UTILITY') {
        const opUtils = state.players[pr.opponentPlayer].utilities;
        // Resolver auto-resolves when opponent has no utilities; send dummy to trigger guard
        if (opUtils.length === 0) return { type: 'SELECT_UTILITY', utilityIndex: 0 };
        const utilityIndex = pickBestUtilityIndex(
          state,
          pr.opponentPlayer,
          opUtils.map((u) => u.designId),
        );
        return { type: 'SELECT_UTILITY', utilityIndex };
      }
      return null;
    }

    case 'UTILITY_EFFECT': {
      // Drums: return 1 ware from own market
      if (pr.utilityDesign === 'drums') {
        const filledSlots = player.market
          .map((w, i) => ({ w, i }))
          .filter(s => s.w !== null);
        // Resolver auto-resolves when market empty; send dummy to trigger guard
        if (filledSlots.length === 0) return { type: 'RETURN_WARE', wareIndex: 0 };
        return { type: 'RETURN_WARE', wareIndex: pick(filledSlots, rng).i };
      }
      // Scale: pick from drawn cards (selectedCards), not from hand
      if (pr.utilityDesign === 'scale' && pr.step === 'SELECT_CARD') {
        if (pr.selectedCards && pr.selectedCards.length > 0) {
          if (pr.selectedCards.length === 1) {
            return { type: 'SELECT_CARD', cardId: pr.selectedCards[0] };
          }
          const discardCard = pickDiscardCardForValue(state, cp, pr.selectedCards);
          const keepCard = pr.selectedCards.find((cardId) => cardId !== discardCard) ?? pr.selectedCards[0];
          return { type: 'SELECT_CARD', cardId: keepCard };
        }
        // First call triggers the draw — send any valid response (it's ignored)
        return { type: 'SELECT_CARD', cardId: player.hand[0] ?? '' };
      }
      if (pr.step === 'SELECT_CARD') {
        // Kettle: needs SELECT_CARDS response
        if (pr.utilityDesign === 'kettle') {
          // Resolver auto-resolves when hand empty; send dummy to trigger guard
          if (player.hand.length === 0) return { type: 'SELECT_CARDS', cardIds: [] };
          const firstDiscard = pickDiscardCardForValue(state, cp, player.hand);
          const count = player.hand.length >= 5 ? 2 : 1;
          const remaining = player.hand.filter((cardId) => cardId !== firstDiscard);
          const secondDiscard = count === 2 && remaining.length > 0
            ? pickDiscardCardForValue(state, cp, remaining)
            : null;
          const cards = secondDiscard ? [firstDiscard, secondDiscard] : [firstDiscard];
          return { type: 'SELECT_CARDS', cardIds: cards };
        }
        // Boat/Weapons: needs SELECT_CARD response
        // Resolver auto-resolves when hand empty; send dummy to trigger guard
        if (player.hand.length === 0) return { type: 'SELECT_CARD', cardId: '' };
        return { type: 'SELECT_CARD', cardId: pickDiscardCardForValue(state, cp, player.hand) };
      }
      if (pr.step === 'SELECT_WARE_TYPE') {
        const available = availableWareTypes(state);
        if (available.length === 0) return { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' };
        return { type: 'SELECT_WARE_TYPE', wareType: pickBestWareType(state, cp, available) };
      }
      return null;
    }

    case 'DRAW_MODIFIER': {
      // Mask of Transformation: need hand card to trade for top of discard
      // No resolver guard for this — validation should prevent it, but send dummy for safety
      if (state.discardPile.length === 0) return { type: 'SELECT_CARD', cardId: '' };
      if (player.hand.length === 0) return { type: 'SELECT_CARD', cardId: '' };
      return { type: 'SELECT_CARD', cardId: pickDiscardCardForValue(state, cp, player.hand) };
    }

    case 'TURN_MODIFIER':
      return null;

    default:
      return null;
  }
}

export function getFallbackInteractionResponses(state: GameState): InteractionResponse[] {
  const pr = state.pendingResolution;
  if (!pr) return [];

  const cp = state.currentPlayer;
  const opponent: 0 | 1 = cp === 0 ? 1 : 0;

  switch (pr.type) {
    case 'BINARY_CHOICE':
      return [
        { type: 'BINARY_CHOICE', choice: 0 },
        { type: 'BINARY_CHOICE', choice: 1 },
      ];

    case 'OPPONENT_CHOICE':
      return [
        { type: 'OPPONENT_CHOICE', choice: 0 },
        { type: 'OPPONENT_CHOICE', choice: 1 },
      ];

    case 'AUCTION': {
      if (!isAuctionBidding(pr)) {
        const available = WARE_TYPES.filter(w => state.wareSupply[w] > 0);
        return available.length > 0
          ? available.map(wareType => ({ type: 'SELECT_WARE_TYPE', wareType }))
          : [{ type: 'SELECT_WARE_TYPE', wareType: 'trinkets' }];
      }

      const bidAmount = pr.currentBid + 1;
      const canBid = state.players[pr.nextBidder].gold >= bidAmount;
      return canBid
        ? [{ type: 'AUCTION_PASS' }, { type: 'AUCTION_BID', amount: bidAmount }]
        : [{ type: 'AUCTION_PASS' }];
    }

    case 'CARRIER_WARE_SELECT': {
      const available = WARE_TYPES.filter(w => state.wareSupply[w] > 0);
      return available.length > 0
        ? available.map(wareType => ({ type: 'SELECT_WARE_TYPE', wareType }))
        : [{ type: 'SELECT_WARE_TYPE', wareType: 'trinkets' }];
    }

    case 'WARE_TRADE': {
      if (pr.step === 'SELECT_GIVE') {
        const inMarket = state.players[cp].market.filter((w): w is WareType => w !== null);
        const marketCount: Partial<Record<WareType, number>> = {};
        for (const ware of inMarket) {
          marketCount[ware] = (marketCount[ware] ?? 0) + 1;
        }

        const viableGiveTypes = WARE_TYPES.filter((giveType) => {
          const giveCount = marketCount[giveType] ?? 0;
          if (giveCount === 0) return false;
          return WARE_TYPES.some(
            receiveType => receiveType !== giveType && state.wareSupply[receiveType] >= giveCount,
          );
        });

        if (viableGiveTypes.length > 0) {
          return viableGiveTypes.map(wareType => ({ type: 'SELECT_WARE_TYPE', wareType }));
        }

        return inMarket.length > 0
          ? inMarket.map(wareType => ({ type: 'SELECT_WARE_TYPE', wareType }))
          : [{ type: 'SELECT_WARE_TYPE', wareType: 'trinkets' }];
      }
      const requiredCount = pr.giveCount ?? 1;
      const candidates = WARE_TYPES.filter(
        w => w !== pr.giveType && state.wareSupply[w] >= requiredCount,
      );
      return candidates.map(wareType => ({ type: 'SELECT_WARE_TYPE', wareType }));
    }

    case 'WARE_THEFT_SINGLE': {
      const indices = state.players[opponent].market
        .map((ware, index) => ({ ware, index }))
        .filter(({ ware }) => ware !== null)
        .map(({ index }) => index);
      return indices.length > 0
        ? indices.map(wareIndex => ({ type: 'SELECT_WARE', wareIndex }))
        : [{ type: 'SELECT_WARE', wareIndex: 0 }];
    }

    case 'WARE_THEFT_SWAP': {
      const indices = pr.step === 'STEAL'
        ? throneStealOptions(state, cp)
        : throneGiveOptions(state, cp, pr.stolenWare);
      return indices.length > 0
        ? indices.map(wareIndex => ({ type: 'SELECT_WARE', wareIndex }))
        : [{ type: 'SELECT_WARE', wareIndex: 0 }];
    }

    case 'HAND_SWAP': {
      if (pr.step === 'TAKE') {
        return pr.revealedHand.length > 0
          ? pr.revealedHand.map(cardId => ({ type: 'SELECT_CARD', cardId }))
          : [{ type: 'SELECT_CARD', cardId: '' }];
      }
      const give = state.players[cp].hand.filter(id => id !== pr.takenCard);
      return give.length > 0
        ? give.map(cardId => ({ type: 'SELECT_CARD', cardId }))
        : [{ type: 'SELECT_CARD', cardId: '' }];
    }

    case 'DECK_PEEK':
      return pr.revealedCards.length > 0
        ? pr.revealedCards.map((_, cardIndex) => ({ type: 'DECK_PEEK_PICK', cardIndex }))
        : [{ type: 'DECK_PEEK_PICK', cardIndex: 0 }];

    case 'DISCARD_PICK':
      return pr.eligibleCards.length > 0
        ? pr.eligibleCards.map(cardId => ({ type: 'DISCARD_PICK', cardId }))
        : [{ type: 'DISCARD_PICK', cardId: '' }];

    case 'CROCODILE_USE': {
      if (pr.step !== 'SELECT_UTILITY') return [];
      const count = state.players[pr.opponentPlayer].utilities.length;
      return count > 0
        ? Array.from({ length: count }, (_, utilityIndex) => ({ type: 'SELECT_UTILITY', utilityIndex }))
        : [{ type: 'SELECT_UTILITY', utilityIndex: 0 }];
    }

    case 'WARE_SELECT_MULTIPLE': {
      const available = WARE_TYPES.filter(w => state.wareSupply[w] >= pr.count);
      return available.length > 0
        ? available.map(wareType => ({ type: 'SELECT_WARE_TYPE', wareType }))
        : [{ type: 'SELECT_WARE_TYPE', wareType: 'trinkets' }];
    }

    case 'WARE_SELL_BULK': {
      const filledIndices = state.players[cp].market
        .map((ware, index) => ({ ware, index }))
        .filter(({ ware }) => ware !== null)
        .map(({ index }) => index);

      if (filledIndices.length === 0) return [{ type: 'SELL_WARES', wareIndices: [] }];

      const fullSell: InteractionResponse = { type: 'SELL_WARES', wareIndices: filledIndices };
      const minSell: InteractionResponse = { type: 'SELL_WARES', wareIndices: [filledIndices[0]] };
      return [minSell, fullSell];
    }

    case 'OPPONENT_DISCARD': {
      const handSize = state.players[pr.targetPlayer].hand.length;
      const discardCount = Math.max(0, handSize - pr.discardTo);
      if (discardCount === 0) {
        return [{ type: 'OPPONENT_DISCARD_SELECTION', cardIndices: [] }];
      }
      const indices = Array.from({ length: handSize }, (_, i) => i);
      return [{ type: 'OPPONENT_DISCARD_SELECTION', cardIndices: indices.slice(0, discardCount) }];
    }

    case 'DRAFT': {
      if (pr.draftMode === 'wares') {
        return pr.availableWares.length > 0
          ? pr.availableWares.map((_, wareIndex) => ({ type: 'SELECT_WARE', wareIndex }))
          : [{ type: 'SELECT_WARE', wareIndex: 0 }];
      }
      if (pr.availableCards && pr.availableCards.length > 0) {
        return pr.availableCards.map(cardId => ({ type: 'SELECT_CARD', cardId }));
      }
      return [{ type: 'SELECT_CARD', cardId: '' }];
    }

    case 'SUPPLIES_DISCARD': {
      const hand = state.players[cp].hand;
      return hand.length > 0
        ? hand.map(cardId => ({ type: 'SELECT_CARD', cardId }))
        : [{ type: 'SELECT_CARD', cardId: '' }];
    }

    case 'UTILITY_REPLACE': {
      const utils = state.players[cp].utilities;
      return utils.length > 0
        ? utils.map((_, utilityIndex) => ({ type: 'SELECT_UTILITY' as const, utilityIndex }))
        : [{ type: 'SELECT_UTILITY' as const, utilityIndex: 0 }];
    }

    case 'UTILITY_KEEP': {
      const responder = pr.step === 'ACTIVE_CHOOSE' ? cp : (cp === 0 ? 1 : 0);
      const utils = state.players[responder].utilities;
      return utils.length > 0
        ? utils.map((_, utilityIndex) => ({ type: 'SELECT_UTILITY', utilityIndex }))
        : [{ type: 'SELECT_UTILITY', utilityIndex: 0 }];
    }

    case 'UTILITY_EFFECT': {
      const hand = state.players[cp].hand;
      const market = state.players[cp].market;
      const filled = market
        .map((ware, index) => ({ ware, index }))
        .filter(({ ware }) => ware !== null)
        .map(({ index }) => index);

      if (pr.step === 'SELECT_CARD') {
        if (pr.utilityDesign === 'kettle') {
          if (hand.length === 0) return [{ type: 'SELECT_CARDS', cardIds: [] }];
          return [
            { type: 'SELECT_CARDS', cardIds: [hand[0]] },
            { type: 'SELECT_CARDS', cardIds: hand.slice(0, 2) },
          ];
        }

        if (pr.utilityDesign === 'drums') {
          return filled.length > 0
            ? filled.map(wareIndex => ({ type: 'RETURN_WARE', wareIndex }))
            : [{ type: 'RETURN_WARE', wareIndex: 0 }];
        }

        return hand.length > 0
          ? hand.map(cardId => ({ type: 'SELECT_CARD', cardId }))
          : [{ type: 'SELECT_CARD', cardId: '' }];
      }

      if (pr.step === 'SELECT_WARE_TYPE') {
        const available = WARE_TYPES.filter(w => state.wareSupply[w] > 0);
        return available.length > 0
          ? available.map(wareType => ({ type: 'SELECT_WARE_TYPE', wareType }))
          : [{ type: 'SELECT_WARE_TYPE', wareType: 'trinkets' }];
      }

      return [{ type: 'SELECT_CARD', cardId: hand[0] ?? '' }];
    }

    case 'DRAW_MODIFIER': {
      const hand = state.players[cp].hand;
      if (state.discardPile.length === 0) {
        return [{ type: 'SELECT_CARD', cardId: '' }];
      }
      return hand.length > 0
        ? hand.map(cardId => ({ type: 'SELECT_CARD', cardId }))
        : [{ type: 'SELECT_CARD', cardId: '' }];
    }

    case 'WARE_RETURN': {
      const target = state.players[cp].market
        .map((ware, index) => ({ ware, index }))
        .filter(({ ware }) => ware !== null)
        .map(({ index }) => index);

      return target.length > 0
        ? target.map(wareIndex => ({ type: 'RETURN_WARE', wareIndex }))
        : [{ type: 'RETURN_WARE', wareIndex: 0 }];
    }

    case 'WARE_CASH_CONVERSION': {
      if (pr.step === 'SELECT_CARD') {
        const wareCards = state.players[cp].hand.filter(id => getCard(id).type === 'ware');
        return wareCards.length > 0
          ? wareCards.map(cardId => ({ type: 'SELECT_CARD', cardId }))
          : [{ type: 'SELECT_CARD', cardId: '' }];
      }

      const filled = state.players[cp].market
        .map((ware, index) => ({ ware, index }))
        .filter(({ ware }) => ware !== null)
        .map(({ index }) => index);

      if (filled.length >= 3) {
        return [{ type: 'SELECT_WARES', wareIndices: filled.slice(0, 3) }];
      }
      return [{ type: 'SELECT_WARES', wareIndices: [0, 1, 2] }];
    }

    case 'TURN_MODIFIER':
      return [{ type: 'BINARY_CHOICE', choice: 0 }];

    default:
      return [];
  }
}

export function getRandomAiAction(state: GameState, rng: RngFn = createAiRngFromState(state)): GameAction | null {
  // Guard reaction
  if (state.pendingGuardReaction) {
    return { type: 'GUARD_REACTION', play: rng() < 0.3 };
  }

  // Ware card reaction
  if (state.pendingWareCardReaction) {
    return { type: 'WARE_CARD_REACTION', play: rng() < 0.3 };
  }

  // Pending resolution
  if (state.pendingResolution) {
    const response = getRandomInteractionResponse(state, rng);
    const candidates: InteractionResponse[] = [];
    if (response) candidates.push(response);
    candidates.push(...getFallbackInteractionResponses(state));

    const seen = new Set<string>();
    for (const candidate of candidates) {
      const key = JSON.stringify(candidate);
      if (seen.has(key)) continue;
      seen.add(key);

      const action: GameAction = { type: 'RESOLVE_INTERACTION', response: candidate };
      if (safeExec(state, action)) return action;
    }

    if (candidates.length > 0) {
      return { type: 'RESOLVE_INTERACTION', response: candidates[0] };
    }

    return null;
  }

  // Draw phase
  if (state.phase === 'DRAW') {
    if (state.drawnCard !== null) {
      return rng() < 0.5
        ? { type: 'KEEP_CARD' }
        : { type: 'DISCARD_DRAWN' };
    }
    if (tryAction(state, { type: 'DRAW_CARD' })) {
      return { type: 'DRAW_CARD' };
    }
    if (tryAction(state, { type: 'SKIP_DRAW' })) {
      return { type: 'SKIP_DRAW' };
    }
    return null;
  }

  // Play phase
  if (state.phase === 'PLAY') {
    const roll = rng();
    const cp = state.currentPlayer;
    const player = state.players[cp];

    // 40% play card
    if (roll < 0.4 && player.hand.length > 0) {
      const cardId = pick(player.hand, rng);
      const cardDef = getCard(cardId);

      if (cardDef.type === 'ware' && cardDef.wares) {
        const cb = canBuyWares(state, cp, cardDef.wares);
        const cs = canSellWares(state, cp, cardDef.wares);
        let wareMode: 'buy' | 'sell' | null = null;
        if (cb && cs) wareMode = rng() < 0.5 ? 'buy' : 'sell';
        else if (cb) wareMode = 'buy';
        else if (cs) wareMode = 'sell';
        if (wareMode) {
          const action: GameAction = { type: 'PLAY_CARD', cardId, wareMode };
          if (tryAction(state, action) && safeExec(state, action)) return action;
        }
      } else if (cardDef.type === 'utility') {
        const action: GameAction = { type: 'PLAY_CARD', cardId };
        if (tryAction(state, action) && safeExec(state, action)) return action;
      } else if (cardDef.type === 'stand') {
        const standCost = player.smallMarketStands === 0 ? CONSTANTS.FIRST_STAND_COST : CONSTANTS.ADDITIONAL_STAND_COST;
        if (player.gold >= standCost) {
          const action: GameAction = { type: 'PLAY_CARD', cardId };
          if (tryAction(state, action) && safeExec(state, action)) return action;
        }
      } else if (cardDef.type !== 'ware') {
        // People/animal cards
        const action: GameAction = { type: 'PLAY_CARD', cardId };
        if (tryAction(state, action) && safeExec(state, action)) return action;
      }
    }

    // 20% activate utility
    if (roll < 0.6) {
      const unusedUtils = player.utilities
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => !u.usedThisTurn);
      if (unusedUtils.length > 0) {
        const { i } = pick(unusedUtils, rng);
        const action: GameAction = { type: 'ACTIVATE_UTILITY', utilityIndex: i };
        if (tryAction(state, action) && safeExec(state, action)) return action;
      }
    }

    return { type: 'END_TURN' };
  }

  return null;
}
