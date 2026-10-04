// ============================================================================
// Stall Prevention Tests — Validation blocks cards/utilities with unmet preconditions
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
  removeFromDeck,
  hand,
  gold,
  market,
  utilities,
} from '../../helpers/testHelpers.ts';
import { validateAction } from '../../../src/engine/validation/actionValidator.ts';
import { getValidActions } from '../../../src/engine/validation/actionValidator.ts';

// ============================================================================
// Animal card preconditions
// ============================================================================

describe('Crocodile: requires opponent utilities', () => {
  it('blocks when opponent has no utilities', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['crocodile_1']);
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    // Opponent has no utilities
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'crocodile_1' })).toThrow(/opponent has no utilities/);
  });

  it('allowed when opponent has at least 1 utility', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['crocodile_1']);
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    s = withUtility(s, 1, 'well_1', 'well');
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'crocodile_1' });
    expect(s2.pendingResolution!.type).toBe('CROCODILE_USE');
  });
});

describe('Parrot: requires opponent wares', () => {
  it('blocks when opponent market is empty', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['parrot_1']);
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 1, [null, null, null, null, null, null]);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'parrot_1' })).toThrow(/opponent has no wares/);
  });
});

describe('Elephant: requires at least 1 ware total', () => {
  it('blocks when both markets are empty', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['elephant_1']);
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, [null, null, null, null, null, null]);
    s = withMarket(s, 1, [null, null, null, null, null, null]);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'elephant_1' })).toThrow(/no wares on either market/);
  });

  it('allowed when only one side has wares', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['elephant_1']);
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', null, null, null, null, null]);
    s = withMarket(s, 1, [null, null, null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5 } };
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'elephant_1' });
    expect(s2.pendingResolution!.type).toBe('DRAFT');
  });
});

describe('Ape: requires at least 1 other card in either hand', () => {
  it('blocks when ape is the only card in both hands', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ape_1']);
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'ape_1' })).toThrow(/no other cards in either hand/);
  });

  it('allowed when opponent has cards', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ape_1']);
    s = withHand(s, 1, ['ware_3k_1']);
    s = withGold(s, 0, 20);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'ape_1' });
    expect(s2.pendingResolution!.type).toBe('DRAFT');
  });
});

describe('Lion: requires at least 1 utility total', () => {
  it('blocks when neither player has utilities', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['lion_1']);
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'lion_1' })).toThrow(/no utilities on either side/);
  });
});

describe('Snake: requires at least 1 utility total', () => {
  it('blocks when neither player has utilities', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['snake_1']);
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'snake_1' })).toThrow(/no utilities on either side/);
  });
});

// ============================================================================
// People card preconditions
// ============================================================================

describe('Hyena: requires opponent hand cards', () => {
  it('blocks when opponent hand is empty', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['hyena_1']);
    s = withHand(s, 1, []);
    s = removeFromDeck(s, 'hyena_1');
    s = withGold(s, 0, 20);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'hyena_1' })).toThrow(/opponent has no cards in hand/);
  });

  it('allowed when opponent has cards', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['hyena_1', 'ware_3k_1']);
    s = withHand(s, 1, ['ware_3h_1']);
    s = removeFromDeck(s, 'hyena_1');
    s = removeFromDeck(s, 'ware_3k_1');
    s = removeFromDeck(s, 'ware_3h_1');
    s = withGold(s, 0, 20);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'hyena_1' });
    expect(s2.pendingResolution!.type).toBe('HAND_SWAP');
  });
});

describe('Shaman: requires wares in market', () => {
  it('blocks when market is empty', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['shaman_1']);
    s = removeFromDeck(s, 'shaman_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, [null, null, null, null, null, null]);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'shaman_1' })).toThrow(/no wares in market/);
  });
});

