// ============================================================================
// Utility Card Resolver Tests
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
  withDiscard,
  hand,
  gold,
  market,
  utilities,
} from '../../helpers/testHelpers.ts';
import { getValidActions } from '../../../src/engine/validation/actionValidator.ts';

describe('Well (Pay 1g, draw 1)', () => {
  function setupWell() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'well_1', 'well');
    return s;
  }

  it('pay 1g and draw 1 card', () => {
    const s = setupWell();
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });

    expect(s2.pendingResolution).toBeNull();
    expect(gold(s2, 0)).toBe(20 - 1);
    expect(hand(s2, 0).length).toBe(1);
    expect(s2.actionsLeft).toBe(3); // 1 for draw + 1 for activate
    expect(utilities(s2, 0)[0].usedThisTurn).toBe(true);
  });

  it('cannot activate same utility twice per turn', () => {
    const s = setupWell();
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(() => act(s2, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow();
  });

  it('cannot activate with 0 gold', () => {
    let s = setupWell();
    s = withGold(s, 0, 0);
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow();
  });
});

describe('Drums (Return ware, draw 1)', () => {
  function setupDrums() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5 } };
    s = withUtility(s, 0, 'drums_1', 'drums');
    return s;
  }

  it('return own ware to supply, draw 1 card', () => {
    const s = setupDrums();
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution!.type).toBe('UTILITY_EFFECT');

    const s3 = resolve(s2, { type: 'RETURN_WARE', wareIndex: 0 });
    expect(s3.pendingResolution).toBeNull();
    expect(market(s3, 0)[0]).toBeNull();
    expect(s3.wareSupply.trinkets).toBe(5 + 1);
    expect(hand(s3, 0).length).toBe(1);
  });
});

describe('Throne (Steal ware → Give ware)', () => {
  function setupThrone() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', null, null, null, null, null]);
    s = withMarket(s, 1, ['silk', null, null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, silk: 5 } };
    s = withUtility(s, 0, 'throne_1', 'throne');
    return s;
  }

  it('steal opponent ware → give own ware (2-step)', () => {
    const s = setupThrone();
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution!.type).toBe('WARE_THEFT_SWAP');
    expect((s2.pendingResolution as any).step).toBe('STEAL');

    const s3 = resolve(s2, { type: 'SELECT_WARE', wareIndex: 0 });
    expect((s3.pendingResolution as any).step).toBe('GIVE');
    expect((s3.pendingResolution as any).stolenWare).toBe('silk');

    const trinketIdx = market(s3, 0).indexOf('trinkets');
    const s4 = resolve(s3, { type: 'SELECT_WARE', wareIndex: trinketIdx });
    expect(s4.pendingResolution).toBeNull();
    // Exchanged in place: each ware takes the other's slot
    expect(market(s4, 0)[trinketIdx]).toBe('silk');
    expect(market(s4, 1)[0]).toBe('trinkets');
    expect(gold(s4, 0)).toBe(20);
  });

  // Official text: "exchange a ware from your market stand with one on your
  // opponent's" — works with a full market, and costs no 6th-space fee.
  it('exchanges even when both markets are full, with no 6th-space fee', () => {
    let s = setupThrone();
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'tea', 'fruit', 'salt']);
    s = withMarket(s, 1, ['silk', 'silk', 'silk', 'salt', 'salt', 'salt']);
    let s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    s2 = resolve(s2, { type: 'SELECT_WARE', wareIndex: 1 });
    s2 = resolve(s2, { type: 'SELECT_WARE', wareIndex: 0 });
    expect(market(s2, 0)[0]).toBe('silk');
    expect(market(s2, 1)[1]).toBe('trinkets');
    expect(gold(s2, 0)).toBe(20);
  });

  it('cannot be activated with no wares of your own to give', () => {
    let s = setupThrone();
    s = withMarket(s, 0, [null, null, null, null, null, null]);
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no wares to exchange/);
  });
});

describe('Boat (Discard card → pick ware)', () => {
  function setupBoat() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'boat_1', 'boat');
    return s;
  }

  it('discard card → pick ware type', () => {
    const s = setupBoat();
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution!.type).toBe('UTILITY_EFFECT');

    const s3 = resolve(s2, { type: 'SELECT_CARD', cardId: 'ware_3k_1' });
    expect((s3.pendingResolution as any).step).toBe('SELECT_WARE_TYPE');
    expect(hand(s3, 0)).not.toContain('ware_3k_1');

    const s4 = resolve(s3, { type: 'SELECT_WARE_TYPE', wareType: 'fruit' });
    expect(s4.pendingResolution).toBeNull();
    expect(market(s4, 0).filter(w => w === 'fruit').length).toBe(1);
    expect(s4.wareSupply.fruit).toBe(5);
  });
});

describe('Scale (Draw 2, keep 1, give 1)', () => {
  function setupScale() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'scale_1', 'scale');
    return s;
  }

  it('auto-draw 2 → keep 1 (other to opponent)', () => {
    const s = setupScale();
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution!.type).toBe('UTILITY_EFFECT');

    // First resolve triggers the draw of 2 cards
    const s3 = resolve(s2, { type: 'SELECT_CARD', cardId: 'dummy' });
    const pending = s3.pendingResolution as any;
    if (pending && pending.selectedCards && pending.selectedCards.length === 2) {
      const [card1, card2] = pending.selectedCards;
      const s4 = resolve(s3, { type: 'SELECT_CARD', cardId: card1 });
      expect(s4.pendingResolution).toBeNull();
      expect(hand(s4, 0)).toContain(card1);
      expect(hand(s4, 1)).toContain(card2);
    }
  });
});

