import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { InteractionPanel } from '../../src/ui/InteractionPanel.tsx';
import type { GameAction, GameState } from '../../src/engine/types.ts';
import { createTestState } from '../helpers/testHelpers.ts';

function withAuctionState(
  state: GameState,
  wares: Array<'trinkets' | 'hides' | 'tea' | 'silk' | 'fruit' | 'salt'>,
): GameState {
  return {
    ...state,
    currentPlayer: 0,
    pendingResolution: {
      type: 'AUCTION',
      sourceCard: 'traveling_merchant_1',
      wares,
      currentBid: wares.length < 2 ? 0 : 1,
      currentBidder: 0,
      nextBidder: 1,
      passed: [false, false],
    },
  };
}

const noopDispatch = (_action: GameAction) => {};

describe('InteractionPanel auction continuity', () => {
  it('keeps Traveling Merchant panel mounted across first and second pick for active local player', () => {
    const base = createTestState();

    const stepOne = renderToStaticMarkup(
      createElement(InteractionPanel, { state: withAuctionState(base, []), dispatch: noopDispatch, viewerPlayer: 0 }),
    );
    const stepTwo = renderToStaticMarkup(
      createElement(InteractionPanel, { state: withAuctionState(base, ['tea']), dispatch: noopDispatch, viewerPlayer: 0 }),
    );

    expect(stepOne).toContain('Traveling Merchant - Resolve');
    expect(stepOne).toContain('Pick first ware from supply for auction');

    expect(stepTwo).toContain('Traveling Merchant - Resolve');
    expect(stepTwo).toContain('Pick second ware from supply');
  });

  it('keeps Traveling Merchant panel mounted for waiting opponent during both pick steps (cast view)', () => {
    const base = createTestState();

    const stepOneWaiting = renderToStaticMarkup(
      createElement(InteractionPanel, { state: withAuctionState(base, []), dispatch: noopDispatch, viewerPlayer: 1 }),
    );
    const stepTwoWaiting = renderToStaticMarkup(
      createElement(InteractionPanel, { state: withAuctionState(base, ['salt']), dispatch: noopDispatch, viewerPlayer: 1 }),
    );

    expect(stepOneWaiting).toContain('Traveling Merchant - Resolve');
    expect(stepOneWaiting).toContain('Step 1/2: waiting for opponent to select auction wares');

    expect(stepTwoWaiting).toContain('Traveling Merchant - Resolve');
    expect(stepTwoWaiting).toContain('Step 1/2: waiting for opponent to select auction wares');
  });

  it('keeps panel mounted when transitioning from second pick into bidding phase', () => {
    const base = createTestState();

    const beforeBiddingForActive = renderToStaticMarkup(
      createElement(InteractionPanel, { state: withAuctionState(base, ['tea']), dispatch: noopDispatch, viewerPlayer: 0 }),
    );
    const biddingForActive = renderToStaticMarkup(
      createElement(InteractionPanel, { state: withAuctionState(base, ['tea', 'salt']), dispatch: noopDispatch, viewerPlayer: 0 }),
    );

    const beforeBiddingForOpponent = renderToStaticMarkup(
      createElement(InteractionPanel, { state: withAuctionState(base, ['tea']), dispatch: noopDispatch, viewerPlayer: 1 }),
    );
    const biddingForOpponent = renderToStaticMarkup(
      createElement(InteractionPanel, { state: withAuctionState(base, ['tea', 'salt']), dispatch: noopDispatch, viewerPlayer: 1 }),
    );

    expect(beforeBiddingForActive).toContain('Traveling Merchant - Resolve');
    expect(beforeBiddingForActive).toContain('Pick second ware from supply');
    expect(biddingForActive).toContain('Traveling Merchant - Resolve');
    expect(biddingForActive).toContain('Step 2/2: waiting for opponent bid');

    expect(beforeBiddingForOpponent).toContain('Traveling Merchant - Resolve');
    expect(beforeBiddingForOpponent).toContain('Step 1/2: waiting for opponent to select auction wares');
    expect(biddingForOpponent).toContain('Traveling Merchant - Resolve');
    expect(biddingForOpponent).toContain('Auction:');
    expect(biddingForOpponent).toContain('Current bid: 1g. Your turn.');
  });
});

describe('InteractionPanel Arabian Merchant card auction', () => {
  function cardAuction(base: GameState, nextBidder: 0 | 1): GameState {
    return {
      ...base,
      currentPlayer: 0,
      pendingResolution: {
        type: 'AUCTION',
        sourceCard: 'arabian_merchant_1',
        wares: [],
        revealedCards: base.deck.slice(0, 3),
        currentBid: 0,
        currentBidder: 1,
        nextBidder,
        passed: [false, false],
      },
    };
  }

  it('shows the revealed cards and bid/pass to the bidder', () => {
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state: cardAuction(createTestState(), 0), dispatch: noopDispatch, viewerPlayer: 0 }));
    expect(html).toContain('Arabian Merchant - Resolve');
    expect(html).toContain('Auction for 3 cards');
    expect(html).toContain('Bid 1g');
    expect(html).toContain('Pass');
    expect(html).not.toContain('Pick first ware');
  });

  it('shows a waiting message to the non-bidder', () => {
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state: cardAuction(createTestState(), 1), dispatch: noopDispatch, viewerPlayer: 0 }));
    expect(html).toContain('Waiting for opponent bid');
    expect(html).not.toContain('Bid 1g');
  });
});

describe('Arabian Merchant panel layout', () => {
  it('uses the compact source-card layout so Bid/Pass stay on screen', () => {
    const base = createTestState();
    const state: GameState = {
      ...base,
      pendingResolution: {
        type: 'AUCTION', sourceCard: 'arabian_merchant_1', wares: [], revealedCards: base.deck.slice(0, 3),
        currentBid: 0, currentBidder: 1, nextBidder: 0, passed: [false, false],
      },
    };
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0 }));
    expect(html).toContain('max-width:980px');
  });
});
