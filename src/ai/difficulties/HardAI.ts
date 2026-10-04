import type { DeckCardId, GameAction, GameState, PlayerState, UtilityDesignId, WareType } from '../../engine/types.ts';

import { getCard } from '../../engine/cards/CardDatabase.ts';
import { getPendingResponder, getResponder, isAuctionBidding } from '../../engine/responder.ts';
import { processAction } from '../../engine/GameEngine.ts';
import { getValidActions } from '../../engine/validation/actionValidator.ts';
import { getMediumAiAction } from './MediumAI.ts';
import { getRandomAiAction, getRandomInteractionResponse, getFallbackInteractionResponses } from '../RandomAI.ts';
import { createRng } from '../../utils/rng.ts';
import { determinizeForPlayer, createDeterminizeRng } from '../determinize.ts';
import {
  countCurrentlySellableWareCards,
  countMissingWares,
  getAuctionMaxBidFor,
  getCardEconomyValue,
  getCardPressureBonus,
  getDefensiveAnimalPriority,
  getHandRiskPenalty,
  getMarketExposurePenalty,
  getPeoplePlayComboPriority,
  getUtilityActivationPriority,
  getUtilityPlayPriority,
  getUtilitySetStrength,
  getWareAcquisitionPriority,
} from '../strategyHeuristics.ts';

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function createHardRng(state: GameState): () => number {
  let seed = state.rngSeed | 0;
  seed ^= Math.imul((state.turn + 7) | 0, 0x1b873593);
  seed ^= Math.imul((state.actionsLeft + 13) | 0, 0x85ebca6b);
  seed ^= Math.imul((state.currentPlayer + 17) | 0, 0xc2b2ae35);
  seed ^= Math.imul(state.log.length | 0, 0x27d4eb2f);
  return createRng(seed);
}

export { getPendingResponder };

// Gold-equivalent value of what a player holds besides gold. Without these,
// a card in hand scored ~0.2g and a ware on the market ~0g, so every draw or
// buy looked like a loss next to the +1g idle bonus — the AI would skip its
// draw and end turn with 5 actions left for 15 turns straight while a human
// churned through the deck and caught up (game log 2026-10-04).
const WARE_ASSET_GOLD = 1.5;   // ~buy cost; sells for ~3.3–4g each, but only with a matching card
const CARD_ASSET_GOLD = 1.5;   // a card is a future action's worth of value
const MAX_VALUED_HAND = 6;     // cards past this rarely get played in time
const STAND_ASSET_GOLD = 3;    // +3 slots for the rest of the game (its timing bonus is in standPlayBonus)
const STAND_UNLOCK_WEIGHT = 3; // the unlocked buy is usually followed by a sale the stand also made room for

/**
 * Gold-equivalent of one hand card. A ware card that can sell against the
 * market right now (or is one ware short) is worth part of its profit, so
 * digging for a matching card and buying wares to complete a sale both show
 * up as gains — the buy-and-sell engine a strong player runs.
 */
function getCardAssetGold(player: PlayerState, cardId: DeckCardId, marketCounts: Record<WareType, number>): number {
  const card = getCard(cardId);
  if (card.type === 'ware' && card.wares) {
    const missing = countMissingWares(card.wares, marketCounts);
    const profit = Math.max(0, card.wares.sellPrice - card.wares.types.length * WARE_ASSET_GOLD);
    if (missing === 0) return CARD_ASSET_GOLD + profit * 0.5;
    if (missing === 1) return CARD_ASSET_GOLD + profit * 0.2;
    return CARD_ASSET_GOLD;
  }
  if (card.type === 'utility' && player.utilities.length >= 3) return CARD_ASSET_GOLD * 0.5;
  return CARD_ASSET_GOLD;
}

/**
 * Non-gold assets in gold-equivalent. They only pay off if there's time to
 * cash them in, so they fade as either player nears the 60g finish.
 */