describe('Kettle (Discard 1-2, draw same count)', () => {
  function setupKettle() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1', 'ware_3h_1']);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'kettle_1', 'kettle');
    return s;
  }

  it('discard 1 card, draw 1', () => {
    const s = setupKettle();
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution!.type).toBe('UTILITY_EFFECT');

    const s3 = resolve(s2, { type: 'SELECT_CARDS', cardIds: ['ware_3k_1'] });
    expect(s3.pendingResolution).toBeNull();
    expect(hand(s3, 0)).not.toContain('ware_3k_1');
    expect(hand(s3, 0).length).toBe(2);
  });

  it('discard 2 cards, draw 2', () => {
    const s = setupKettle();
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });

    const s3 = resolve(s2, { type: 'SELECT_CARDS', cardIds: ['ware_3k_1', 'ware_3h_1'] });
    expect(s3.pendingResolution).toBeNull();
    expect(hand(s3, 0)).not.toContain('ware_3k_1');
    expect(hand(s3, 0)).not.toContain('ware_3h_1');
    expect(hand(s3, 0).length).toBe(2);
  });

  it('cannot discard 3 cards', () => {
    let s = setupKettle();
    s = withHand(s, 0, ['ware_3k_1', 'ware_3h_1', 'ware_3t_1']);
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(() => resolve(s2, { type: 'SELECT_CARDS', cardIds: ['ware_3k_1', 'ware_3h_1', 'ware_3t_1'] })).toThrow();
  });
});

describe('Leopard Statue (Pay 2g, pick ware)', () => {
  function setupLeopardStatue() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'leopard_statue_1', 'leopard_statue');
    return s;
  }

  it('pay 2g → pick ware type', () => {
    const s = setupLeopardStatue();
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution!.type).toBe('UTILITY_EFFECT');

    const s3 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'salt' });
    expect(s3.pendingResolution).toBeNull();
    expect(gold(s3, 0)).toBe(20 - 2);
    expect(market(s3, 0).filter(w => w === 'salt').length).toBe(1);
    expect(s3.wareSupply.salt).toBe(5);
  });

  it('cannot use without enough gold', () => {
    let s = setupLeopardStatue();
    s = withGold(s, 0, 1);
    // Validation now catches this before resolver runs
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/need at least 2g/);
  });
});

describe('Weapons (Discard card → +2g)', () => {
  function setupWeapons() {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'weapons_1', 'weapons');
    return s;
  }

  it('discard card → receive 2g', () => {
    const s = setupWeapons();
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution!.type).toBe('UTILITY_EFFECT');

    const s3 = resolve(s2, { type: 'SELECT_CARD', cardId: 'ware_3k_1' });
    expect(s3.pendingResolution).toBeNull();
    expect(gold(s3, 0)).toBe(20 + 2);
    expect(hand(s3, 0)).not.toContain('ware_3k_1');
    expect(s3.discardPile).toContain('ware_3k_1');
  });
});

describe('Utility activation basics', () => {
  it('cannot activate utility during DRAW phase', () => {
    let s = createTestState();
    s = withUtility(s, 0, 'well_1', 'well');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow();
  });

  it('cannot activate invalid utility index', () => {
    let s = toPlayPhase(createTestState());
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 99 })).toThrow();
  });
});

describe('Mask of Transformation phase restriction', () => {
  it('cannot activate Mask during PLAY phase', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = withUtility(s, 0, 'mask_of_transformation_1', 'mask_of_transformation');
    s = withDiscard(s, ['ware_3h_1']);
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(
      /Mask of Transformation can only be activated before drawing/
    );
  });

  it('Mask does not appear in getValidActions during PLAY phase', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = withUtility(s, 0, 'mask_of_transformation_1', 'mask_of_transformation');
    s = withDiscard(s, ['ware_3h_1']);

    const actions = getValidActions(s);
    const utilityActivations = actions.filter(a => a.type === 'ACTIVATE_UTILITY');
    expect(utilityActivations).toHaveLength(0);
  });

  it('Mask appears in getValidActions during DRAW phase (before drawing)', () => {
    let s = createTestState();
    s = withHand(s, 0, ['ware_3k_1']);
    s = withUtility(s, 0, 'mask_of_transformation_1', 'mask_of_transformation');
    s = withDiscard(s, ['ware_3h_1']);
    // State is in DRAW phase with no drawnCard — Mask should be available
    const actions = getValidActions(s);
    const utilityActivations = actions.filter(a => a.type === 'ACTIVATE_UTILITY');
    expect(utilityActivations).toHaveLength(1);
    expect(utilityActivations[0]).toEqual({ type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
  });

  it('Mask cannot be activated after a card has been drawn', () => {
    let s = createTestState();
    s = withHand(s, 0, ['ware_3k_1']);
    s = withUtility(s, 0, 'mask_of_transformation_1', 'mask_of_transformation');
    s = withDiscard(s, ['ware_3h_1']);
    // Draw a card first
    s = act(s, { type: 'DRAW_CARD' });
    expect(s.drawnCard).not.toBeNull();
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(
      /Cannot activate Mask of Transformation after drawing a card/
    );
  });

  it('other utilities still work during PLAY phase alongside Mask', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'mask_of_transformation_1', 'mask_of_transformation');
    s = withUtility(s, 0, 'well_1', 'well'); // index 1 on player 0's utilities
    s = withDiscard(s, ['ware_3h_1']);

    // Well (index 1) should work during PLAY, Mask (index 0) should not
    const actions = getValidActions(s);
    const utilityActivations = actions.filter(a => a.type === 'ACTIVATE_UTILITY');
    // Only well (index 1) should appear
    expect(utilityActivations).toHaveLength(1);
    expect(utilityActivations[0]).toEqual({ type: 'ACTIVATE_UTILITY', utilityIndex: 1 });
  });
});
