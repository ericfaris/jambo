import { describe, expect, it } from 'vitest';
import type { GameState, PendingAuction, WareType } from '../../src/engine/types.ts';
import { getEasyAiAction } from '../../src/ai/difficulties/EasyAI.ts';
import { getMediumAiAction } from '../../src/ai/difficulties/MediumAI.ts';
import { getHardAiAction } from '../../src/ai/difficulties/HardAI.ts';
import { getAuctionMaxBid, getCardAuctionMaxBid } from '../../src/ai/strategyHeuristics.ts';
import { createTestState, toPlayPhase, withGold, withHand, withMarket } from '../helpers/testHelpers.ts';

/**
 * Build a game state with an active auction bidding phase.
 * Player 0 is the currentPlayer (played the Traveling Merchant).
 * nextBidder determines who the AI must respond as.
 */
function withAuction(
  state: GameState,
  opts: {
    wares: WareType[];
    currentBid: number;
    currentBidder: 0 | 1;
    nextBidder: 0 | 1;
  },
): GameState {
  const pending: PendingAuction = {
    type: 'AUCTION',
    sourceCard: 'traveling_merchant_1',
    wares: opts.wares,
    currentBid: opts.currentBid,
    currentBidder: opts.currentBidder,
    nextBidder: opts.nextBidder,
    passed: [false, false],
  };
  return { ...state, pendingResolution: pending };
}

