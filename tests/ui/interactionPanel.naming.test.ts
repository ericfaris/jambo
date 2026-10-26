import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { InteractionPanel } from '../../src/ui/InteractionPanel.tsx';
import type { GameState, PendingResolution } from '../../src/engine/types.ts';
import { createTestState, toPlayPhase, withHand, withMarket, withUtility } from '../helpers/testHelpers.ts';

// Playtest 2026-10-25: some prompts said "opponent" while the Hyena panel next
// to them said "Amara" — every prompt names the other seat now.
const noopDispatch = () => {};

function panel(state: GameState, pr: PendingResolution, opponentName?: string): string {
  const html = renderToStaticMarkup(createElement(InteractionPanel, { state: { ...state, pendingResolution: pr }, dispatch: noopDispatch, viewerPlayer: 0, opponentName }));
  return html.replace(/&#x27;/g, "'");
}

describe('resolve prompts name the other seat', () => {
  const base = toPlayPhase(createTestState());

  it('Parrot', () => {
    const state = withMarket(base, 1, ['tea', 'salt', null, null, null, null]);
    const html = panel(state, { type: 'WARE_THEFT_SINGLE', sourceCard: 'parrot_1' }, 'Amara');
    expect(html).toContain('Select 1 ware to steal from Amara (2 available).');
  });

  it('Crocodile', () => {
    const state = withUtility(base, 1, 'well_1');
    const html = panel(state, { type: 'CROCODILE_USE', sourceCard: 'crocodile_1', step: 'SELECT_UTILITY', opponentPlayer: 1 }, 'Amara');
    expect(html).toContain("Select 1 of Amara's utilities to use and discard (1 available).");
  });

  it('keeps the generic copy when no name is given (Cast)', () => {
    const state = withMarket(base, 1, ['tea', null, null, null, null, null]);
    expect(panel(state, { type: 'WARE_THEFT_SINGLE', sourceCard: 'parrot_1' })).toContain('steal from opponent (1 available)');
  });
});

describe('counts read as plain English', () => {
  it('Psychic says "1 card", not "1 card(s)"', () => {
    const state = toPlayPhase(createTestState());
    const html = panel(state, { type: 'DECK_PEEK', sourceCard: 'psychic_1', revealedCards: state.deck.slice(0, 6), pickCount: 1 });
    expect(html).toContain('Pick 1 card to keep');
    expect(html).not.toContain('(s)');
  });
});

describe('empty and forced choices explain themselves', () => {
  const base = toPlayPhase(createTestState());

  it('Tribal Elder against a short hand says why there is nothing to do', () => {
    const state = withHand(base, 1, base.players[1].hand.slice(0, 2));
    const html = panel(state, { type: 'OPPONENT_DISCARD', sourceCard: 'tribal_elder_1', targetPlayer: 1, discardTo: 3 }, 'Amara');
    expect(html).toContain('Amara has only 2 cards — already 3 or fewer, so nothing to discard.');
  });

  it('Snake with a single utility says it simply stays', () => {
    const state = withUtility(base, 0, 'well_1');
    expect(panel(state, { type: 'UTILITY_KEEP', sourceCard: 'snake_1', step: 'ACTIVE_CHOOSE' })).toContain('Your only utility stays');
  });

  it('Snake with three utilities counts the rest', () => {
    const state = withUtility(withUtility(withUtility(base, 0, 'well_1'), 0, 'drums_1'), 0, 'boat_1');
    expect(panel(state, { type: 'UTILITY_KEEP', sourceCard: 'snake_1', step: 'ACTIVE_CHOOSE' })).toContain('Choose 1 utility to keep — the other 2 are discarded.');
  });
});