describe('Portuguese: requires wares in market', () => {
  it('blocks when market is empty', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['portuguese_1']);
    s = removeFromDeck(s, 'portuguese_1');
    s = withMarket(s, 0, [null, null, null, null, null, null]);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'portuguese_1' })).toThrow(/no wares in market/);
  });

  it('allowed when market has wares', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['portuguese_1']);
    s = removeFromDeck(s, 'portuguese_1');
    s = withMarket(s, 0, ['silk', null, null, null, null, null]);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'portuguese_1' });
    expect(s2.pendingResolution?.type).toBe('WARE_SELL_BULK');
  });
});

describe('Traveling Merchant: wares come from supply', () => {
  it('can be played even with empty market (wares come from supply)', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['traveling_merchant_1']);
    s = removeFromDeck(s, 'traveling_merchant_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, [null, null, null, null, null, null]);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' });
    expect(s2.pendingResolution!.type).toBe('AUCTION');
    expect((s2.pendingResolution as any).wares.length).toBe(0); // wares not yet selected
  });
});

describe('Basket Maker: requires 2g and 2 empty market slots', () => {
  it('blocks with insufficient gold', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['basket_maker_1']);
    s = removeFromDeck(s, 'basket_maker_1');
    s = withGold(s, 0, 1);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'basket_maker_1' })).toThrow(/need at least 2g/);
  });

  // Official rule: with too little room for wares from a people card, the
  // player takes what fits and leaves the rest in the supply.
  it('with room for only 1 ware: takes 1 (paying the 6th-space fee), leaves 1 in supply', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['basket_maker_1']);
    s = removeFromDeck(s, 'basket_maker_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5, tea: 5, silk: 5, fruit: 5, salt: 6 } };
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'basket_maker_1' });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'salt' });
    expect(s2.players[0].market.filter(w => w === 'salt')).toHaveLength(1);
    expect(s2.wareSupply.salt).toBe(5);
    expect(s2.players[0].gold).toBe(20 - 2 - 2);
  });

  it('blocks with no room at all', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['basket_maker_1']);
    s = removeFromDeck(s, 'basket_maker_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'basket_maker_1' })).toThrow(/no room on your market stands/);
  });

  it('allowed when 2g and 2+ empty slots', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['basket_maker_1']);
    s = removeFromDeck(s, 'basket_maker_1');
    s = withGold(s, 0, 20);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'basket_maker_1' });
    expect(s2.pendingResolution!.type).toBe('WARE_SELECT_MULTIPLE');
  });

  it('auto-resolves if supply depletes before response', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['basket_maker_1']);
    s = removeFromDeck(s, 'basket_maker_1');
    s = withGold(s, 0, 20);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 2, hides: 2, tea: 2, silk: 2, fruit: 2, salt: 2 } };

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'basket_maker_1' });
    expect(s2.pendingResolution?.type).toBe('WARE_SELECT_MULTIPLE');

    const s3 = { ...s2, wareSupply: { trinkets: 0, hides: 0, tea: 0, silk: 0, fruit: 0, salt: 0 } };
    const s4 = resolve(s3, { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' });
    expect(s4.pendingResolution).toBeNull();
  });
});

describe('Dancer: requires ware card in hand and >= 3 wares in market', () => {
  it('blocks when no ware cards in hand', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['dancer_1']);
    s = removeFromDeck(s, 'dancer_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5, tea: 5 } };
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'dancer_1' })).toThrow(/no ware cards in hand/);
  });

  it('blocks when fewer than 3 wares in market', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['dancer_1', 'ware_3k_1']);
    s = removeFromDeck(s, 'dancer_1');
    s = removeFromDeck(s, 'ware_3k_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5 } };
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'dancer_1' })).toThrow(/need at least 3 wares/);
  });
});

describe('Drummer: requires utility in discard pile', () => {
  it('blocks when discard has no utility cards', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['drummer_1']);
    s = withGold(s, 0, 20);
    // Discard pile has no utility cards (only ware/people/etc from removeFromDeck)
    // Clear discard pile
    s = { ...s, discardPile: [] };
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'drummer_1' })).toThrow(/no utility cards in discard pile/);
  });
});

// ============================================================================
// Utility activation preconditions
// ============================================================================

