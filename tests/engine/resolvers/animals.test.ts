// ============================================================================
// Animal Card Resolver Tests
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
  withUtility,
  removeFromDeck,
  hand,
  gold,
  market,
  utilities,
} from '../../helpers/testHelpers.ts';

describe('Parrot (Steal 1 ware)', () => {
  function setupParrot() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['parrot_1']);
    s = withHand(s, 1, []); // no guard
    s = removeFromDeck(s, 'parrot_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 1, ['silk', 'tea', null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, silk: 5, tea: 5 } };
    return s;
  }

  it('steals 1 ware from opponent market', () => {
    const s = setupParrot();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'parrot_1' });
    expect(s2.pendingResolution!.type).toBe('WARE_THEFT_SINGLE');

    // Steal silk at index 0
    const s3 = resolve(s2, { type: 'SELECT_WARE', wareIndex: 0 });
    expect(s3.pendingResolution).toBeNull();
    // Opponent lost silk
    expect(market(s3, 1)[0]).toBeNull();
    // Active player gained silk
    expect(market(s3, 0).filter(w => w === 'silk').length).toBe(1);
  });

  it('throws on empty slot selection', () => {
    const s = setupParrot();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'parrot_1' });
    expect(() => resolve(s2, { type: 'SELECT_WARE', wareIndex: 5 })).toThrow();
  });
});

describe('Hyena (Take 1, Give 1)', () => {
  function setupHyena() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['hyena_1', 'ware_3k_1']);
    s = withHand(s, 1, ['ware_3h_1', 'ware_3t_1']); // no guard
    s = removeFromDeck(s, 'hyena_1');
    s = removeFromDeck(s, 'ware_3k_1');
    s = removeFromDeck(s, 'ware_3h_1');
    s = removeFromDeck(s, 'ware_3t_1');
    s = withGold(s, 0, 20);
    return s;
  }

  it('take 1 card from opponent → give 1 back', () => {
    const s = setupHyena();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'hyena_1' });
    expect(s2.pendingResolution!.type).toBe('HAND_SWAP');
    expect((s2.pendingResolution as any).step).toBe('TAKE');

    // Take ware_3h_1 from opponent
    const s3 = resolve(s2, { type: 'SELECT_CARD', cardId: 'ware_3h_1' });
    expect((s3.pendingResolution as any).step).toBe('GIVE');
    expect(hand(s3, 0)).toContain('ware_3h_1');
    expect(hand(s3, 1)).not.toContain('ware_3h_1');

    // Give ware_3k_1 to opponent
    const s4 = resolve(s3, { type: 'SELECT_CARD', cardId: 'ware_3k_1' });
    expect(s4.pendingResolution).toBeNull();
    expect(hand(s4, 0)).not.toContain('ware_3k_1');
    expect(hand(s4, 1)).toContain('ware_3k_1');
  });

  it('cannot give back the card that was just taken', () => {
    const s = setupHyena();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'hyena_1' });
    const s3 = resolve(s2, { type: 'SELECT_CARD', cardId: 'ware_3h_1' });

    expect(() => resolve(s3, { type: 'SELECT_CARD', cardId: 'ware_3h_1' })).toThrow(
      /Cannot give back the card taken with Hyena/
    );
  });
});

describe('Cheetah (Opponent Choice)', () => {
  function setupCheetah() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['cheetah_1']);
    s = withHand(s, 1, []); // no guard
    s = removeFromDeck(s, 'cheetah_1');
    s = withGold(s, 0, 20);
    s = withGold(s, 1, 20);
    return s;
  }

  it('opponent gives 2g when choice=0', () => {
    const s = setupCheetah();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'cheetah_1' });
    expect(s2.pendingResolution!.type).toBe('OPPONENT_CHOICE');

    const s3 = resolve(s2, { type: 'OPPONENT_CHOICE', choice: 0 });
    expect(s3.pendingResolution).toBeNull();
    expect(gold(s3, 1)).toBe(18); // opponent lost 2g
    expect(gold(s3, 0)).toBe(20 + 2); // gained 2g
  });

  it('active draws 2 cards when choice=1', () => {
    const s = setupCheetah();
    const handBefore = hand(s, 0).length; // 1 (cheetah)
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'cheetah_1' });
    // After playing cheetah, hand is empty (0 cards)
    const s3 = resolve(s2, { type: 'OPPONENT_CHOICE', choice: 1 });
    expect(s3.pendingResolution).toBeNull();
    // Active player drew 2 cards (from empty hand after playing cheetah)
    expect(hand(s3, 0).length).toBe(2);
  });
});

