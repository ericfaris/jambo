// ============================================================================
// People Card Resolver Tests
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createTestState,
  toPlayPhase,
  act,
  resolve,
  withHand,
  withMarket,
  withGold,
  withDiscard,
  withSupply,
  withUtility,
  removeFromDeck,
  hand,
  gold,
  market,
} from '../../helpers/testHelpers.ts';
import { getCard } from '../../../src/engine/cards/CardDatabase.ts';
import { getValidActions } from '../../../src/engine/validation/actionValidator.ts';

describe('Shaman (Ware Trade)', () => {
  function setupShaman() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['shaman_1']);
    s = removeFromDeck(s, 'shaman_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'trinkets', null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 4, hides: 6 } };
    return s;
  }

  it('select give → select receive → market swap', () => {
    const s = setupShaman();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'shaman_1' });
    expect(s2.pendingResolution).not.toBeNull();
    expect(s2.pendingResolution!.type).toBe('WARE_TRADE');

    // Step 1: select give type
    const s3 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' });
    expect(s3.pendingResolution).not.toBeNull();
    expect((s3.pendingResolution as any).step).toBe('SELECT_RECEIVE');

    // Step 2: select receive type
    const s4 = resolve(s3, { type: 'SELECT_WARE_TYPE', wareType: 'hides' });
    expect(s4.pendingResolution).toBeNull();

    // Market should have 2 hides instead of 2 trinkets
    const mkt = market(s4, 0);
    expect(mkt.filter(w => w === 'hides').length).toBe(2);
    expect(mkt.filter(w => w === 'trinkets').length).toBe(0);

    // Supply updated
    expect(s4.wareSupply.trinkets).toBe(4 + 2);
    expect(s4.wareSupply.hides).toBe(6 - 2);
  });

  it('cannot trade for same ware type', () => {
    const s = setupShaman();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'shaman_1' });
    const s3 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' });
    expect(() => resolve(s3, { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' })).toThrow();
  });
});

describe('Psychic (Deck Peek)', () => {
  it('peek 6, pick 1, card goes to hand', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['psychic_1']);
    s = removeFromDeck(s, 'psychic_1');
    s = withGold(s, 0, 20);
    const deckBefore = [...s.deck];

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'psychic_1' });
    expect(s2.pendingResolution).not.toBeNull();
    expect(s2.pendingResolution!.type).toBe('DECK_PEEK');
    const peek = s2.pendingResolution as any;
    expect(peek.revealedCards.length).toBeLessThanOrEqual(6);

    // Pick card at index 0
    const pickedCard = peek.revealedCards[0];
    const s3 = resolve(s2, { type: 'DECK_PEEK_PICK', cardIndex: 0 });
    expect(s3.pendingResolution).toBeNull();
    expect(hand(s3, 0)).toContain(pickedCard);
    // Card removed from deck
    expect(s3.deck).not.toContain(pickedCard);
  });
});