describe('Drums: requires wares in market', () => {
  it('blocks with empty market', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, [null, null, null, null, null, null]);
    s = withUtility(s, 0, 'drums_1', 'drums');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no wares in market/);
  });

  it('allowed when market has wares', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', null, null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5 } };
    s = withUtility(s, 0, 'drums_1', 'drums');
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution!.type).toBe('UTILITY_EFFECT');
  });
});

describe('Boat: requires cards in hand and empty market slot', () => {
  it('blocks with empty hand', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'boat_1', 'boat');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no cards in hand/);
  });

  it('blocks with full market', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5, tea: 5, silk: 5, fruit: 5, salt: 5 } };
    s = withUtility(s, 0, 'boat_1', 'boat');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no room on your market stands/);
  });
});

describe('Weapons: requires cards in hand', () => {
  it('blocks with empty hand', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'weapons_1', 'weapons');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no cards in hand/);
  });
});

describe('Kettle: requires cards in hand', () => {
  it('blocks with empty hand', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'kettle_1', 'kettle');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no cards in hand/);
  });
});

describe('Throne: requires opponent wares', () => {
  it('blocks when opponent market is empty', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 1, [null, null, null, null, null, null]);
    s = withUtility(s, 0, 'throne_1', 'throne');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/opponent has no wares/);
  });
});

describe('Leopard Statue: requires 2g and empty market slot', () => {
  it('blocks with insufficient gold', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 1);
    s = withUtility(s, 0, 'leopard_statue_1', 'leopard_statue');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/need at least 2g/);
  });

  it('blocks with full market', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5, tea: 5, silk: 5, fruit: 5, salt: 5 } };
    s = withUtility(s, 0, 'leopard_statue_1', 'leopard_statue');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no room on your market stands/);
  });

  it('blocks when ware supply is empty', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', null, null, null, null, null]);
    s = { ...s, wareSupply: { trinkets: 0, hides: 0, tea: 0, silk: 0, fruit: 0, salt: 0 } };
    s = withUtility(s, 0, 'leopard_statue_1', 'leopard_statue');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no wares available in supply/);
  });
});

describe('Mask of Transformation: requires hand cards and discard pile', () => {
  // Mask can only be activated during DRAW phase (before drawing), so tests use DRAW phase state

  it('blocks with empty hand', () => {
    let s = createTestState(); // DRAW phase
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withDiscard(s, ['ware_3k_1']);
    s = withUtility(s, 0, 'mask_of_transformation_1', 'mask_of_transformation');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no cards in hand/);
  });

  it('blocks with empty discard pile', () => {
    let s = createTestState(); // DRAW phase
    s = withHand(s, 0, ['ware_3k_1']);
    s = withGold(s, 0, 20);
    s = { ...s, discardPile: [] };
    s = withUtility(s, 0, 'mask_of_transformation_1', 'mask_of_transformation');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/discard pile is empty/);
  });

  it('auto-resolves if hand becomes empty before response', () => {
    let s = createTestState(); // DRAW phase
    s = withHand(s, 0, ['ware_3k_1']);
    s = withGold(s, 0, 20);
    s = withDiscard(s, ['ware_3h_1']);
    s = withUtility(s, 0, 'mask_of_transformation_1', 'mask_of_transformation');

    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution?.type).toBe('DRAW_MODIFIER');

    const s3 = withHand(s2, 0, []);
    const s4 = resolve(s3, { type: 'SELECT_CARD', cardId: 'ware_3k_1' });
    expect(s4.pendingResolution).toBeNull();
  });

  it('auto-resolves stale card selection instead of throwing', () => {
    let s = createTestState(); // DRAW phase
    s = withHand(s, 0, ['ware_3k_1']);
    s = withGold(s, 0, 20);
    s = withDiscard(s, ['ware_3h_1']);
    s = withUtility(s, 0, 'mask_of_transformation_1', 'mask_of_transformation');

    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution?.type).toBe('DRAW_MODIFIER');

    const s3 = resolve(s2, { type: 'SELECT_CARD', cardId: 'ware_3t_1' });
    expect(s3.pendingResolution).toBeNull();
  });
});

