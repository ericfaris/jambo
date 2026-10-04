// Regression tests for bugs found by scripts/fuzz.ts (2026-10-04): malformed
// interaction responses (which a Cast client can send over the network) must be
// rejected before any resolver runs.
import { describe, it, expect } from 'vitest';
import { createTestState, toPlayPhase, act, withHand, withUtility, withMarket, withGold } from '../helpers/testHelpers.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import { validateAction, validateResponseShape } from '../../src/engine/validation/actionValidator.ts';
import { checkInvariants } from '../../src/engine/validation/invariants.ts';
import type { GameState, InteractionResponse } from '../../src/engine/types.ts';

function started(design: 'kettle' | 'leopard_statue' | 'boat'): GameState {
  let s = toPlayPhase(createTestState(5));
  s = withHand(s, 0, ['shaman_2', 'guard_2', 'ware_3k_1']);
  s = withMarket(s, 0, []);
  s = withGold(s, 0, 20);
  const id = s.deck.find((c) => c.startsWith(design + '_'))!;
  s = withUtility(s, 0, id, design);
  return act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
}

describe('malformed responses are rejected (fuzz regressions)', () => {
  it('Kettle: the same card twice can no longer duplicate a card', () => {
    const s = started('kettle');
    const bad = { type: 'RESOLVE_INTERACTION' as const, response: { type: 'SELECT_CARDS' as const, cardIds: ['shaman_2', 'shaman_2'] } };
    expect(validateAction(s, bad).valid).toBe(false);
    expect(() => processAction(s, bad)).toThrow(/duplicates/);
    // the legit 2-card discard still works and keeps 110 cards
    const okState = processAction(s, { type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_CARDS', cardIds: ['shaman_2', 'guard_2'] } });
    expect(checkInvariants(okState)).toEqual([]);
  });

  it('Leopard Statue: a non-existent ware type is rejected', () => {
    const s = started('leopard_statue');
    const bad = { type: 'RESOLVE_INTERACTION' as const, response: { type: 'SELECT_WARE_TYPE', wareType: 'gold' } as unknown as InteractionResponse };
    expect(() => processAction(s, bad)).toThrow(/unknown ware type/);
    const okState = processAction(s, { type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_WARE_TYPE', wareType: 'tea' } });
    expect(okState.players[0].market).toContain('tea');
    expect(checkInvariants(okState)).toEqual([]);
  });

  it('shape rules cover every response type', () => {
    const bad: unknown[] = [
      { type: 'SELECT_WARE', wareIndex: -1 }, { type: 'SELECT_WARE', wareIndex: 1.5 },
      { type: 'SELECT_WARES', wareIndices: [0, 0] }, { type: 'SELL_WARES', wareIndices: ['x'] },
      { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: [2, 2] },
      { type: 'AUCTION_BID', amount: 0 }, { type: 'AUCTION_BID', amount: -3 },
      { type: 'BINARY_CHOICE', choice: 2 }, { type: 'OPPONENT_CHOICE', choice: '1' },
      { type: 'DECK_PEEK_PICK', cardIndex: -1 }, { type: 'SELECT_UTILITY', utilityIndex: null },
      { type: 'SELECT_CARDS', cardIds: 'shaman_2' }, { type: 'NOT_A_TYPE' },
    ];
    for (const r of bad) expect(validateResponseShape(r as InteractionResponse).valid, JSON.stringify(r)).toBe(false);
    const good: InteractionResponse[] = [
      { type: 'SELECT_CARD', cardId: '' }, // stall-guard dummy
      { type: 'SELECT_CARDS', cardIds: [] },
      { type: 'SELECT_WARES', wareIndices: [0, 2, 4] },
      { type: 'AUCTION_BID', amount: 3 }, { type: 'AUCTION_PASS' },
      { type: 'BINARY_CHOICE', choice: 1 }, { type: 'SELECT_WARE_TYPE', wareType: 'salt' },
    ];
    for (const r of good) expect(validateResponseShape(r).valid, JSON.stringify(r)).toBe(true);
  });
});