describe('Tribal Elder (Binary Choice)', () => {
  function setupTribalElder() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['tribal_elder_1']);
    s = withHand(s, 1, ['ware_3k_1', 'ware_3h_1', 'ware_3t_1', 'ware_3l_1', 'ware_3f_1']);
    s = removeFromDeck(s, 'tribal_elder_1');
    s = removeFromDeck(s, 'ware_3k_1');
    s = removeFromDeck(s, 'ware_3h_1');
    s = removeFromDeck(s, 'ware_3t_1');
    s = removeFromDeck(s, 'ware_3l_1');
    s = removeFromDeck(s, 'ware_3f_1');
    s = withGold(s, 0, 20);
    return s;
  }

  it('presents binary choice before resolving', () => {
    const s = setupTribalElder();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'tribal_elder_1' });
    expect(s2.pendingResolution!.type).toBe('BINARY_CHOICE');
    const pr = s2.pendingResolution as any;
    expect(pr.options).toHaveLength(2);
  });

  it('choice 1: opponent discards to 3 cards', () => {
    const s = setupTribalElder();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'tribal_elder_1' });
    expect(s2.pendingResolution!.type).toBe('BINARY_CHOICE');

    // Choose option 1: opponent discards to 3
    const s3 = resolve(s2, { type: 'BINARY_CHOICE', choice: 1 });
    expect(s3.pendingResolution!.type).toBe('OPPONENT_DISCARD');
    expect((s3.pendingResolution as any).discardTo).toBe(3);

    // Opponent discards 2 cards (5 → 3)
    const s4 = resolve(s3, { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: [0, 1] });
    expect(s4.pendingResolution).toBeNull();
    expect(hand(s4, 1).length).toBe(3);
  });

  it('choice 1: opponent with 8 cards discards exactly 5 to reach 3', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['tribal_elder_1']);
    s = withHand(s, 1, [
      'ware_3k_1',
      'ware_3h_1',
      'ware_3t_1',
      'ware_3l_1',
      'ware_3f_1',
      'ware_3s_1',
      'guard_1',
      'guard_2',
    ]);
    s = withGold(s, 0, 20);

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'tribal_elder_1' });
    const s3 = resolve(s2, { type: 'BINARY_CHOICE', choice: 1 });

    expect(s3.pendingResolution!.type).toBe('OPPONENT_DISCARD');
    expect((s3.pendingResolution as any).discardTo).toBe(3);
    expect(hand(s3, 1).length).toBe(8);

    const s4 = resolve(s3, { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: [0, 1, 2, 3, 4] });
    expect(s4.pendingResolution).toBeNull();
    expect(hand(s4, 1).length).toBe(3);
  });

  it('choice 0: active player draws up to 5 cards', () => {
    let s = setupTribalElder();
    // Active player has only 1 card (tribal elder) which gets discarded on play → 0 cards
    // After draw-to-5, should have up to 5 cards
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'tribal_elder_1' });
    expect(s2.pendingResolution!.type).toBe('BINARY_CHOICE');

    const handBefore = hand(s2, 0).length; // 0 cards after playing tribal elder
    // Choose option 0: draw to 5
    const s3 = resolve(s2, { type: 'BINARY_CHOICE', choice: 0 });
    expect(s3.pendingResolution).toBeNull();
    // Should have drawn 5 cards (5 - 0 = 5)
    expect(hand(s3, 0).length).toBe(5);
  });

  it('draw-to-5 does nothing when hand already has 5', () => {
    let s = setupTribalElder();
    // Give active player 4 extra cards so after playing tribal elder they have 4
    s = withHand(s, 0, ['tribal_elder_1', 'ware_3s_1', 'ware_3s_2', 'guard_1', 'guard_2']);
    s = removeFromDeck(s, 'ware_3s_1');
    s = removeFromDeck(s, 'ware_3s_2');
    s = removeFromDeck(s, 'guard_1');
    s = removeFromDeck(s, 'guard_2');

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'tribal_elder_1' });
    // After playing, hand has 4 cards
    expect(hand(s2, 0).length).toBe(4);

    // Choose draw to 5 — should draw 1
    const s3 = resolve(s2, { type: 'BINARY_CHOICE', choice: 0 });
    expect(s3.pendingResolution).toBeNull();
    expect(hand(s3, 0).length).toBe(5);
  });
});

describe('Wise Man (Turn Modifier)', () => {
  it('auto-applies -2g buy / +2g sell modifier', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['wise_man_1']);
    s = removeFromDeck(s, 'wise_man_1');
    s = withGold(s, 0, 20);

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'wise_man_1' });
    // Auto-resolves — no pending resolution
    expect(s2.pendingResolution).toBeNull();
    expect(s2.turnModifiers.buyDiscount).toBe(2);
    expect(s2.turnModifiers.sellBonus).toBe(2);
  });

  it('wise man discount applies to ware buy', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['wise_man_1', 'ware_3k_1']);
    s = removeFromDeck(s, 'wise_man_1');
    s = removeFromDeck(s, 'ware_3k_1');
    s = withGold(s, 0, 20);

    // Play Wise Man first
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'wise_man_1' });
    const goldAfterWise = gold(s2, 0);

    // Now buy ware_3k (normally 3g, with -2g = 1g)
    s2 = act(s2, { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' });
    expect(gold(s2, 0)).toBe(goldAfterWise - 1);
  });
});

