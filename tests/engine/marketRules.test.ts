// ============================================================================
// Official market-stand rules (Rio Grande / Kosmos rulebook)
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createTestState, toPlayPhase, act, resolve, withHand, withMarket, withGold, removeFromDeck, gold, market,
} from '../helpers/testHelpers.ts';
import { getSixthSpaceFee, getPlacementCapacity, addWaresToMarket, placeWaresUpToCapacity } from '../../src/engine/market/MarketManager.ts';
import { getSmallStandCost } from '../../src/engine/market/standCost.ts';
import type { GameState } from '../../src/engine/types.ts';

function totalWares(s: GameState): number {
  const onStands = s.players.reduce((n, p) => n + p.market.filter(w => w !== null).length, 0);
  return onStands + Object.values(s.wareSupply).reduce((a, b) => a + b, 0);
}

describe('6th space on the large market stand costs 2g', () => {
  it('buying into the 6th space charges the price plus 2g', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = removeFromDeck(s, 'ware_3k_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['hides', 'tea', 'silk', null, null, null]); // 3 free → 3rd ware fills the 6th
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' });
    expect(gold(s2, 0)).toBe(20 - 3 - 2);
    expect(market(s2, 0).every(w => w !== null)).toBe(true);
  });

  it('no fee while the 6th space stays empty', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = removeFromDeck(s, 'ware_3k_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['hides', 'tea', null, null, null, null]);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' });
    expect(gold(s2, 0)).toBe(17);
  });

  it('cannot buy if gold covers the price but not the 6th-space fee', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = removeFromDeck(s, 'ware_3k_1');
    s = withGold(s, 0, 4);
    s = withMarket(s, 0, ['hides', 'tea', 'silk', null, null, null]);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' })).toThrow(/insufficient gold \(need 5g/);
  });

  it('fills small-stand spaces before the paid 6th space', () => {
    let s = toPlayPhase(createTestState());
    s = { ...s, players: [{ ...s.players[0], smallMarketStands: 1, market: ['hides', 'tea', 'silk', 'fruit', 'salt', null, null, null, null] }, s.players[1]] };
    expect(getSixthSpaceFee(s, 0, 3)).toBe(0);
    expect(getSixthSpaceFee(s, 0, 4)).toBe(2);
    const s2 = addWaresToMarket(s, 0, ['trinkets', 'trinkets', 'trinkets']);
    expect(s2.players[0].market[5]).toBeNull();
    expect(s2.players[0].gold).toBe(s.players[0].gold);
  });

  it('the 6th space does not count as room when the player cannot pay for it', () => {
    let s = createTestState();
    s = withMarket(s, 0, ['hides', 'tea', 'silk', 'fruit', 'salt', null]);
    s = withGold(s, 0, 1);
    expect(getPlacementCapacity(s, 0)).toBe(0);
    s = withGold(s, 0, 2);
    expect(getPlacementCapacity(s, 0)).toBe(1);
  });
});

describe('small market stand cost is per game, not per player', () => {
  it('first stand anyone builds costs 6g; every later stand costs 3g for either player', () => {
    let s = toPlayPhase(createTestState());
    expect(getSmallStandCost(s)).toBe(6);
    s = withHand(s, 0, ['small_market_stand_1']);
    s = removeFromDeck(s, 'small_market_stand_1');
    s = withGold(s, 0, 20);
    s = act(s, { type: 'PLAY_CARD', cardId: 'small_market_stand_1' });
    expect(gold(s, 0)).toBe(14);
    // Opponent's first stand now costs only 3g
    expect(s.players[1].smallMarketStands).toBe(0);
    expect(getSmallStandCost(s)).toBe(3);
  });
});

describe('not enough room for wares from people/animal cards: take what fits, rest stays in supply', () => {
  it('placeWaresUpToCapacity returns the overflow', () => {
    let s = createTestState();
    s = withMarket(s, 0, ['hides', 'tea', 'silk', 'fruit', null, null]);
    s = withGold(s, 0, 0); // can't pay for the 6th space
    const r = placeWaresUpToCapacity(s, 0, ['salt', 'salt']);
    expect(r.placed).toEqual(['salt']);
    expect(r.leftover).toEqual(['salt']);
  });

  it('Traveling Merchant winner pays the bid and keeps only what fits', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['traveling_merchant_1']);
    s = removeFromDeck(s, 'traveling_merchant_1');
    s = withGold(s, 0, 20);
    s = withGold(s, 1, 20);
    s = withMarket(s, 1, ['hides', 'tea', 'silk', 'fruit', 'salt', null]); // opponent: 1 paid space only
    const before = totalWares(s);
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' });
    s2 = resolve(s2, { type: 'AUCTION_BID', amount: 2 }); // opponent outbids
    s2 = resolve(s2, { type: 'AUCTION_PASS' });            // active passes → opponent wins
    expect(s2.pendingResolution).toBeNull();
    expect(market(s2, 1).filter(w => w === 'trinkets')).toHaveLength(1);
    expect(gold(s2, 1)).toBe(20 - 2 - 2); // bid + 6th-space fee
    expect(totalWares(s2)).toBe(before);
  });

  it('Elephant: a pick with no room goes back to the supply (wares are never lost)', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['elephant_1']);
    s = removeFromDeck(s, 'elephant_1');
    s = withHand(s, 1, []);
    s = withMarket(s, 0, ['hides', null, null, null, null, null]);
    s = withMarket(s, 1, ['tea', 'tea', null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, hides: 5, tea: 4 } };
    const before = totalWares(s);
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'elephant_1' });
    let guard = 0;
    while (s2.pendingResolution?.type === 'DRAFT' && guard++ < 10) {
      s2 = resolve(s2, { type: 'SELECT_WARE', wareIndex: 0 });
    }
    expect(totalWares(s2)).toBe(before);
  });
});
