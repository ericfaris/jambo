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

    expect(stepOne).toContain('resolve-title">Traveling Merchant<');
    expect(stepOne).toContain('Pick first ware from supply for auction');

    expect(stepTwo).toContain('resolve-title">Traveling Merchant<');
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

    expect(stepOneWaiting).toContain('resolve-title">Traveling Merchant<');
    expect(stepOneWaiting).toContain('Step 1/2: waiting for opponent to select auction wares');

    expect(stepTwoWaiting).toContain('resolve-title">Traveling Merchant<');
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

    expect(beforeBiddingForActive).toContain('resolve-title">Traveling Merchant<');
    expect(beforeBiddingForActive).toContain('Pick second ware from supply');
    expect(biddingForActive).toContain('resolve-title">Traveling Merchant<');
    expect(biddingForActive).toContain('Waiting for opponent bid');
    expect(biddingForActive).toContain('On the block');

    expect(beforeBiddingForOpponent).toContain('resolve-title">Traveling Merchant<');
    expect(beforeBiddingForOpponent).toContain('Step 1/2: waiting for opponent to select auction wares');
    expect(biddingForOpponent).toContain('resolve-title">Traveling Merchant<');
    expect(biddingForOpponent).toContain('On the block');
    expect(biddingForOpponent).toContain('Current bid');
    expect(biddingForOpponent).toContain('aria-label="1g"');
    expect(biddingForOpponent).toContain('Bid 2g');
    expect(biddingForOpponent).toContain('Your call');
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
    expect(html).toContain('resolve-title">Arabian Merchant<');
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

describe('auction board shows both purses', () => {
  const withGold = (state: GameState, mine: number, theirs: number): GameState => ({
    ...state,
    players: [{ ...state.players[0], gold: mine }, { ...state.players[1], gold: theirs }],
  });
  const purses = (html: string) => [...html.matchAll(/auction-caption">([^<]+)<\/span><span class="auction-purse-amount">(\d+)g/g)].map((m) => [m[1].replace(/&#x27;/g, "'"), m[2]]);

  it('shows your gold and the opponent\'s, from either seat', () => {
    const state = withGold(withAuctionState(createTestState(), ['tea', 'salt']), 23, 41);
    const p0 = renderToStaticMarkup(createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0 }));
    const p1 = renderToStaticMarkup(createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 1 }));
    expect(purses(p0)).toEqual([['Your gold', '23'], ["Opponent's gold", '41']]);
    expect(purses(p1)).toEqual([['Your gold', '41'], ["Opponent's gold", '23']]);
  });

  it('names the opponent online', () => {
    const state = withGold(withAuctionState(createTestState(), ['tea', 'salt']), 23, 41);
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0, opponentName: 'Sam' }));
    expect(purses(html)).toEqual([['Your gold', '23'], ["Sam's gold", '41']]);
  });

  it('shows both purses on the Arabian Merchant card auction too', () => {
    const base = withGold(createTestState(), 30, 12);
    const state: GameState = {
      ...base,
      currentPlayer: 0,
      pendingResolution: {
        type: 'AUCTION', sourceCard: 'arabian_merchant_1', wares: [], revealedCards: ['guard_1', 'well_1'],
        currentBid: 0, currentBidder: 0, nextBidder: 0, passed: [false, false],
      },
    };
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state, dispatch: noopDispatch, viewerPlayer: 0 }));
    expect(purses(html)).toEqual([['Your gold', '30'], ["Opponent's gold", '12']]);
  });
});

describe('resolve panel source card', () => {
  it('is the full card face in the panel grid, not a cropped art strip', () => {
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state: withAuctionState(createTestState(), ['tea', 'salt']), dispatch: noopDispatch, viewerPlayer: 0 }));
    expect(html).toContain('resolve-panel-with-card');
    expect(html).toMatch(/class="resolve-source"[^>]*><div[^>]*class="card-face/);
    // the card's own name and text are on it
    expect(html).toMatch(/resolve-source[\s\S]*Traveling Merchant<\/div><div class="card-face-desc"/);
    expect(html).not.toContain('panel-source-art');
    // the source card comes before the title, so it sits upper left
    expect(html.indexOf('resolve-source')).toBeLessThan(html.indexOf('resolve-title'));
  });
});