describe('Portuguese (Ware Sell Bulk)', () => {
  it('sell any wares at 2g each', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['portuguese_1']);
    s = removeFromDeck(s, 'portuguese_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5, tea: 5 } };

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'portuguese_1' });
    expect(s2.pendingResolution!.type).toBe('WARE_SELL_BULK');

    // Sell 2 wares at 2g each = +4g
    const s3 = resolve(s2, { type: 'SELL_WARES', wareIndices: [0, 1] });
    expect(s3.pendingResolution).toBeNull();
    expect(gold(s3, 0)).toBe(20 + 4);
    expect(market(s3, 0)[0]).toBeNull();
    expect(market(s3, 0)[1]).toBeNull();
    expect(market(s3, 0)[2]).toBe('tea'); // untouched
  });
});

describe('Basket Maker (Ware Select Multiple)', () => {
  it('pay 2g, pick type, receive 2', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['basket_maker_1']);
    s = removeFromDeck(s, 'basket_maker_1');
    s = withGold(s, 0, 20);

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'basket_maker_1' });
    expect(s2.pendingResolution!.type).toBe('WARE_SELECT_MULTIPLE');

    const s3 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'silk' });
    expect(s3.pendingResolution).toBeNull();
    // Basket maker cost (2g)
    expect(gold(s3, 0)).toBe(20 - 2);
    const silkCount = market(s3, 0).filter(w => w === 'silk').length;
    expect(silkCount).toBe(2);
    expect(s3.wareSupply.silk).toBe(6 - 2);
  });
});

describe('Traveling Merchant (Auction)', () => {
  function setupMerchant() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['traveling_merchant_1']);
    s = removeFromDeck(s, 'traveling_merchant_1');
    s = withGold(s, 0, 20);
    s = withGold(s, 1, 20);
    return s;
  }

  it('initializes auction with empty wares (player picks from supply)', () => {
    const s = setupMerchant();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' });
    expect(s2.pendingResolution!.type).toBe('AUCTION');
    expect((s2.pendingResolution as any).wares).toEqual([]);
  });

  it('select 2 wares from supply, then bid', () => {
    const s = setupMerchant();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' });

    // Pick first ware type from supply
    const s3 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'silk' });
    expect(s3.pendingResolution!.type).toBe('AUCTION');
    expect((s3.pendingResolution as any).wares).toEqual(['silk']);
    expect(s3.wareSupply.silk).toBe(6 - 1); // taken from supply

    // Pick second ware type from supply
    const s4 = resolve(s3, { type: 'SELECT_WARE_TYPE', wareType: 'tea' });
    expect(s4.pendingResolution!.type).toBe('AUCTION');
    const auction = s4.pendingResolution as any;
    expect(auction.wares).toEqual(['silk', 'tea']);
    expect(auction.currentBid).toBe(1); // bidding starts at 1g
    expect(auction.currentBidder).toBe(0); // placing player starts
    expect(s4.wareSupply.tea).toBe(6 - 1);
  });

  it('winner pays bid and receives wares', () => {
    const s = setupMerchant();
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' });
    // Select 2 wares
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'silk' });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'tea' });
    // Bidding: P0 starts at 1g (auto), P1 bids 2g
    s2 = resolve(s2, { type: 'AUCTION_BID', amount: 2 });
    // P0 passes — P1 wins at 2g
    s2 = resolve(s2, { type: 'AUCTION_PASS' });
    expect(s2.pendingResolution).toBeNull();
    expect(gold(s2, 1)).toBe(20 - 2); // P1 paid 2g
    expect(market(s2, 1).filter(w => w === 'silk').length).toBe(1);
    expect(market(s2, 1).filter(w => w === 'tea').length).toBe(1);
  });

  it('first pass ends auction — opponent wins at opening bid', () => {
    const s = setupMerchant();
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'fruit' });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'fruit' });
    expect(s2.wareSupply.fruit).toBe(6 - 2); // 2 taken from supply
    // Bidding: P0 holds opening bid of 1g, P1 is nextBidder
    // P1 passes → P0 wins at 1g
    s2 = resolve(s2, { type: 'AUCTION_PASS' });
    expect(s2.pendingResolution).toBeNull();
    expect(gold(s2, 0)).toBe(20 - 1); // P0 paid 1g
    expect(market(s2, 0).filter(w => w === 'fruit').length).toBe(2);
  });

  it('can pick 2 different ware types from supply', () => {
    const s = setupMerchant();
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'hides' });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'salt' });
    const auction = s2.pendingResolution as any;
    expect(auction.wares).toEqual(['hides', 'salt']);
    expect(s2.wareSupply.hides).toBe(6 - 1);
    expect(s2.wareSupply.salt).toBe(6 - 1);
  });
});