// ============================================================================
// getValidActions filters out blocked cards/utilities
// ============================================================================

describe('getValidActions respects preconditions', () => {
  it('excludes cards that fail preconditions', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['crocodile_1', 'parrot_1', 'ware_3k_1']);
    s = withHand(s, 1, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, [null, null, null, null, null, null]);
    s = withMarket(s, 1, [null, null, null, null, null, null]);
    // Opponent has no utilities (blocks crocodile) and no wares (blocks parrot)

    const actions = getValidActions(s);
    const playActions = actions.filter(a => a.type === 'PLAY_CARD');
    const playedCardIds = playActions.map(a => (a as any).cardId);
    expect(playedCardIds).not.toContain('crocodile_1');
    expect(playedCardIds).not.toContain('parrot_1');
    // ware_3k_1 should still be playable (buy mode)
    expect(playedCardIds).toContain('ware_3k_1');
  });

  it('excludes utilities that fail preconditions', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []); // empty hand blocks Boat, Weapons, Kettle
    s = withGold(s, 0, 20);
    s = withUtility(s, 0, 'boat_1', 'boat');
    s = withUtility(s, 0, 'weapons_1', 'weapons');
    s = withUtility(s, 0, 'well_1', 'well'); // Well should still work

    const actions = getValidActions(s);
    const utilActions = actions.filter(a => a.type === 'ACTIVATE_UTILITY');
    const utilIndices = utilActions.map(a => (a as any).utilityIndex);
    // boat is index 0, weapons is index 1, well is index 2
    expect(utilIndices).not.toContain(0); // boat blocked
    expect(utilIndices).not.toContain(1); // weapons blocked
    expect(utilIndices).toContain(2);     // well allowed
  });
});

// ============================================================================
// New validations added 2026-03-01
// ============================================================================

describe('Well: requires 1g', () => {
  it('blocks when player has 0g', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 0);
    s = withUtility(s, 0, 'well_1', 'well');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/need at least 1g/);
  });

  it('allowed when player has 1g+', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 1);
    s = withUtility(s, 0, 'well_1', 'well');
    // Does not throw
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).not.toThrow();
  });
});

describe('Supplies: requires gold or hand card', () => {
  it('blocks when player has 0g and empty hand', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 0);
    s = withUtility(s, 0, 'supplies_1', 'supplies');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/need at least 1g or 1 card/);
  });

  it('allowed when player has a card in hand (even with 0g)', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = removeFromDeck(s, 'ware_3k_1');
    s = withGold(s, 0, 0);
    s = withUtility(s, 0, 'supplies_1', 'supplies');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).not.toThrow();
  });
});

describe('Basket Maker: blocks when supply is empty', () => {
  it('blocks when all ware types have 0 supply', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['basket_maker_1']);
    s = removeFromDeck(s, 'basket_maker_1');
    s = withGold(s, 0, 20);
    s = { ...s, wareSupply: { trinkets: 0, hides: 0, tea: 0, silk: 0, fruit: 0, salt: 0 } };
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'basket_maker_1' })).toThrow(/no wares in supply/);
  });
});

describe('Carrier: auto-resolves ware step when supply is empty', () => {
  it('auto-resolves CARRIER_WARE_SELECT when all supply is 0', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['carrier_1']);
    s = removeFromDeck(s, 'carrier_1');
    s = withGold(s, 0, 20);
    s = { ...s, wareSupply: { trinkets: 0, hides: 0, tea: 0, silk: 0, fruit: 0, salt: 0 } };

    // Play Carrier — shows BINARY_CHOICE
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'carrier_1' });
    expect(s2.pendingResolution?.type).toBe('BINARY_CHOICE');

    // Choose wares option (choice 0) — transitions to CARRIER_WARE_SELECT
    const s3 = resolve(s2, { type: 'BINARY_CHOICE', choice: 0 });
    expect(s3.pendingResolution?.type).toBe('CARRIER_WARE_SELECT');

    // Send dummy response — guard should auto-resolve since supply is empty
    const s4 = resolve(s3, { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' });
    expect(s4.pendingResolution).toBeNull();
  });
});

