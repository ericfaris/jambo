import type { DeckCardId, GameAction, GameState, UtilityDesignId } from '../../engine/types.ts';
import { isAuctionBidding } from '../../engine/responder.ts';
import { getCard } from '../../engine/cards/CardDatabase.ts';
import { getValidActions } from '../../engine/validation/actionValidator.ts';
import { getRandomAiAction } from '../RandomAI.ts';
import { createRng } from '../../utils/rng.ts';
import {
  getAuctionMaxBidFor,
  getCardEconomyValue,
  getCardPressureBonus,
  getHandRiskPenalty,
  getMarketExposurePenalty,
  getUtilityActivationPriority,
  getUtilityPlayPriority,
  getWareAcquisitionPriority,
} from '../strategyHeuristics.ts';

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function createMediumRng(state: GameState): () => number {
  let seed = state.rngSeed | 0;
  seed ^= Math.imul((state.turn + 1) | 0, 0x7feb352d);
  seed ^= Math.imul((state.actionsLeft + 3) | 0, 0x846ca68b);
  seed ^= Math.imul((state.currentPlayer + 11) | 0, 0x9e3779b1);
  return createRng(seed);
}

function classifyPlayCard(state: GameState, cardId: DeckCardId, wareMode?: 'buy' | 'sell'): number {
  const card = getCard(cardId);
  const me = state.currentPlayer;
  const opponent: 0 | 1 = me === 0 ? 1 : 0;
  const player = state.players[me];
  const opponentPlayer = state.players[opponent];
  const emptySlots = player.market.filter(slot => slot === null).length;
  const goldGap = opponentPlayer.gold - player.gold;

  if (card.type === 'ware') {
    const wares = card.wares;
    if (!wares) return 0;

    const effectiveSell = wares.sellPrice + state.turnModifiers.sellBonus;
    const effectiveBuy = Math.max(0, wares.buyPrice - state.turnModifiers.buyDiscount);
    const margin = effectiveSell - effectiveBuy;
    const efficiency = margin / Math.max(1, wares.types.length);

    if (wareMode === 'sell') {
      // Behind on gold — sell more eagerly to catch up
      const catchUpBonus = Math.max(0, goldGap - 5) * 0.5;
      return 88 + efficiency * 2 + wares.types.length + catchUpBonus;
    }
    if (wareMode === 'buy') {
      return getWareAcquisitionPriority(state, me, wares);
    }
    return 30;
  }

  if (card.type === 'people') {
    const pressure = getCardPressureBonus(state, me, cardId);
    if (card.designId === 'wise_man') return 82 + (state.actionsLeft > 2 ? 6 : 0) + pressure * 0.2;
    if (card.designId === 'portuguese') return 80 + player.market.filter(w => w !== null).length * 2 + pressure * 0.2;
    return 74 + pressure;
  }

  if (card.type === 'animal') {
    const pressure = getCardPressureBonus(state, me, cardId);
    // Behind on gold — lean into steal/catch-up plays
    const catchUpBonus = Math.max(0, goldGap) * 0.4;
    if (card.designId === 'crocodile') return 74 + opponentPlayer.utilities.length * 3.5 + pressure + catchUpBonus;
    if (card.designId === 'parrot') return 71 + opponentPlayer.market.filter(w => w !== null).length * 1.8 + pressure + catchUpBonus;
    if (card.designId === 'elephant') {
      const oppWares = opponentPlayer.market.filter(w => w !== null).length;
      const myWares = player.market.filter(w => w !== null).length;
      return 67 + (oppWares - myWares) * 2.5 + pressure + catchUpBonus;
    }
    return 68 + pressure;
  }

  if (card.type === 'utility') {
    if (player.utilities.length >= 3) return 10;
    return getUtilityPlayPriority(state, me, card.designId as UtilityDesignId) - getMarketExposurePenalty(player) * 0.3;
  }

  if (card.type === 'stand') {
    const currentSlots = player.market.length;
    const filledSlots = currentSlots - emptySlots;
    const exposurePenalty = getMarketExposurePenalty(player);
    return filledSlots >= currentSlots - 1 ? 58 - exposurePenalty : 34 - exposurePenalty;
  }

  return 0;
}