describe('Snake (Utility Keep)', () => {
  function setupSnake() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['snake_1']);
    s = withHand(s, 1, []); // no guard
    s = withGold(s, 0, 20);
    // Both have utilities
    s = withUtility(s, 0, 'well_1', 'well');
    s = withUtility(s, 0, 'drums_1', 'drums');
    s = withUtility(s, 1, 'throne_1', 'throne');
    s = withUtility(s, 1, 'boat_1', 'boat');
    return s;
  }

  it('both keep 1 utility, discard rest', () => {
    const s = setupSnake();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'snake_1' });
    expect(s2.pendingResolution!.type).toBe('UTILITY_KEEP');
    expect((s2.pendingResolution as any).step).toBe('ACTIVE_CHOOSE');

    // Active player keeps utility at index 0 (well_1)
    const s3 = resolve(s2, { type: 'SELECT_UTILITY', utilityIndex: 0 });
    expect((s3.pendingResolution as any).step).toBe('OPPONENT_CHOOSE');
    expect(utilities(s3, 0).length).toBe(1);
    expect(utilities(s3, 0)[0].cardId).toBe('well_1');

    // Opponent keeps utility at index 0 (throne_1)
    const s4 = resolve(s3, { type: 'SELECT_UTILITY', utilityIndex: 0 });
    expect(s4.pendingResolution).toBeNull();
    expect(utilities(s4, 1).length).toBe(1);
    expect(utilities(s4, 1)[0].cardId).toBe('throne_1');

    // Discarded utilities went to discard pile
    expect(s4.discardPile).toContain('drums_1');
    expect(s4.discardPile).toContain('boat_1');
  });
});

describe('Elephant (Ware Draft)', () => {
  function setupElephant() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['elephant_1']);
    s = withHand(s, 1, []); // no guard
    s = removeFromDeck(s, 'elephant_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', null, null, null, null]);
    s = withMarket(s, 1, ['tea', 'silk', null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5, tea: 5, silk: 5 } };
    return s;
  }

  it('pool wares from both markets, alternating picks', () => {
    const s = setupElephant();
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'elephant_1' });
    expect(s2.pendingResolution!.type).toBe('DRAFT');
    expect((s2.pendingResolution as any).draftMode).toBe('wares');

    // Pools populated upfront: [trinkets, hides, tea, silk] = 4 wares
    const draft2 = s2.pendingResolution as any;
    expect(draft2.availableWares.length).toBe(4);
    expect(draft2.currentPicker).toBe(0); // P0 picks first

    // P0 picks first ware
    const s3 = resolve(s2, { type: 'SELECT_WARE', wareIndex: 0 });
    const draft3 = s3.pendingResolution as any;
    expect(draft3.availableWares.length).toBe(3);
    expect(draft3.currentPicker).toBe(1); // P1's turn

    // P1 picks
    const s4 = resolve(s3, { type: 'SELECT_WARE', wareIndex: 0 });
    const draft4 = s4.pendingResolution as any;
    expect(draft4.availableWares.length).toBe(2);

    // P0 picks
    const s5 = resolve(s4, { type: 'SELECT_WARE', wareIndex: 0 });
    const draft5 = s5.pendingResolution as any;
    expect(draft5.availableWares.length).toBe(1);

    // P1 picks last
    const s6 = resolve(s5, { type: 'SELECT_WARE', wareIndex: 0 });
    expect(s6.pendingResolution).toBeNull();
  });
});

describe('Ape (Card Draft)', () => {
  it('pool both hands, alternating card picks', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ape_1', 'ware_3k_1']);
    s = withHand(s, 1, ['ware_3h_1', 'ware_3t_1']);
    s = withGold(s, 0, 20);

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'ape_1' });
    expect(s2.pendingResolution!.type).toBe('DRAFT');
    expect((s2.pendingResolution as any).draftMode).toBe('cards');

    // Pool populated upfront: [ware_3k_1, ware_3h_1, ware_3t_1] (ape_1 played from hand)
    const draft2 = s2.pendingResolution as any;
    expect(draft2.availableCards.length).toBe(3);
    expect(draft2.currentPicker).toBe(0); // P0 picks first

    // P0 picks ware_3k_1
    const s3 = resolve(s2, { type: 'SELECT_CARD', cardId: 'ware_3k_1' });
    const draft3 = s3.pendingResolution as any;
    expect(draft3.availableCards.length).toBe(2);
    expect(draft3.currentPicker).toBe(1); // P1's turn

    // P1 picks
    const s4 = resolve(s3, { type: 'SELECT_CARD', cardId: draft3.availableCards[0] });
    const draft4 = s4.pendingResolution as any;
    expect(draft4.availableCards.length).toBe(1);

    // P0 picks last
    const s5 = resolve(s4, { type: 'SELECT_CARD', cardId: draft4.availableCards[0] });
    expect(s5.pendingResolution).toBeNull();
  });
});

