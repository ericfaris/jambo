import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { InteractionPanel, filledMarketSlots } from '../../src/ui/InteractionPanel.tsx';
import type { GameAction, GameState } from '../../src/engine/types.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import { createTestState, toPlayPhase, withMarket } from '../helpers/testHelpers.ts';

function portugueseState(market: GameState['players'][0]['market']): GameState {
  const s = withMarket(toPlayPhase(createTestState()), 0, market);
  return { ...s, currentPlayer: 0, pendingResolution: { type: 'WARE_SELL_BULK', sourceCard: 'portuguese_1', pricePerWare: 2 } };
}

describe('Portuguese: select all wares', () => {
  it('picks every filled slot and skips empty ones', () => {
    expect(filledMarketSlots(['tea', null, 'salt', 'tea', null, 'silk'])).toEqual([0, 2, 3, 5]);
    expect(filledMarketSlots([null, null])).toEqual([]);
  });

  it('offers a Select all button with the ware count', () => {
    const s = portugueseState(['tea', null, 'salt', 'tea', null, null]);
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state: s, dispatch: (_a: GameAction) => {}, viewerPlayer: 0 }));
    expect(html).toContain('Select all (3)');
  });

  it('the engine accepts the all-wares selection', () => {
    const s = portugueseState(['tea', null, 'salt', 'tea', null, null]);
    const gold = s.players[0].gold;
    const next = processAction(s, { type: 'RESOLVE_INTERACTION', response: { type: 'SELL_WARES', wareIndices: filledMarketSlots(s.players[0].market) } });
    expect(next.players[0].gold).toBe(gold + 6);
    expect(next.players[0].market.every(w => w === null)).toBe(true);
  });
});