function scoreAction(state: GameState, action: GameAction): number {
  const me = state.currentPlayer;
  const player = state.players[me];

  switch (action.type) {
    case 'PLAY_CARD':
      return classifyPlayCard(state, action.cardId, action.wareMode);
    case 'ACTIVATE_UTILITY': {
      const utility = player.utilities[action.utilityIndex];
      if (!utility) return 30;
      return getUtilityActivationPriority(state, me, utility.designId);
    }
    case 'DRAW_CARD': {
      const handPenalty = Math.max(0, player.hand.length - 4) * 4;
      return (state.actionsLeft > 2 ? 63 : 56) - handPenalty;
    }
    case 'KEEP_CARD':
      if (state.drawnCard) {
        const card = getCard(state.drawnCard);
        if (card.type === 'people' || card.type === 'animal') return 73;
        if (card.type === 'stand') return player.smallMarketStands === 0 ? 74 : 66;
        if (card.type === 'utility') return 70;
        if (card.type === 'ware') {
          const margin = card.wares ? card.wares.sellPrice - card.wares.buyPrice : 0;
          return 64 + Math.max(0, margin);
        }
      }
      return 64;
    case 'DISCARD_DRAWN':
      return 44;
    case 'SKIP_DRAW':
      return 28;
    case 'END_TURN': {
      const opponent: 0 | 1 = me === 0 ? 1 : 0;
      const goldGap = state.players[opponent].gold - player.gold;
      // Behind: keep grinding actions instead of ending early. Ahead: bank the lead, take fewer risks.
      const urgency = goldGap > 10 ? -8 : goldGap < -10 ? 6 : 0;
      return state.actionsLeft >= 2
        ? 6 - getCardEconomyValue(player.hand.length) * 0.4 + urgency
        : 18 - getCardEconomyValue(player.hand.length) * 0.2 - getHandRiskPenalty(player.hand.length) * 0.5 + urgency * 0.5;
    }
    default:
      return 10;
  }
}

function isWarePlayAction(action: GameAction): boolean {
  return action.type === 'PLAY_CARD' && (action.wareMode === 'buy' || action.wareMode === 'sell');
}

function pickWareNearTop(scored: ReadonlyArray<{ action: GameAction; score: number }>, topScore: number): GameAction | null {
  const nearTopThreshold = 9;
  const wareCandidates = scored
    .filter((entry) => isWarePlayAction(entry.action) && topScore - entry.score <= nearTopThreshold)
    .sort((a, b) => b.score - a.score);
  return wareCandidates[0]?.action ?? null;
}

function getMediumAuctionBidAction(state: GameState): GameAction | null {
  const pr = state.pendingResolution;
  if (!pr || pr.type !== 'AUCTION' || !isAuctionBidding(pr)) return null;

  const me = pr.nextBidder;
  const bidAmount = pr.currentBid + 1;
  const player = state.players[me];

  if (player.gold < bidAmount) {
    return { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_PASS' } };
  }

  // Use valuation ceiling — medium is slightly more willing than easy (which uses random pass)
  const maxBid = getAuctionMaxBidFor(state, me, pr);

  if (bidAmount > maxBid) {
    return { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_PASS' } };
  }

  return { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_BID', amount: bidAmount } };
}

export function getMediumAiAction(state: GameState, rng: () => number = createMediumRng(state)): GameAction | null {
  // Special handling for auction bidding — use valuation
  if (state.pendingResolution?.type === 'AUCTION' && isAuctionBidding(state.pendingResolution)) {
    const auctionAction = getMediumAuctionBidAction(state);
    if (auctionAction) return auctionAction;
  }

  // Medium plays guard 60% and ware card reactions 55% (vs RandomAI's 30%)
  if (state.pendingGuardReaction) {
    return { type: 'GUARD_REACTION', play: rng() < 0.6 };
  }
  if (state.pendingWareCardReaction) {
    return { type: 'WARE_CARD_REACTION', play: rng() < 0.55 };
  }

  if (state.pendingResolution) {
    return getRandomAiAction(state, rng);
  }

  const validActions = getValidActions(state);
  if (validActions.length === 0) return null;

  const scored = validActions.map((action) => ({ action, score: scoreAction(state, action) }));
  const topScore = Math.max(...scored.map(s => s.score));
  const wareNearTop = pickWareNearTop(scored, topScore);
  if (wareNearTop) return wareNearTop;
  const best = scored.filter(s => s.score === topScore).map(s => s.action);
  return pick(best, rng);
}