describe('Auction bidding — valuation heuristic', () => {
  it('getAuctionMaxBid returns 0 when player has no market space', () => {
    let state = toPlayPhase(createTestState(100));
    state = withMarket(state, 1, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    const max = getAuctionMaxBid(state, 1, ['trinkets', 'hides']);
    expect(max).toBe(0);
  });

  it('getAuctionMaxBid values wares that complete a sell card in hand', () => {
    let state = toPlayPhase(createTestState(101));
    // Player 1 has a ware card needing 3 trinkets (sell for 10g) and already has 1 trinket
    state = withHand(state, 1, ['ware_3k_1']);
    state = withMarket(state, 1, ['trinkets', null, null, null, null, null]);
    state = withGold(state, 1, 20);

    const max = getAuctionMaxBid(state, 1, ['trinkets', 'trinkets']);
    // With 2 trinkets added, player completes the sell (3 trinkets → sell 10g)
    // Value should be significant (sell price minus discount)
    expect(max).toBeGreaterThanOrEqual(5);
  });

  it('getAuctionMaxBid returns low value for unneeded wares', () => {
    let state = toPlayPhase(createTestState(102));
    // Player 1 has no ware cards — the wares don't help complete any sell
    state = withHand(state, 1, ['guard_1']);
    state = withMarket(state, 1, [null, null, null, null, null, null]);
    state = withGold(state, 1, 20);

    const max = getAuctionMaxBid(state, 1, ['trinkets', 'hides']);
    // Base value only (2 wares ≈ 2g), capped by gold
    expect(max).toBeLessThanOrEqual(4);
  });

  it('getAuctionMaxBid caps at ~40% of gold', () => {
    let state = toPlayPhase(createTestState(103));
    state = withHand(state, 1, ['ware_6all_1']); // 6-ware card with high sell price
    state = withMarket(state, 1, ['trinkets', 'hides', 'tea', 'silk', null, null]);
    state = withGold(state, 1, 5); // Only 5g

    const max = getAuctionMaxBid(state, 1, ['fruit', 'salt']);
    // 40% of 5g = 2g, should not exceed that
    expect(max).toBeLessThanOrEqual(2);
  });
});

describe('Auction bidding — Easy AI', () => {
  it('passes when bid exceeds ware value', () => {
    let state = toPlayPhase(createTestState(200));
    state = withHand(state, 1, ['guard_1', 'guard_2']);
    state = withMarket(state, 1, [null, null, null, null, null, null]);
    state = withGold(state, 1, 30);

    // Auction for 2 random wares — bid already at 8g, well above value for unneeded wares
    state = withAuction(state, {
      wares: ['trinkets', 'hides'],
      currentBid: 8,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getEasyAiAction(state, () => 0.1);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      expect(action!.response.type).toBe('AUCTION_PASS');
    }
  });

  it('bids at low prices when wares are valuable', () => {
    let state = toPlayPhase(createTestState(201));
    state = withHand(state, 1, ['ware_3k_1']);
    state = withMarket(state, 1, ['trinkets', null, null, null, null, null]);
    state = withGold(state, 1, 20);

    // Auction for 2 trinkets at starting bid 1g — these complete a sell
    state = withAuction(state, {
      wares: ['trinkets', 'trinkets'],
      currentBid: 1,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getEasyAiAction(state, () => 0.1);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      expect(action!.response.type).toBe('AUCTION_BID');
    }
  });
});

describe('Auction bidding — Medium AI', () => {
  it('passes when bid exceeds valuation', () => {
    let state = toPlayPhase(createTestState(300));
    state = withHand(state, 1, ['guard_1']);
    state = withMarket(state, 1, [null, null, null, null, null, null]);
    state = withGold(state, 1, 30);

    state = withAuction(state, {
      wares: ['tea', 'silk'],
      currentBid: 10,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getMediumAiAction(state, () => 0.5);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      expect(action!.response.type).toBe('AUCTION_PASS');
    }
  });

  it('bids when wares complete a profitable sell', () => {
    let state = toPlayPhase(createTestState(301));
    state = withHand(state, 1, ['ware_3k_1']);
    state = withMarket(state, 1, ['trinkets', null, null, null, null, null]);
    state = withGold(state, 1, 20);

    state = withAuction(state, {
      wares: ['trinkets', 'trinkets'],
      currentBid: 1,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getMediumAiAction(state, () => 0.5);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      expect(action!.response.type).toBe('AUCTION_BID');
    }
  });

  it('does not overpay even with a sell card in hand', () => {
    let state = toPlayPhase(createTestState(302));
    // ware_3k: sell 10g for 3 trinkets. Has 0 trinkets. Auction offers hides + tea.
    // These wares don't help complete any sell — they're just generic wares.
    state = withHand(state, 1, ['ware_3k_1']);
    state = withMarket(state, 1, [null, null, null, null, null, null]);
    state = withGold(state, 1, 20);

    state = withAuction(state, {
      wares: ['hides', 'tea'],
      currentBid: 7,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getMediumAiAction(state, () => 0.5);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      // 8g for 2 wares with no sell synergy is too much (max ~40% of 20g = 8, base value = 2)
      expect(action!.response.type).toBe('AUCTION_PASS');
    }
  });
});

describe('Auction bidding — Hard AI', () => {
  it('passes when bid far exceeds ware value', () => {
    let state = toPlayPhase(createTestState(400));
    state = withHand(state, 1, ['guard_1']);
    state = withMarket(state, 1, [null, null, null, null, null, null]);
    state = withGold(state, 1, 30);

    state = withAuction(state, {
      wares: ['fruit', 'salt'],
      currentBid: 10,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getHardAiAction(state, () => 0.5);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      expect(action!.response.type).toBe('AUCTION_PASS');
    }
  });

  it('bids when wares complete a profitable sell at low price', () => {
    let state = toPlayPhase(createTestState(401));
    state = withHand(state, 1, ['ware_3k_1']);
    state = withMarket(state, 1, ['trinkets', null, null, null, null, null]);
    state = withGold(state, 1, 20);

    state = withAuction(state, {
      wares: ['trinkets', 'trinkets'],
      currentBid: 1,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getHardAiAction(state, () => 0.5);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      expect(action!.response.type).toBe('AUCTION_BID');
    }
  });

  it('refuses to pay exorbitant amount for low-value wares', () => {
    let state = toPlayPhase(createTestState(402));
    // No ware cards in hand — wares have no sell synergy
    state = withHand(state, 1, ['guard_1', 'crocodile_1']);
    state = withMarket(state, 1, [null, null, null, null, null, null]);
    state = withGold(state, 1, 20);

    state = withAuction(state, {
      wares: ['tea', 'silk'],
      currentBid: 6,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getHardAiAction(state, () => 0.5);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      expect(action!.response.type).toBe('AUCTION_PASS');
    }
  });

  it('does not bid with insufficient market space', () => {
    let state = toPlayPhase(createTestState(403));
    state = withHand(state, 1, ['ware_3k_1']);
    state = withMarket(state, 1, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    state = withGold(state, 1, 30);

    state = withAuction(state, {
      wares: ['trinkets', 'trinkets'],
      currentBid: 1,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getHardAiAction(state, () => 0.5);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      expect(action!.response.type).toBe('AUCTION_PASS');
    }
  });

  it('caps spending relative to gold reserve', () => {
    let state = toPlayPhase(createTestState(404));
    state = withHand(state, 1, ['ware_6all_1']); // High-value sell card
    state = withMarket(state, 1, ['trinkets', 'hides', 'tea', 'silk', null, null]);
    state = withGold(state, 1, 6); // Low gold

    // Even though wares are valuable, 40% of 6g = 2g cap
    state = withAuction(state, {
      wares: ['fruit', 'salt'],
      currentBid: 3,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getHardAiAction(state, () => 0.5);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      expect(action!.response.type).toBe('AUCTION_PASS');
    }
  });
});

describe('Auction bidding — all difficulties pass at high bids', () => {
  // Regression: AI should never pay 10+ gold for 2 generic wares
  it.each([
    { name: 'easy', getAction: getEasyAiAction },
    { name: 'medium', getAction: getMediumAiAction },
    { name: 'hard', getAction: getHardAiAction },
  ])('$name AI passes when bid reaches 10g for unsynergistic wares', ({ getAction }) => {
    let state = toPlayPhase(createTestState(500));
    // No ware sell cards, just guard cards
    state = withHand(state, 1, ['guard_1', 'guard_2', 'guard_3']);
    state = withMarket(state, 1, [null, null, null, null, null, null]);
    state = withGold(state, 1, 50);

    state = withAuction(state, {
      wares: ['trinkets', 'hides'],
      currentBid: 10,
      currentBidder: 0,
      nextBidder: 1,
    });

    const action = getAction(state, () => 0.5);
    expect(action).not.toBeNull();
    expect(action!.type).toBe('RESOLVE_INTERACTION');
    if (action!.type === 'RESOLVE_INTERACTION') {
      expect(action!.response.type).toBe('AUCTION_PASS');
    }
  });
});

describe('Arabian Merchant card auction — AI bidding', () => {
  function withCardAuction(state: GameState, currentBid: number, nextBidder: 0 | 1): GameState {
    const pending: PendingAuction = {
      type: 'AUCTION',
      sourceCard: 'arabian_merchant_1',
      wares: [],
      revealedCards: state.deck.slice(0, 3),
      currentBid,
      currentBidder: nextBidder === 0 ? 1 : 0,
      nextBidder,
      passed: [false, false],
    };
    return { ...state, pendingResolution: pending };
  }

  it('values 3 cards at a few gold, capped by 40% of gold', () => {
    let state = toPlayPhase(createTestState(200));
    state = withGold(state, 1, 20);
    const max = getCardAuctionMaxBid(state, 1, state.deck.slice(0, 3));
    expect(max).toBeGreaterThanOrEqual(4);
    expect(max).toBeLessThanOrEqual(8);
    state = withGold(state, 1, 5);
    expect(getCardAuctionMaxBid(state, 1, state.deck.slice(0, 3))).toBeLessThanOrEqual(2);
  });

  for (const [name, ai] of [['medium', getMediumAiAction], ['hard', getHardAiAction]] as const) {
    it(`${name} AI opens the bidding on a cheap card auction`, () => {
      let state = toPlayPhase(createTestState(201));
      state = withGold(state, 1, 20);
      state = withCardAuction(state, 0, 1);
      expect(ai(state)).toEqual({ type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_BID', amount: 1 } });
    });

    it(`${name} AI passes once the price exceeds the cards' value`, () => {
      let state = toPlayPhase(createTestState(202));
      state = withGold(state, 1, 20);
      state = withCardAuction(state, 12, 1);
      expect(ai(state)).toEqual({ type: 'RESOLVE_INTERACTION', response: { type: 'AUCTION_PASS' } });
    });
  }
});