describe('Dancer (Ware Cash Conversion)', () => {
  it('select ware card → return 3 wares → get sell price', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['dancer_1', 'ware_3k_1']);
    s = removeFromDeck(s, 'dancer_1');
    s = removeFromDeck(s, 'ware_3k_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5, tea: 5 } };

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'dancer_1' });
    expect(s2.pendingResolution!.type).toBe('WARE_CASH_CONVERSION');

    // Step 1: select ware card from hand
    const s3 = resolve(s2, { type: 'SELECT_CARD', cardId: 'ware_3k_1' });
    expect((s3.pendingResolution as any).step).toBe('SELECT_WARES');

    // Step 2: return 3 wares (indices 0, 1, 2)
    const s4 = resolve(s3, { type: 'SELECT_WARES', wareIndices: [0, 1, 2] });
    expect(s4.pendingResolution).toBeNull();

    // Got sell price of ware_3k (10g)
    expect(gold(s4, 0)).toBe(20 + 10);
    // ware_3k_1 discarded
    expect(hand(s4, 0)).not.toContain('ware_3k_1');
    // 3 wares removed from market
    expect(market(s4, 0).filter(w => w !== null).length).toBe(0);
  });
});

describe('Carrier (Binary Choice)', () => {
  it('choice 0: active gets wares, opponent gets cards', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['carrier_1']);
    s = removeFromDeck(s, 'carrier_1');
    s = withGold(s, 0, 20);
    const opHandBefore = hand(s, 1).length;

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'carrier_1' });
    expect(s2.pendingResolution!.type).toBe('BINARY_CHOICE');

    // Choose option 0: active takes wares, opponent draws 2 cards
    const s3 = resolve(s2, { type: 'BINARY_CHOICE', choice: 0 });
    // Now chains to CARRIER_WARE_SELECT
    expect(s3.pendingResolution!.type).toBe('CARRIER_WARE_SELECT');
    // Opponent drew 2 cards
    expect(hand(s3, 1).length).toBe(opHandBefore + 2);

    // Active selects ware type
    const s4 = resolve(s3, { type: 'SELECT_WARE_TYPE', wareType: 'fruit' });
    expect(s4.pendingResolution).toBeNull();
    const fruitCount = market(s4, 0).filter(w => w === 'fruit').length;
    expect(fruitCount).toBe(2);
  });
});

describe('Drummer (Discard Pick)', () => {
  it('pick utility from discard pile', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['drummer_1']);
    s = withDiscard(s, ['well_1']);
    s = withGold(s, 0, 20);

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'drummer_1' });
    expect(s2.pendingResolution!.type).toBe('DISCARD_PICK');
    const eligible = (s2.pendingResolution as any).eligibleCards;
    expect(eligible).toContain('well_1');

    const s3 = resolve(s2, { type: 'DISCARD_PICK', cardId: 'well_1' });
    expect(s3.pendingResolution).toBeNull();
    expect(hand(s3, 0)).toContain('well_1');
    expect(s3.discardPile).not.toContain('well_1');
  });
});

describe('Supplies (Binary Choice → draw-until-ware)', () => {
  it('pay 1g option draws until ware found', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'supplies_1', 'supplies');

    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution!.type).toBe('BINARY_CHOICE');

    // Choose option 0: pay 1g
    const s3 = resolve(s2, { type: 'BINARY_CHOICE', choice: 0 });
    expect(s3.pendingResolution).toBeNull();
    // Should have drawn until a ware card was found (or deck exhausted)
    // Gold decreased by 1
    expect(gold(s3, 0)).toBe(20 - 1);
  });
});

