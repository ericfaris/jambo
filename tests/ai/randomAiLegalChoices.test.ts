import { describe, it, expect } from 'vitest';
import { getRandomInteractionResponse } from '../../src/ai/RandomAI.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import type { GameState } from '../../src/engine/types.ts';
import { createTestState, toPlayPhase, withGold, withHand, withMarket, withSupply } from '../helpers/testHelpers.ts';

// The fuzzer flagged Easy-AI first choices the engine rejects (the game
// recovered via fallbacks, but each one is a wasted, retried move).
describe('random AI picks only legal choices', () => {
  it('Supplies: discards instead of paying when broke', () => {
    let s = withHand(withGold(toPlayPhase(createTestState()), 0, 0), 0, ['well_1']);
    s = { ...s, pendingResolution: { type: 'BINARY_CHOICE', sourceCard: 'supplies_1', options: ['Pay 1g', 'Discard 1 card'] } } as GameState;
    for (let i = 0; i < 20; i++) {
      const r = getRandomInteractionResponse(s, () => i / 20);
      expect(r).toEqual({ type: 'BINARY_CHOICE', choice: 1 });
    }
  });

  it('Basket Maker: picks a stocked ware even with only one free slot', () => {
    let s = withGold(toPlayPhase(createTestState()), 0, 10);
    s = withMarket(s, 0, ['tea', 'tea', 'tea', 'tea', 'tea', null]);
    s = withSupply(withSupply(s, 'trinkets', 0), 'salt', 5);
    s = { ...s, pendingResolution: { type: 'WARE_SELECT_MULTIPLE', sourceCard: 'basket_maker_1', count: 2 } };
    const r = getRandomInteractionResponse(s, () => 0);
    expect(r?.type).toBe('SELECT_WARE_TYPE');
    expect(() => processAction(s, { type: 'RESOLVE_INTERACTION', response: r! })).not.toThrow();
  });
});