export function getAssetValueGold(state: GameState, player: 0 | 1): number {
  const p = state.players[player];
  const counts: Record<WareType, number> = { trinkets: 0, hides: 0, tea: 0, silk: 0, fruit: 0, salt: 0 };
  let wares = 0;
  for (const slot of p.market) { if (slot) { counts[slot] += 1; wares += 1; } }
  // A drawn-but-undecided card is ours to keep — count it so a draw isn't scored as a wasted action
  const cards = state.drawnCard !== null && state.currentPlayer === player ? [...p.hand, state.drawnCard] : p.hand;
  const cardValues = cards.map(id => getCardAssetGold(p, id, counts)).sort((x, y) => y - x).slice(0, MAX_VALUED_HAND);
  const leader = Math.max(state.players[0].gold, state.players[1].gold);
  const timeLeft = Math.min(1, Math.max(0.4, (60 - leader) / 25));
  return (wares * WARE_ASSET_GOLD + p.smallMarketStands * STAND_ASSET_GOLD + cardValues.reduce((sum, v) => sum + v, 0)) * timeLeft;
}

export function evaluateBoard(state: GameState, perspective: 0 | 1): number {
  const me = perspective;
  const opp: 0 | 1 = me === 0 ? 1 : 0;

  const myGold = state.players[me].gold;
  const oppGold = state.players[opp].gold;
  const myMarketFilled = state.players[me].market.filter(w => w !== null).length;
  const oppMarketFilled = state.players[opp].market.filter(w => w !== null).length;
  const myCapacity = state.players[me].market.length - myMarketFilled;
  const oppCapacity = state.players[opp].market.length - oppMarketFilled;
  const myHand = state.players[me].hand.length;
  const oppHand = state.players[opp].hand.length;
  const myUtilities = state.players[me].utilities.length;
  const oppUtilities = state.players[opp].utilities.length;
  const myHandValue = getCardEconomyValue(myHand);
  const oppHandValue = getCardEconomyValue(oppHand);
  const myExposurePenalty = getMarketExposurePenalty(state.players[me]);
  const oppExposurePenalty = getMarketExposurePenalty(state.players[opp]);

  // Sell-readiness scoring
  const myMarketCounts: Record<WareType, number> = { trinkets: 0, hides: 0, tea: 0, silk: 0, fruit: 0, salt: 0 };
  for (const slot of state.players[me].market) { if (slot) myMarketCounts[slot] += 1; }
  const oppMarketCounts: Record<WareType, number> = { trinkets: 0, hides: 0, tea: 0, silk: 0, fruit: 0, salt: 0 };
  for (const slot of state.players[opp].market) { if (slot) oppMarketCounts[slot] += 1; }
  const mySellable = countCurrentlySellableWareCards(state.players[me], myMarketCounts);
  const oppSellable = countCurrentlySellableWareCards(state.players[opp], oppMarketCounts);

  let score = 0;
  score += myGold * 6.5;
  score -= oppGold * 4.0;
  if (state.phase !== 'GAME_OVER') {
    score += getAssetValueGold(state, me) * 6.5;
    score -= getAssetValueGold(state, opp) * 4.0;
  }
  score += myCapacity * 0.8;
  score -= oppCapacity * 0.5;
  score += (myMarketFilled - oppMarketFilled) * 0.5;
  score += myHandValue * 0.55 - oppHandValue * 0.35;
  score += (myUtilities - oppUtilities) * 1.2;
  score += mySellable * 4.5;
  score -= oppSellable * 2.5;
  score += getUtilitySetStrength(state, me);
  score -= getUtilitySetStrength(state, opp) * 0.8;

  // When significantly behind on gold, tolerate more risk (market exposure, hand hoarding)
  // to chase a comeback; a comfortable lead keeps the full risk-aversion.
  const goldGap = oppGold - myGold;
  const riskTolerance = goldGap > 0 ? Math.min(1, goldGap / 30) : 0;
  score -= myExposurePenalty * (1 - riskTolerance * 0.5);
  score += oppExposurePenalty * 0.55;
  score -= getHandRiskPenalty(myHand) * (1 - riskTolerance * 0.5);
  score += getHandRiskPenalty(oppHand) * 0.45;

  // Cards beyond 5 are wasted actions — penalize hoarding
  const handPenalty = Math.max(0, myHand - 5) * 1.5;
  score -= handPenalty;

  if (state.turnModifiers.buyDiscount > 0 && state.currentPlayer === me) score += 6;
  if (state.turnModifiers.sellBonus > 0 && state.currentPlayer === me) score += 9;

  // Nonlinear endgame proximity bonus
  const meGap = Math.max(0, 60 - myGold);
  if (meGap <= 8) {
    score += 25 + (8 - meGap) * 5; // burst bonus: 25 at 8g away, up to 65 at 0g away
  } else if (meGap <= 20) {
    score += (20 - meGap) * 1.5; // ramp: 0 at 20g away, 18 at 8g away
  }

  // Urgency penalty when opponent is close to 60g
  const oppGap = Math.max(0, 60 - oppGold);
  if (oppGap <= 12) {
    score -= (12 - oppGap) * 2.5;
  }

  // Endgame trigger: +40 from the perspective of whoever triggered it (they have the gold),
  // −25 from the perspective of whoever must play their final turn from behind.
  if (state.endgame !== null) {
    if (state.endgame.triggerPlayer === me) score += 40;
    else score -= 25;
  }

  if (state.phase === 'GAME_OVER') {
    if (myGold > oppGold) score += 800;
    if (myGold < oppGold) score -= 800;
  }

  return score;
}