// ============================================================================
// Additional stall coverage — resolver guards for remaining resolution types
// ============================================================================

describe('Portuguese (WARE_SELL_BULK): auto-resolves when market is empty', () => {
  it('resolver guard clears pending when no wares in market', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['portuguese_1']);
    s = removeFromDeck(s, 'portuguese_1');
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['silk', null, null, null, null, null]);

    // Play Portuguese (validation needs a ware), then empty the market
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'portuguese_1' });
    expect(s2.pendingResolution?.type).toBe('WARE_SELL_BULK');
    s2 = withMarket(s2, 0, [null, null, null, null, null, null]);
    s2 = { ...s2, wareSupply: { ...s2.wareSupply, silk: s2.wareSupply.silk + 1 } };

    // Send any response — guard fires first (no wares) and auto-resolves
    const s3 = resolve(s2, { type: 'SELL_WARES', wareIndices: [] });
    expect(s3.pendingResolution).toBeNull();
  });
});

describe('Psychic (DECK_PEEK): auto-resolves when deck is empty', () => {
  it('revealedCards is empty when deck is empty — resolver auto-resolves', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['psychic_1']);
    s = removeFromDeck(s, 'psychic_1');
    s = withGold(s, 0, 20);
    // Drain deck to discard to maintain 110-card invariant
    s = { ...s, discardPile: [...s.deck, ...s.discardPile], deck: [] };

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'psychic_1' });
    expect(s2.pendingResolution?.type).toBe('DECK_PEEK');
    expect((s2.pendingResolution as any).revealedCards.length).toBe(0);

    // Send any response — guard fires (revealedCards empty) and auto-resolves
    const s3 = resolve(s2, { type: 'DECK_PEEK_PICK', cardIndex: 0 });
    expect(s3.pendingResolution).toBeNull();
  });
});

describe('Tribal Elder: OPPONENT_DISCARD auto-resolves when opponent is already at or below target', () => {
  it('chains to OPPONENT_DISCARD which immediately clears when opponent has <= 3 cards', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['tribal_elder_1']);
    s = removeFromDeck(s, 'tribal_elder_1');
    s = withGold(s, 0, 20);
    // Opponent has 2 cards — already below discard-to threshold of 3
    s = withHand(s, 1, ['ware_3k_1', 'well_1']);

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'tribal_elder_1' });
    expect(s2.pendingResolution?.type).toBe('BINARY_CHOICE');

    // Choose option 1: opponent discards to 3 — chains to OPPONENT_DISCARD
    const s3 = resolve(s2, { type: 'BINARY_CHOICE', choice: 1 });
    expect(s3.pendingResolution?.type).toBe('OPPONENT_DISCARD');

    // Send any response — guard fires (opponent.hand.length <= 3) and auto-resolves
    const s4 = resolve(s3, { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: [] });
    expect(s4.pendingResolution).toBeNull();
    // Opponent's 2 cards untouched
    expect(hand(s4, 1).length).toBe(2);
  });

  it('requires discard when opponent has > 3 cards', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['tribal_elder_1']);
    s = removeFromDeck(s, 'tribal_elder_1');
    s = withGold(s, 0, 20);
    // Opponent has 5 cards — must discard 2
    s = withHand(s, 1, ['ware_3k_1', 'well_1', 'drums_1', 'drums_2', 'ware_3h_1']);

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'tribal_elder_1' });
    const s3 = resolve(s2, { type: 'BINARY_CHOICE', choice: 1 });
    expect(s3.pendingResolution?.type).toBe('OPPONENT_DISCARD');

    // Opponent discards indices 0 and 1 (2 cards) to get down to 3
    const s4 = resolve(s3, { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: [0, 1] });
    expect(s4.pendingResolution).toBeNull();
    expect(hand(s4, 1).length).toBe(3);
  });
});