describe('Traveling Merchant market space restriction', () => {
  it('cannot play Traveling Merchant with fewer than 2 empty market slots', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['traveling_merchant_1']);
    s = removeFromDeck(s, 'traveling_merchant_1');
    s = withGold(s, 0, 20);
    // Fill market completely — no empty slots
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' })).toThrow(
      /need at least 2 empty market slots/
    );
  });

  it('cannot play Traveling Merchant with only 1 empty market slot', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['traveling_merchant_1']);
    s = removeFromDeck(s, 'traveling_merchant_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', null]);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' })).toThrow(
      /need at least 2 empty market slots/
    );
  });

  it('allowed with 2+ empty market slots', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['traveling_merchant_1']);
    s = removeFromDeck(s, 'traveling_merchant_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', null, null]);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' });
    expect(s2.pendingResolution!.type).toBe('AUCTION');
  });

  it('does not appear in getValidActions with full market', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['traveling_merchant_1']);
    s = removeFromDeck(s, 'traveling_merchant_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    const actions = getValidActions(s);
    const playActions = actions.filter(a => a.type === 'PLAY_CARD' && a.cardId === 'traveling_merchant_1');
    expect(playActions).toHaveLength(0);
  });
});

describe('Arabian Merchant (card auction)', () => {
  function setupArabian() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['arabian_merchant_1']);
    s = removeFromDeck(s, 'arabian_merchant_1');
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    s = withGold(s, 1, 20);
    return s;
  }

  it('reveals the top 3 deck cards and opens bidding with the active player', () => {
    const s = setupArabian();
    const top3 = s.deck.slice(0, 3);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'arabian_merchant_1' });
    const pr = s2.pendingResolution;
    expect(pr?.type).toBe('AUCTION');
    if (pr?.type !== 'AUCTION') return;
    expect(pr.revealedCards).toEqual(top3);
    expect(pr.wares).toEqual([]);
    expect(pr.currentBid).toBe(0);
    expect(pr.nextBidder).toBe(0);
  });

  it('works even with a full market (cards, not wares)', () => {
    let s = setupArabian();
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'arabian_merchant_1' });
    expect(s2.pendingResolution?.type).toBe('AUCTION');
  });

  it('highest bidder pays and takes all 3 cards into hand', () => {
    const s = setupArabian();
    const top3 = s.deck.slice(0, 3);
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'arabian_merchant_1' });
    s2 = resolve(s2, { type: 'AUCTION_BID', amount: 1 }); // P0 bids 1
    s2 = resolve(s2, { type: 'AUCTION_BID', amount: 2 }); // P1 raises to 2
    s2 = resolve(s2, { type: 'AUCTION_PASS' });           // P0 passes → P1 wins
    expect(s2.pendingResolution).toBeNull();
    expect(gold(s2, 1)).toBe(18);
    expect(gold(s2, 0)).toBe(20);
    expect(hand(s2, 1)).toEqual(top3);
    for (const c of top3) expect(s2.deck).not.toContain(c);
    expect(s2.discardPile).toContain('arabian_merchant_1');
  });

  it('no bids → the revealed cards are discarded', () => {
    const s = setupArabian();
    const top3 = s.deck.slice(0, 3);
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'arabian_merchant_1' });
    s2 = resolve(s2, { type: 'AUCTION_PASS' });
    expect(s2.pendingResolution).toBeNull();
    for (const c of top3) {
      expect(s2.discardPile).toContain(c);
      expect(s2.deck).not.toContain(c);
    }
    expect(gold(s2, 0)).toBe(20);
  });

  it('cannot bid more gold than you have', () => {
    let s = setupArabian();
    s = withGold(s, 0, 1);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'arabian_merchant_1' });
    expect(() => resolve(s2, { type: 'AUCTION_BID', amount: 2 })).toThrow(/cannot afford/);
  });

  it('cannot be played with an empty deck', () => {
    let s = setupArabian();
    s = { ...s, discardPile: [...s.deck, ...s.discardPile], deck: [] };
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'arabian_merchant_1' })).toThrow(/draw deck is empty/);
  });
});