function scoreStateDelta(before: GameState, after: GameState, perspective: 0 | 1): number {
  return evaluateBoard(after, perspective) - evaluateBoard(before, perspective);
}

/**
 * A Small Market Stand opens up the game — but only when the room gets used.
 * Its play bonus is the value of the best buy it unlocks: simulate the
 * stand, then score every buy that wasn't possible before (e.g. a 6-ware
 * Grand Market, or any 3-ware card once fewer than 3 slots are free).
 * Building into a market that still has room just burns gold. Kept out of
 * evaluateBoard so it never makes selling (emptying the market) look worse.
 */
export function standPlayBonus(state: GameState, me: 0 | 1, standCardId: DeckCardId): number {
  let afterStand: GameState;
  try {
    afterStand = processAction(state, { type: 'PLAY_CARD', cardId: standCardId });
  } catch {
    return 0;
  }
  const playableBefore = new Set(
    getValidActions(state)
      .filter(a => a.type === 'PLAY_CARD' && a.wareMode === 'buy')
      .map(a => (a.type === 'PLAY_CARD' ? a.cardId : '')),
  );
  const base = evaluateBoard(afterStand, me);
  let best = 0;
  for (const action of getValidActions(afterStand)) {
    if (action.type !== 'PLAY_CARD' || action.wareMode !== 'buy' || playableBefore.has(action.cardId)) continue;
    try {
      const afterBuy = processAction(afterStand, action);
      const gain = evaluateBoard(afterBuy, me) - base + tacticalActionBonus(afterStand, action, me);
      if (gain > best) best = gain;
    } catch {
      continue;
    }
  }
  return best * STAND_UNLOCK_WEIGHT;
}