describe('Shaman (WARE_TRADE): SELECT_RECEIVE guard auto-resolves when supply has no valid receive type', () => {
  it('auto-resolves at SELECT_RECEIVE step when entire supply is depleted', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['shaman_1']);
    s = removeFromDeck(s, 'shaman_1');
    s = withGold(s, 0, 20);
    // 2 trinkets on market — valid give type
    s = withMarket(s, 0, ['trinkets', 'trinkets', null, null, null, null]);
    // All supply depleted — no valid receive type for count=2
    s = { ...s, wareSupply: { trinkets: 0, hides: 0, tea: 0, silk: 0, fruit: 0, salt: 0 } };

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'shaman_1' });
    expect(s2.pendingResolution?.type).toBe('WARE_TRADE');

    // Select 'trinkets' as the give type — transitions to SELECT_RECEIVE
    const s3 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' });
    expect((s3.pendingResolution as any).step).toBe('SELECT_RECEIVE');

    // Send any response — guard fires at SELECT_RECEIVE (no valid receive type) and auto-resolves
    const s4 = resolve(s3, { type: 'SELECT_WARE_TYPE', wareType: 'hides' });
    expect(s4.pendingResolution).toBeNull();
  });
});

describe('Elephant (DRAFT): resolves after final ware is picked', () => {
  it('resolves immediately when only 1 ware total is in the pool', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['elephant_1']);
    s = withGold(s, 0, 20);
    // Only P0 has 1 ware; P1 market empty
    s = withMarket(s, 0, ['trinkets', null, null, null, null, null]);
    s = withMarket(s, 1, [null, null, null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5 } };

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'elephant_1' });
    expect(s2.pendingResolution?.type).toBe('DRAFT');
    expect((s2.pendingResolution as any).availableWares.length).toBe(1);

    // P0 picks the only ware — pool exhausted, resolves
    const s3 = resolve(s2, { type: 'SELECT_WARE', wareIndex: 0 });
    expect(s3.pendingResolution).toBeNull();
  });
});

describe('Supplies (SUPPLIES_DISCARD): auto-resolves when hand is empty at discard step', () => {
  it('skips discard and draws until ware when hand is empty', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 10);
    s = withUtility(s, 0, 'supplies_1', 'supplies');

    // Activate Supplies — requires gold or hand card; 10g satisfies validation
    const s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution?.type).toBe('BINARY_CHOICE');

    // Choose "discard a card" (choice 1) with empty hand — chains to SUPPLIES_DISCARD
    const s3 = resolve(s2, { type: 'BINARY_CHOICE', choice: 1 });
    expect(s3.pendingResolution?.type).toBe('SUPPLIES_DISCARD');

    // Send any response — guard fires (hand empty) and auto-resolves without discarding
    const s4 = resolve(s3, { type: 'SELECT_CARD', cardId: 'dummy_nonexistent' });
    expect(s4.pendingResolution).toBeNull();
  });
});

describe('Wise Man from Afar (TURN_MODIFIER): auto-resolves immediately', () => {
  it('applies modifier and clears pendingResolution in one PLAY_CARD step', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['wise_man_1']);
    s = removeFromDeck(s, 'wise_man_1');
    s = withGold(s, 0, 20);

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'wise_man_1' });
    // No RESOLVE_INTERACTION needed — modifier applied inline
    expect(s2.pendingResolution).toBeNull();
    expect(s2.turnModifiers.buyDiscount).toBe(2);
    expect(s2.turnModifiers.sellBonus).toBe(2);
  });
});

