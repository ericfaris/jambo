import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { InteractionPanel } from '../../src/ui/InteractionPanel.tsx';
import { createTestState, toPlayPhase, act, withHand, withMarket, withUtility } from '../helpers/testHelpers.ts';
import type { GameState } from '../../src/engine/types.ts';

const noop = () => {};

function boatStarted(): GameState {
  let s = toPlayPhase(createTestState());
  s = { ...s, players: [{ ...s.players[0], hand: [] }, s.players[1]], deck: [...s.deck, ...s.players[0].hand] };
  s = withHand(s, 0, ['ware_3k_1']);
  s = withMarket(s, 0, []);
  s = withUtility(s, 0, s.deck.includes('boat_1') ? 'boat_1' : 'boat_2', 'boat');
  return act(s, { type: 'ACTIVATE_UTILITY', utilityIndex: 0 });
}

describe('resolve panel cancel (✕)', () => {
  it('shows a labelled cancel button while the action can be backed out of', () => {
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state: boatStarted(), dispatch: noop }));
    expect(html).toContain('panel-cancel-x');
    expect(html).toContain('aria-label="Cancel Boat and get your action back"');
  });

  it('is hidden from the non-active viewer (hotseat / opponent)', () => {
    const html = renderToStaticMarkup(createElement(InteractionPanel, { state: boatStarted(), dispatch: noop, viewerPlayer: 1 }));
    expect(html).not.toContain('panel-cancel-x');
  });

  it('Cast clients follow the server-provided canCancel flag', () => {
    const { cancellableAction: _omit, ...synthetic } = boatStarted();
    const shown = renderToStaticMarkup(createElement(InteractionPanel, { state: synthetic as GameState, dispatch: noop, canCancel: true }));
    const hidden = renderToStaticMarkup(createElement(InteractionPanel, { state: synthetic as GameState, dispatch: noop, canCancel: false }));
    expect(shown).toContain('panel-cancel-x');
    expect(hidden).not.toContain('panel-cancel-x');
  });
});