export function tacticalActionBonus(state: GameState, action: GameAction, me: 0 | 1): number {
  const opponent: 0 | 1 = me === 0 ? 1 : 0;

  if (action.type === 'PLAY_CARD') {
    const card = getCard(action.cardId);
    if (card.type === 'ware' && action.wareMode === 'sell' && card.wares) {
      const myGold = state.players[me].gold;
      const oppGold = state.players[opponent].gold;
      const sellPrice = card.wares.sellPrice + state.turnModifiers.sellBonus;
      let bonus = 12 + sellPrice * 0.6;
      // Massive bonus if this sell triggers endgame
      if (myGold + sellPrice >= 60) bonus += 35;
      // Bonus if sell gets us within 8g of 60
      else if (myGold + sellPrice >= 52) bonus += 12;
      // Urgency bonus when opponent is near 60g
      if (oppGold >= 48) bonus += 8;
      return bonus;
    }
    if (card.type === 'ware' && action.wareMode === 'buy' && card.wares) {
      const myGold = state.players[me].gold;
      const oppGold = state.players[opponent].gold;
      const effectiveBuy = Math.max(0, card.wares.buyPrice - state.turnModifiers.buyDiscount);
      let bonus = (getWareAcquisitionPriority(state, me, card.wares) - 44) * 0.5;
      // Penalize buying when close to 60g if the spend drops us below 48g
      if (myGold >= 48 && myGold - effectiveBuy < 48) bonus -= 10;
      // Far behind — willing to spend down to build up sellable inventory for a comeback
      if (oppGold - myGold > 20) bonus += 5;
      return bonus;
    }
    if (card.type === 'animal') {
      const pressure = getCardPressureBonus(state, me, action.cardId);
      const defense = getDefensiveAnimalPriority(state, me, card.designId);
      // Behind on gold — lean into steal plays to catch up
      const catchUpBonus = Math.max(0, state.players[opponent].gold - state.players[me].gold) * 0.4;
      if (card.designId === 'crocodile') {
        return state.players[opponent].utilities.length * 2.6 + pressure + defense + catchUpBonus;
      }
      if (card.designId === 'parrot') {
        return 8 + pressure + defense + catchUpBonus;
      }
      return 2 + pressure + defense + catchUpBonus * 0.5;
    }
    if (card.type === 'people') {
      const pressure = getCardPressureBonus(state, me, action.cardId);
      const combo = getPeoplePlayComboPriority(state, me, card.designId);
      if (card.designId === 'portuguese') return state.players[me].market.filter(w => w !== null).length * 1.5 + combo;
      return 3 + pressure + combo;
    }
    if (card.type === 'stand') return standPlayBonus(state, me, action.cardId);
    if (card.type === 'utility') {
      if (state.players[me].utilities.length >= 3) return -8;
      return (getUtilityPlayPriority(state, me, card.designId as UtilityDesignId) - 58) * 0.45;
    }
  }

  if (action.type === 'ACTIVATE_UTILITY') {
    const utility = state.players[me].utilities[action.utilityIndex];
    if (!utility) return 0;
    return (getUtilityActivationPriority(state, me, utility.designId) - 55) * 0.45;
  }

  if (action.type === 'END_TURN' && state.actionsLeft > 1) {
    const handSize = state.players[me].hand.length;
    return -4 - Math.min(5, getCardEconomyValue(handSize) * 0.4) + getHandRiskPenalty(handSize) * 0.4;
  }

  return 0;
}

export function opponentBestReplyPenalty(nextState: GameState, perspective: 0 | 1): number {
  if (nextState.phase === 'GAME_OVER') return 0;

  const responder = getResponder(nextState);
  if (responder === perspective) return 0;

  const opponentActions = getValidActions(nextState);
  if (opponentActions.length === 0) return 0;

  let worstOpponentDelta = Number.POSITIVE_INFINITY;

  for (const opponentAction of opponentActions.slice(0, 20)) {
    try {
      const afterReply = processAction(nextState, opponentAction);
      const deltaForPerspective = scoreStateDelta(nextState, afterReply, perspective);
      if (deltaForPerspective < worstOpponentDelta) {
        worstOpponentDelta = deltaForPerspective;
      }
    } catch {
      continue;
    }
  }

  if (!Number.isFinite(worstOpponentDelta)) return 0;
  if (worstOpponentDelta >= 0) return 0;
  return -worstOpponentDelta * 0.3;
}

