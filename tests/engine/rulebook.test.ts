// ============================================================================
// Turn rules straight from the official Rio Grande / Kosmos rulebook
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createTestState, act, toPlayPhase, withGold, withHand, gold } from '../helpers/testHelpers.ts';
import { createInitialState } from '../../src/engine/GameState.ts';
import { CONSTANTS, INITIAL_WARE_SUPPLY } from '../../src/engine/types.ts';
import { getValidActions } from '../../src/engine/validation/actionValidator.ts';

describe('setup', () => {
  it('5 cards and 20 gold each, 6 of every ware in supply, 110-card deck', () => {
    const s = createInitialState(7);
    expect(s.players.map(p => p.hand.length)).toEqual([5, 5]);
    expect(s.players.map(p => p.gold)).toEqual([20, 20]);
    expect(Object.values(INITIAL_WARE_SUPPLY)).toEqual([6, 6, 6, 6, 6, 6]);
    expect(s.deck.length + 10).toBe(CONSTANTS.TOTAL_CARDS_IN_GAME);
  });
});

describe('phase 1: draw cards', () => {
  it('"may only keep the last card he draws": discarding moves on, keeping ends the phase', () => {
    let s = createTestState();
    s = act(s, { type: 'DRAW_CARD' });
    const first = s.drawnCard!;
    s = act(s, { type: 'DISCARD_DRAWN' });
    expect(s.discardPile[0]).toBe(first);
    s = act(s, { type: 'DRAW_CARD' });
    const second = s.drawnCard!;
    s = act(s, { type: 'KEEP_CARD' });
    expect(s.phase).toBe('PLAY');
    expect(s.players[0].hand).toContain(second);
    expect(s.players[0].hand).not.toContain(first);
    expect(s.actionsLeft).toBe(3);
  });

  it('"possible to spend all 5 action markers drawing cards … the player has no phase 2"', () => {
    let s = createTestState();
    for (let i = 0; i < 5; i++) {
      s = act(s, { type: 'DRAW_CARD' });
      if (i < 4) s = act(s, { type: 'DISCARD_DRAWN' });
    }
    const kept = s.drawnCard!;
    s = act(s, { type: 'KEEP_CARD' });
    // No actions left → no phase 2: the turn passes straight to the opponent
    expect(s.players[0].hand).toContain(kept);
    expect(s.currentPlayer).toBe(1);
    expect(s.phase).toBe('DRAW');
    expect(getValidActions(s).some(a => a.type === 'DRAW_CARD')).toBe(true);
  });

  it('may bypass phase 1 and keep all 5 actions', () => {
    const s = act(createTestState(), { type: 'SKIP_DRAW' });
    expect(s.phase).toBe('PLAY');
    expect(s.actionsLeft).toBe(5);
  });
});

describe('end of turn', () => {
  it('"2 or more action markers left … takes 1 gold from the bank"', () => {
    let s = act(createTestState(), { type: 'SKIP_DRAW' });
    s = withGold(s, 0, 20);
    s = act(s, { type: 'END_TURN' });
    expect(gold(s, 0)).toBe(21);
  });

  it('no bonus with fewer than 2 markers left', () => {
    let s = toPlayPhase(createTestState()); // 1 action used drawing
    s = withHand(s, 0, ['weapons_1', 'well_1', 'kettle_1']);
    s = withGold(s, 0, 20);
    s = act(s, { type: 'PLAY_CARD', cardId: 'weapons_1' });
    s = act(s, { type: 'PLAY_CARD', cardId: 'well_1' });
    s = act(s, { type: 'PLAY_CARD', cardId: 'kettle_1' }); // 1 left
    s = act(s, { type: 'END_TURN' });
    expect(gold(s, 0)).toBe(20);
  });
});
