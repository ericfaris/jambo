import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { planFlights, snapshotForFlights, coinCount, anchorSelector, MAX_COINS_PER_FLIGHT } from '../../src/ui/flights.ts';
import type { FlightSnapshot } from '../../src/ui/flights.ts';
import { CenterRow } from '../../src/ui/CenterRow.tsx';
import { createTestState, toPlayPhase, act, withHand, withMarket, withGold, removeFromDeck } from '../helpers/testHelpers.ts';
import type { GameAction } from '../../src/engine/types.ts';

function snap(over: Partial<FlightSnapshot> = {}): FlightSnapshot {
  return {
    markets: [[null, null, null, null, null, null], [null, null, null, null, null, null]],
    supply: { trinkets: 6, hides: 6, tea: 6, silk: 6, fruit: 6, salt: 6 },
    gold: [20, 20],
    handCounts: [5, 5],
    deckCount: 90,
    discardCount: 10,
    logLength: 10,
    ...over,
  };
}

describe('flight planning from real engine moves', () => {
  it('a buy flies wares from the supply baskets into your slots and coins out of your gold', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = removeFromDeck(s, 'ware_3k_1');
    s = withGold(s, 0, 20);
    const next = act(s, { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' });
    const flights = planFlights(snapshotForFlights(s), snapshotForFlights(next));
    const wares = flights.filter((f) => f.kind === 'ware');
    expect(wares).toHaveLength(3);
    for (const w of wares) {
      expect(w.from).toEqual({ type: 'supply', ware: 'trinkets' });
      expect(w.to).toMatchObject({ type: 'slot', player: 0 });
      expect(w.revealsSlot).toBeTruthy();
    }
    const coins = flights.filter((f) => f.kind === 'coin');
    expect(coins).toHaveLength(coinCount(3));
    expect(coins[0]).toMatchObject({ from: { type: 'gold', player: 0 }, to: { type: 'table' } });
  });

  it('a sell sends the wares back to the supply and coins into your gold', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = removeFromDeck(s, 'ware_3k_1');
    s = withMarket(s, 0, ['trinkets', 'trinkets', 'trinkets', null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 3 } };
    const next = act(s, { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'sell' } as GameAction);
    const flights = planFlights(snapshotForFlights(s), snapshotForFlights(next));
    expect(flights.filter((f) => f.kind === 'ware').map((f) => f.to)).toEqual([
      { type: 'supply', ware: 'trinkets' }, { type: 'supply', ware: 'trinkets' }, { type: 'supply', ware: 'trinkets' },
    ]);
    expect(flights.filter((f) => f.kind === 'coin').every((f) => f.to.type === 'gold' && f.from.type === 'table')).toBe(true);
  });
});

describe('flight planning — thefts, swaps, transfers', () => {
  it('Parrot: the stolen ware crosses from their slot to yours', () => {
    const prev = snap({ markets: [[null, null, null, null, null, null], ['tea', 'silk', null, null, null, null]] });
    const next = snap({ markets: [['silk', null, null, null, null, null], ['tea', null, null, null, null, null]], logLength: 11 });
    expect(planFlights(prev, next)).toEqual([
      expect.objectContaining({ kind: 'ware', ware: 'silk', from: { type: 'slot', player: 1, index: 1 }, to: { type: 'slot', player: 0, index: 0 } }),
    ]);
  });

  it('Throne: both wares cross, in place', () => {
    const prev = snap({ markets: [['tea', null, null, null, null, null], ['silk', null, null, null, null, null]] });
    const next = snap({ markets: [['silk', null, null, null, null, null], ['tea', null, null, null, null, null]], logLength: 11 });
    const flights = planFlights(prev, next);
    expect(flights).toHaveLength(2);
    expect(flights.every((f) => f.from.type === 'slot' && f.to.type === 'slot' && f.from.player !== f.to.player)).toBe(true);
  });

  it('Cheetah: coins go straight from payer to payee', () => {
    const flights = planFlights(snap(), snap({ gold: [18, 22], logLength: 11 }));
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({ kind: 'coin', from: { type: 'gold', player: 0 }, to: { type: 'gold', player: 1 } });
  });

  it('Hyena: a card flies between hands when nothing else explains it', () => {
    const flights = planFlights(snap(), snap({ handCounts: [6, 4], logLength: 11 }));
    expect(flights).toEqual([expect.objectContaining({ kind: 'card', from: { type: 'hand', player: 1 }, to: { type: 'hand', player: 0 } })]);
    // a draw (deck shrinks) is not a hand-to-hand move
    expect(planFlights(snap(), snap({ handCounts: [6, 4], deckCount: 89, logLength: 11 })).filter((f) => f.kind === 'card')).toEqual([]);
  });

  it('drafted wares with no source come from the table', () => {
    const next = snap({ markets: [['fruit', null, null, null, null, null], [null, null, null, null, null, null]], logLength: 11 });
    expect(planFlights(snap(), next)[0]).toMatchObject({ from: { type: 'table' }, to: { type: 'slot', player: 0, index: 0 } });
  });

  it('plans nothing for a resume, a new game, or no new log entries', () => {
    expect(planFlights(snap(), snap({ gold: [30, 20], logLength: 10 }))).toEqual([]);
    expect(planFlights(snap(), snap({ gold: [30, 20], logLength: 40 }))).toEqual([]);
    expect(planFlights(snap({ logLength: 50 }), snap({ gold: [30, 20], logLength: 3 }))).toEqual([]);
  });

  it('coins scale with the amount but stay a handful', () => {
    expect(coinCount(1)).toBe(1);
    expect(coinCount(12)).toBe(6);
    expect(coinCount(-40)).toBe(MAX_COINS_PER_FLIGHT);
  });

  it('every anchor maps to a board data attribute', () => {
    expect(anchorSelector({ type: 'slot', player: 1, index: 4 })).toBe('[data-market-slot="1-4"]');
    expect(anchorSelector({ type: 'supply', ware: 'tea' })).toBe('[data-supply-ware="tea"]');
    expect(anchorSelector({ type: 'gold', player: 0 })).toBe('[data-gold-anchor="0"]');
    expect(anchorSelector({ type: 'hand', player: 1 })).toBe('[data-hand-anchor="1"]');
  });
});

describe('discard pile waits for the spotlight', () => {
  it('shows the card underneath while the spotlit card is still being announced', () => {
    const s = { ...createTestState(), discardPile: ['parrot_1', 'well_1'] };
    const held = renderToStaticMarkup(createElement(CenterRow, { state: s, dispatch: () => {}, heldDiscardCard: 'parrot_1' }));
    expect(held).toContain('/assets/cards/well.png');
    expect(held).not.toContain('/assets/cards/parrot.png');
    const normal = renderToStaticMarkup(createElement(CenterRow, { state: s, dispatch: () => {} }));
    expect(normal).toContain('/assets/cards/parrot.png');
  });
});