function scoreAction(state: GameState, action: GameAction): number {
  const me = state.currentPlayer;
  try {
    const next = processAction(state, action);
    const immediate = scoreStateDelta(state, next, me);
    const tactical = tacticalActionBonus(state, action, me);
    const penalty = opponentBestReplyPenalty(next, me);
    return immediate + tactical - penalty;
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}

function isWarePlayAction(action: GameAction): boolean {
  return action.type === 'PLAY_CARD' && (action.wareMode === 'buy' || action.wareMode === 'sell');
}

function pickWareNearTop(scored: ReadonlyArray<{ action: GameAction; score: number }>, topScore: number): GameAction | null {
  const nearTopThreshold = 12;
  const wareCandidates = scored
    .filter((entry) => isWarePlayAction(entry.action) && topScore - entry.score <= nearTopThreshold)
    .sort((a, b) => b.score - a.score);
  return wareCandidates[0]?.action ?? null;
}

export function getHardGuardReaction(state: GameState): GameAction {
  const gr = state.pendingGuardReaction;
  if (!gr) return { type: 'GUARD_REACTION', play: false };

  const defender = gr.targetPlayer;
  const hasGuard = state.players[defender].hand.some(id => getCard(id).designId === 'guard');
  if (!hasGuard) return { type: 'GUARD_REACTION', play: false };

  // Simulate both outcomes
  try {
    const afterGuard = processAction(state, { type: 'GUARD_REACTION', play: true });
    const afterSkip = processAction(state, { type: 'GUARD_REACTION', play: false });

    const guardScore = evaluateBoard(afterGuard, defender);
    const skipScore = evaluateBoard(afterSkip, defender);

    // Add bias toward guarding high-impact animals
    const animalCard = getCard(gr.animalCard);
    const animalBias: Record<string, number> = {
      elephant: 8, ape: 6, lion: 6, snake: 5, hyena: 4, crocodile: 2, parrot: 2, cheetah: 2,
    };
    const bias = animalBias[animalCard.designId] ?? 2;

    return { type: 'GUARD_REACTION', play: guardScore + bias >= skipScore };
  } catch {
    return { type: 'GUARD_REACTION', play: false };
  }
}

export function getHardWareCardReaction(state: GameState): GameAction {
  const wr = state.pendingWareCardReaction;
  if (!wr) return { type: 'WARE_CARD_REACTION', play: false };

  const defender = wr.targetPlayer;
  const hasRainMaker = state.players[defender].hand.some(id => getCard(id).designId === 'rain_maker');
  if (!hasRainMaker) return { type: 'WARE_CARD_REACTION', play: false };

  // Simulate both outcomes
  try {
    const afterPlay = processAction(state, { type: 'WARE_CARD_REACTION', play: true });
    const afterSkip = processAction(state, { type: 'WARE_CARD_REACTION', play: false });

    const playScore = evaluateBoard(afterPlay, defender);
    const skipScore = evaluateBoard(afterSkip, defender);

    return { type: 'WARE_CARD_REACTION', play: playScore > skipScore };
  } catch {
    return { type: 'WARE_CARD_REACTION', play: false };
  }
}

export function getHardInteractionAction(state: GameState, rng: () => number): GameAction | null {
  const pr = state.pendingResolution;
  if (!pr) return null;

  const responder = getPendingResponder(state);

  // Gather candidate responses: random pick + all fallback options
  const candidates: import('../../engine/types.ts').InteractionResponse[] = [];
  const randomResponse = getRandomInteractionResponse(state, rng);
  if (randomResponse) candidates.push(randomResponse);
  candidates.push(...getFallbackInteractionResponses(state));

  // Deduplicate
  const seen = new Set<string>();
  const unique: import('../../engine/types.ts').InteractionResponse[] = [];
  for (const c of candidates) {
    const key = JSON.stringify(c);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  if (unique.length === 0) return null;

  // If only one option, just use it
  if (unique.length === 1) {
    const action: GameAction = { type: 'RESOLVE_INTERACTION', response: unique[0] };
    try {
      processAction(state, action);
      return action;
    } catch {
      return null;
    }
  }

  // Comparing outcomes still requires guessing what the opponent holds —
  // reason about a plausible redeal of their hand/deck, not the true one.
  const world = determinizeForPlayer(state, responder, createDeterminizeRng(state, 2));

  // Simulate each and pick best by board eval
  let bestAction: GameAction | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const response of unique) {
    const action: GameAction = { type: 'RESOLVE_INTERACTION', response };
    try {
      const next = processAction(world, action);
      const score = evaluateBoard(next, responder);
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    } catch {
      continue;
    }
  }

  return bestAction;
}

export function getHardAuctionBidAction(state: GameState): GameAction | null {
  const pr = state.pendingResolution;
  if (!pr || pr.type !== 'AUCTION' || !isAuctionBidding(pr)) return null;

  const me = pr.nextBidder;
  const bidAmount = pr.currentBid + 1;
  const player = state.players[me];

  if (player.gold < bidAmount) {
    return { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_PASS' } };
  }

  // Use valuation-based ceiling from heuristics
  const maxBid = getAuctionMaxBidFor(state, me, pr);

  if (bidAmount > maxBid) {
    return { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_PASS' } };
  }

  // Simulate the pass outcome to see if letting the opponent win cheaply is bad.
  // Comparing outcomes requires guessing what the opponent holds — reason
  // about a plausible redeal, not their true hand.
  try {
    const world = determinizeForPlayer(state, me, createDeterminizeRng(state, 1));
    const passAction: GameAction = { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_PASS' } };
    const afterPass = processAction(world, passAction);
    const passScore = evaluateBoard(afterPass, me);
    const currentScore = evaluateBoard(world, me);

    // If passing gives opponent cheap wares that hurt us significantly, bid
    // If passing is neutral or good (no real loss), still bid if within valuation
    // Only refuse to bid if we're ABOVE valuation (already handled above)
    const passHurts = passScore < currentScore - 3;

    if (passHurts) {
      // Opponent benefits from cheap wares — bid to deny or win
      return { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_BID', amount: bidAmount } };
    }

    // Pass doesn't hurt much — still bid if price is low relative to value
    if (bidAmount <= Math.ceil(maxBid * 0.7)) {
      return { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_BID', amount: bidAmount } };
    }

    // Price is high relative to value and pass isn't terrible — pass
    return { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_PASS' } };
  } catch {
    // Fallback: use valuation ceiling
    if (bidAmount <= maxBid) {
      return { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_BID', amount: bidAmount } };
    }
    return { type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_PASS' } };
  }
}

export function getHardAiAction(state: GameState, rng: () => number = createHardRng(state)): GameAction | null {
  // Special handling for auction bidding — use board evaluation
  if (state.pendingResolution?.type === 'AUCTION' && isAuctionBidding(state.pendingResolution)) {
    const auctionAction = getHardAuctionBidAction(state);
    if (auctionAction) return auctionAction;
  }

  if (state.pendingResolution) {
    const smartAction = getHardInteractionAction(state, rng);
    if (smartAction) return smartAction;
    return getRandomAiAction(state, rng);
  }

  if (state.pendingGuardReaction) {
    return getHardGuardReaction(state);
  }

  if (state.pendingWareCardReaction) {
    return getHardWareCardReaction(state);
  }

  const validActions = getValidActions(state);
  if (validActions.length === 0) return null;

  // Scoring candidate moves requires guessing the opponent's hand and future
  // draws — reason about one plausible redeal, not the true hidden state.
  const world = determinizeForPlayer(state, state.currentPlayer, createDeterminizeRng(state, 0));

  const scored = validActions.map((action) => ({ action, score: scoreAction(world, action) }));
  const topScore = Math.max(...scored.map(s => s.score));
  const wareNearTop = pickWareNearTop(scored, topScore);
  if (wareNearTop) return wareNearTop;

  const mediumAction = getMediumAiAction(state, rng);
  if (mediumAction) {
    const mediumKey = JSON.stringify(mediumAction);
    const mediumScored = scored.find(s => JSON.stringify(s.action) === mediumKey);
    if (mediumScored && topScore - mediumScored.score <= 10) {
      return mediumAction;
    }
  }

  const best = scored.filter(s => s.score === topScore).map(s => s.action);
  return pick(best, rng);
}