describe('Ape draft alternates picker correctly when P1 plays', () => {
  it('currentPicker alternates between both players', () => {
    // Simulate P1 (AI) playing Ape — P0 (human) must still get picks
    let s = toPlayPhase(createTestState());
    // End P0's turn, advance to P1's turn
    s = act(s, { type: 'END_TURN' });
    s = act(s, { type: 'DRAW_CARD' });
    s = act(s, { type: 'KEEP_CARD' });
    // Now it's P1's PLAY phase
    expect(s.currentPlayer).toBe(1);
    s = withHand(s, 1, ['ape_1', 'ware_3k_1']);
    s = withHand(s, 0, ['ware_3h_1', 'ware_3t_1']);
    s = withGold(s, 1, 20);

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'ape_1' });
    const draft2 = s2.pendingResolution as any;
    expect(draft2.type).toBe('DRAFT');
    expect(draft2.draftMode).toBe('cards');
    // P1 played it, so P1 picks first
    expect(draft2.currentPicker).toBe(1);
    expect(draft2.availableCards.length).toBe(3);

    // P1 picks
    const s3 = resolve(s2, { type: 'SELECT_CARD', cardId: 'ware_3k_1' });
    const draft3 = s3.pendingResolution as any;
    // Now it's P0's turn to pick (human gets a turn)
    expect(draft3.currentPicker).toBe(0);
    expect(draft3.availableCards.length).toBe(2);

    // P0 picks
    const s4 = resolve(s3, { type: 'SELECT_CARD', cardId: draft3.availableCards[0] });
    const draft4 = s4.pendingResolution as any;
    // Back to P1
    expect(draft4.currentPicker).toBe(1);
    expect(draft4.availableCards.length).toBe(1);

    // P1 picks last
    const s5 = resolve(s4, { type: 'SELECT_CARD', cardId: draft4.availableCards[0] });
    expect(s5.pendingResolution).toBeNull();
  });
});

describe('Lion (Utility Draft)', () => {
  it('pool both utilities, alternating picks (max 3)', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['lion_1']);
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'well_1', 'well');
    s = withUtility(s, 1, 'drums_1', 'drums');

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'lion_1' });
    expect(s2.pendingResolution!.type).toBe('DRAFT');
    expect((s2.pendingResolution as any).draftMode).toBe('utilities');

    // Pool populated upfront: [well_1, drums_1]
    const draft2 = s2.pendingResolution as any;
    expect(draft2.availableCards.length).toBe(2);
    expect(draft2.currentPicker).toBe(0); // P0 picks first

    // P0 picks well_1
    const s3 = resolve(s2, { type: 'SELECT_CARD', cardId: 'well_1' });
    const draft3 = s3.pendingResolution as any;
    expect(draft3.availableCards.length).toBe(1);
    expect(draft3.currentPicker).toBe(1); // P1's turn

    // P1 picks drums_1
    const s4 = resolve(s3, { type: 'SELECT_CARD', cardId: 'drums_1' });
    expect(s4.pendingResolution).toBeNull();
    expect(utilities(s4, 0).length).toBe(1);
    expect(utilities(s4, 1).length).toBe(1);
  });
});

describe('Crocodile (Use opponent utility)', () => {
  it('select opponent utility → use it → cleanup discards it', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['crocodile_1']);
    s = withHand(s, 1, []); // no guard
    s = withGold(s, 0, 20);
    s = withUtility(s, 1, 'well_1', 'well');

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'crocodile_1' });
    expect(s2.pendingResolution!.type).toBe('CROCODILE_USE');

    // Select opponent's Well utility (index 0)
    const s3 = resolve(s2, { type: 'SELECT_UTILITY', utilityIndex: 0 });
    // Well auto-resolves (draw a card), crocodileCleanup set
    // handleResolveInteraction performs cleanup when pendingResolution is null
    expect(s3.pendingResolution).toBeNull();
    // Well drawn a card (P0 got a card)
    // Opponent's utility discarded
    expect(utilities(s3, 1).length).toBe(0);
    expect(s3.discardPile).toContain('well_1');
    expect(s3.discardPile).toContain('crocodile_1');
  });

  // Regression: an interactive borrowed utility replaces pendingResolution with
  // its own UTILITY_EFFECT, so the Crocodile card itself used to be dropped from
  // the game (110 → 109 cards) instead of being discarded.
  it('discards the Crocodile itself after an interactive borrowed utility (Drums)', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['crocodile_1']);
    s = withHand(s, 1, []); // no guard
    s = withMarket(s, 0, ['silk', null, null, null, null, null]);
    s = withUtility(s, 1, 'drums_1', 'drums');

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'crocodile_1' });
    // act() asserts the 110-card invariant on every step, including mid-effect
    const s3 = resolve(s2, { type: 'SELECT_UTILITY', utilityIndex: 0 });
    expect(s3.pendingResolution!.type).toBe('UTILITY_EFFECT');

    const s4 = resolve(s3, { type: 'RETURN_WARE', wareIndex: 0 });
    expect(s4.pendingResolution).toBeNull();
    expect(utilities(s4, 1).length).toBe(0);
    expect(s4.discardPile).toContain('drums_1');
    expect(s4.discardPile).toContain('crocodile_1');
    expect(hand(s4, 0)).not.toContain('crocodile_1');
  });
});
