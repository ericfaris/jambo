import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { InteractionPanel, dancerPreselectedSlots } from '../../src/ui/InteractionPanel.tsx';
import type { GameAction, GameState } from '../../src/engine/types.ts';
import { createTestState, toPlayPhase, withMarket } from '../helpers/testHelpers.ts';

function dancerState(market: GameState['players'][0]['market']): GameState {
  const s = withMarket(toPlayPhase(createTestState()), 0, market);
  return {
    ...s,
    currentPlayer: 0,
    pendingResolution: { type: 'WARE_CASH_CONVERSION', sourceCard: 'dancer_1', step: 'SELECT_WARES', selectedCard: 'ware_3k_1' },
  };
}

const render = (s: GameState) =>
  renderToStaticMarkup(createElement(InteractionPanel, { state: s, dispatch: (_a: GameAction) => {}, viewerPlayer: 0 }));

describe('Dancer: exactly 3 wares are pre-selected', () => {
  it('pre-selects the filled slots only when there are exactly 3', () => {
    expect(dancerPreselectedSlots(['tea', null, 'salt', null, 'silk', null])).toEqual([0, 2, 4]);
    expect(dancerPreselectedSlots(['tea', 'salt', 'silk', 'tea', null, null])).toEqual([]);
    expect(dancerPreselectedSlots(['tea', 'salt', null, null, null, null])).toEqual([]);
  });

  it('with 3 wares the panel opens at 3/3, Confirm enabled', () => {
    const html = render(dancerState(['tea', null, 'salt', null, 'silk', null]));
    expect(html).toContain('3/3 selected');
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>\s*Confirm/);
  });

  it('with more than 3 the player chooses', () => {
    const html = render(dancerState(['tea', 'salt', 'silk', 'tea', null, null]));
    expect(html).toContain('0/3 selected');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Confirm/);
  });
});
