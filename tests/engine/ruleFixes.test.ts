// ============================================================================
// Regression tests for the rulebook-audit card fixes (2026-10-03)
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createTestState, toPlayPhase, act, resolve, withHand, withMarket, withGold, withUtility, removeFromDeck, gold, market,
} from '../helpers/testHelpers.ts';
import { getValidActions, validateAction } from '../../src/engine/validation/actionValidator.ts';
import { importReplayLog } from '../../src/persistence/replayLog.ts';
import { extractPublicState, redactHiddenCards } from '../../src/multiplayer/stateSplitter.ts';
import { parseOpponentAction } from '../../src/ui/PlayerScreen.tsx';
import type { GameAction } from '../../src/engine/types.ts';

describe('Shaman trades in place (never fills a new / paid 6th space)', () => {
  it('received wares take the given wares’ spaces', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['shaman_1']);
    s = removeFromDeck(s, 'shaman_1');
    s = withGold(s, 0, 20);
    // trinkets in a small-stand space, 6th large space empty
    s = { ...s, players: [{ ...s.players[0], smallMarketStands: 1, market: ['tea', 'silk', 'fruit', 'salt', 'hides', null, 'trinkets', 'trinkets', null] }, s.players[1]] };
    s = { ...s, wareSupply: { ...s.wareSupply, trinkets: 4, tea: 5, silk: 5, fruit: 5, salt: 5, hides: 6 } };
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'shaman_1' });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'hides' });
    expect(market(s2, 0)).toEqual(['tea', 'silk', 'fruit', 'salt', 'hides', null, 'hides', 'hides', null]);
    expect(gold(s2, 0)).toBe(20);
  });
});

describe('Carrier gives only what fits', () => {
  it('with room for 1, takes 1 and leaves 1 in the supply', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['carrier_1']);
    s = removeFromDeck(s, 'carrier_1');
    s = withGold(s, 0, 1); // can't pay for a 6th space
    s = withMarket(s, 0, ['tea', 'silk', 'salt', 'hides', null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, tea: 5, silk: 5, salt: 5, hides: 5, fruit: 6 } };
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'carrier_1' });
    s2 = resolve(s2, { type: 'BINARY_CHOICE', choice: 0 });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'fruit' });
    expect(market(s2, 0).filter(w => w === 'fruit')).toHaveLength(1);
    expect(s2.wareSupply.fruit).toBe(5);
    expect(gold(s2, 0)).toBe(1);
  });
});

describe('ware gains respect the 6th-space fee', () => {
  it('Leopard Statue pays 2g + 2g when the ware lands in the 6th space', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, []);
    s = withGold(s, 0, 10);
    s = withMarket(s, 0, ['tea', 'silk', 'fruit', 'salt', 'hides', null]);
    s = { ...s, wareSupply: { ...s.wareSupply, tea: 5, silk: 5, fruit: 5, salt: 5, hides: 5, trinkets: 6 } };
    s = withUtility(s, 0, 'leopard_statue_1', 'leopard_statue');
    let s2 = act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
    s2 = resolve(s2, { type: 'SELECT_WARE_TYPE', wareType: 'trinkets' });
    expect(gold(s2, 0)).toBe(10 - 2 - 2);
  });

  it('Leopard Statue is blocked when only the 6th space is free and gold covers just the 2g price', () => {
    let s = toPlayPhase(createTestState());
    s = withGold(s, 0, 3);
    s = withMarket(s, 0, ['tea', 'silk', 'fruit', 'salt', 'hides', null]);
    s = withUtility(s, 0, 'leopard_statue_1', 'leopard_statue');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no room/);
  });

  it('Boat is blocked when only the 6th space is free and the player has under 2g', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['ware_3k_1']);
    s = withGold(s, 0, 1);
    s = withMarket(s, 0, ['tea', 'silk', 'fruit', 'salt', 'hides', null]);
    s = withUtility(s, 0, 'boat_1', 'boat');
    expect(() => act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toThrow(/no room/);
  });

  it('Parrot steal into the 6th space costs 2g', () => {
    let s = toPlayPhase(createTestState());
    s = withHand(s, 0, ['parrot_1']);
    s = removeFromDeck(s, 'parrot_1');
    s = withHand(s, 1, []);
    s = withGold(s, 0, 10);
    s = withMarket(s, 0, ['tea', 'silk', 'fruit', 'salt', 'hides', null]);
    s = withMarket(s, 1, ['trinkets', null, null, null, null, null]);
    s = { ...s, wareSupply: { ...s.wareSupply, tea: 5, silk: 5, fruit: 5, salt: 5, hides: 5, trinkets: 5 } };
    let s2 = act(s, { type: 'PLAY_CARD', cardId: 'parrot_1' });
    s2 = resolve(s2, { type: 'SELECT_WARE', wareIndex: 0 });
    expect(market(s2, 0)[5]).toBe('trinkets');
    expect(gold(s2, 0)).toBe(8);
  });
});

describe('DRAW_ACTION is gone', () => {
  it('is never offered and is rejected', () => {
    const s = toPlayPhase(createTestState());
    expect(getValidActions(s).some(a => (a.type as string) === 'DRAW_ACTION')).toBe(false);
    expect(validateAction(s, { type: 'DRAW_ACTION' } as unknown as GameAction).valid).toBe(false);
  });

  it('replays containing it are rejected', () => {
    const payload = JSON.stringify({ formatVersion: '1.0', gameVersion: 'x', createdAt: new Date(0).toISOString(), rngSeed: 1, actions: [{ type: 'DRAW_ACTION' }] });
    expect(() => importReplayLog(payload)).toThrow(/invalid action/);
  });
});

describe('cast phone: Scale message still works with the kept card redacted', () => {
  it('reports the card you were given', () => {
    const s = createTestState();
    const entry = redactHiddenCards({ turn: 1, player: 1, action: 'SCALE_EFFECT', details: 'Kept guard_1, gave well_2 to opponent' });
    const info = parseOpponentAction(entry.action, entry.details ?? '', extractPublicState(s), 1);
    expect(info?.message).toBe('Opponent used Scale and gave you a card.');
    expect(info?.cardGivenId).toBe('well_2');
  });
});