describe('Traveling Merchant: requires 2 empty market slots', () => {
  it('blocks when player has fewer than 2 empty market slots', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['traveling_merchant_1']);
    s = removeFromDeck(s, 'traveling_merchant_1');
    s = withGold(s, 0, 20);
    // Only 1 empty slot — not enough for the 2 auctioned wares
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5, tea: 5, silk: 5, fruit: 5 } };
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' })).toThrow(/need at least 2 empty market slots/);
  });

  it('allowed when 2+ empty slots exist', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['traveling_merchant_1']);
    s = removeFromDeck(s, 'traveling_merchant_1');
    s = withGold(s, 0, 20);
    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' });
    expect(s2.pendingResolution?.type).toBe('AUCTION');
  });
});
describe('Traveling Merchant: requires 1g for the automatic opening bid', () => {
  // Regression: with 0g the active player could "win" at the automatic 1g opening bid and go to -1g
  it('blocks with 0 gold', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['traveling_merchant_1']);
    s = removeFromDeck(s, 'traveling_merchant_1');
    s = withGold(s, 0, 0);
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'traveling_merchant_1' })).toThrow(/need at least 1g/);
  });
});

describe('Arabian Merchant: requires a non-empty deck (auctions cards, not wares)', () => {
  it('allowed with a full market', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['arabian_merchant_1']);
    s = removeFromDeck(s, 'arabian_merchant_1');
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    expect(act(s, { type: 'PLAY_CARD', cardId: 'arabian_merchant_1' }).pendingResolution?.type).toBe('AUCTION');
  });
});


describe('Parrot: blocks when own market has no empty slots', () => {
  it('blocks when active player market is full', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['parrot_1']);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    s = withMarket(s, 1, ['trinkets', null, null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 3, hides: 5, tea: 5, silk: 5, fruit: 5, salt: 5 } };
    expect(() => act(s, { type: 'PLAY_CARD', cardId: 'parrot_1' })).toThrow(/your market has no room/);
  });
});

describe('Throne (WARE_THEFT_SWAP): resolver guard auto-resolves when there is nothing to exchange', () => {
  it('STEAL step auto-resolves when the active player has no wares left to give', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 20);
    s = withMarket(s, 0, ['hides', null, null, null, null, null]);
    s = withMarket(s, 1, ['trinkets', null, null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 5, hides: 5 } };
    s = withUtility(s, 0, 'throne_1', 'throne');

    let s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    expect(s2.pendingResolution?.type).toBe('WARE_THEFT_SWAP');
    // Market emptied after activation (e.g. by state change) — guard must fire
    s2 = withMarket(s2, 0, [null, null, null, null, null, null]);
    s2 = { ...s2, wareSupply: { ...s2.wareSupply, hides: 6 } };
    const s3 = resolve(s2, { type: 'SELECT_WARE', wareIndex: 0 });
    expect(s3.pendingResolution).toBeNull();
  });
});

describe('Cheetah (OPPONENT_CHOICE): handles opponent with 0g gracefully', () => {
  it('an opponent who cannot pay 2g must let the active player draw (rulebook: no gold, no gold-costing action)', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['cheetah_1']);
    s = withGold(s, 0, 20);
    s = withGold(s, 1, 1);

    const s2 = act(s, { type: 'PLAY_CARD', cardId: 'cheetah_1' });
    expect(s2.pendingResolution?.type).toBe('OPPONENT_CHOICE');

    // "Give 2g" with only 1g is refused (it used to transfer what they had — even 0 — cancelling the Cheetah)
    expect(() => resolve(s2, { type: 'OPPONENT_CHOICE', choice: 0 })).toThrow(/Cannot give 2g/);
    // ...but the other option always works, so the decision never stalls
    const handBefore = s2.players[0].hand.length;
    const s3 = resolve(s2, { type: 'OPPONENT_CHOICE', choice: 1 });
    expect(s3.pendingResolution).toBeNull();
    expect(s3.players[0].hand.length).toBe(handBefore + 2);
    expect(gold(s3, 1)).toBe(1);
  });

  it('an opponent with 2g+ may pay exactly 2g', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['cheetah_1']);
    s = withGold(s, 0, 20);
    s = withGold(s, 1, 5);
    const s3 = resolve(act(s, { type: 'PLAY_CARD', cardId: 'cheetah_1' }), { type: 'OPPONENT_CHOICE', choice: 0 });
    expect(gold(s3, 0)).toBe(22);
    expect(gold(s3, 1)).toBe(3);
  });
});
