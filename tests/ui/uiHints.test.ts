import { describe, expect, it } from 'vitest';
import { formatLogRecap, formatTurnOwner, formatResolutionBreadcrumb, getDrawDisabledReason, getPlayDisabledReason } from '../../src/ui/uiHints.ts';
import { createTestState, toPlayPhase, act, withHand, removeFromDeck } from '../helpers/testHelpers.ts';

describe('uiHints', () => {
  it('returns play disabled reason for draw phase', () => {
    const reason = getPlayDisabledReason({
      phase: 'DRAW',
      currentPlayer: 0,
      actionsLeft: 5,
      hasPendingInteraction: false,
      isAiTurn: false,
    });

    expect(reason).toMatch(/Play phase/i);
  });

  it('returns draw disabled reason when not local turn', () => {
    const reason = getDrawDisabledReason({
      phase: 'DRAW',
      currentPlayer: 1,
      isAiTurn: true,
    });

    expect(reason).toMatch(/your turn/i);
  });

  it('formats breadcrumb for Tribal Elder discard resolution', () => {
    let state = toPlayPhase(createTestState());
    state = withHand(state, 0, ['tribal_elder_1']);
    state = withHand(state, 1, ['ware_3k_1', 'ware_3h_1', 'ware_3t_1', 'ware_3l_1', 'ware_3f_1']);
    state = removeFromDeck(state, 'tribal_elder_1');
    state = removeFromDeck(state, 'ware_3k_1');
    state = removeFromDeck(state, 'ware_3h_1');
    state = removeFromDeck(state, 'ware_3t_1');
    state = removeFromDeck(state, 'ware_3l_1');
    state = removeFromDeck(state, 'ware_3f_1');

    const afterPlay = act(state, { type: 'PLAY_CARD', cardId: 'tribal_elder_1' });
    const afterChoice = act(afterPlay, { type: 'RESOLVE_INTERACTION', response: { type: 'BINARY_CHOICE', choice: 1 } });

    expect(afterChoice.pendingResolution?.type).toBe('OPPONENT_DISCARD');
    const breadcrumb = formatResolutionBreadcrumb(afterChoice.pendingResolution!);
    expect(breadcrumb).toContain('Tribal Elder');
    expect(breadcrumb).toContain('3');
  });
});

describe('formatLogRecap', () => {
  it('names the actor and replaces card ids with card names', () => {
    expect(formatLogRecap({ player: 1, action: 'CROCODILE_CLEANUP', details: "Discarded opponent's well_1 after Crocodile use" }, ['You', 'Opponent']))
      .toBe("Opponent: Discarded opponent's Well after Crocodile use");
  });

  it('never shows raw action codes', () => {
    const text = formatLogRecap({ player: 0, action: 'END_TURN' }, ['You', 'Opponent']);
    expect(text).toBe('You: End turn');
    expect(text).not.toContain('END_TURN');
  });
});

describe('formatTurnOwner', () => {
  it('matches the board labels', () => {
    expect(formatTurnOwner('You')).toBe('Your turn');
    expect(formatTurnOwner('Opponent')).toBe("Opponent's turn");
    expect(formatTurnOwner('Player 2')).toBe("Player 2's turn");
  });
});

describe('log redaction', () => {
  it("hides the AI's drawn card from the human in solo", () => {
    const entry = { player: 1 as const, action: 'DRAW_CARD', details: 'Drew scale_1' };
    expect(formatLogRecap(entry, ['You', 'Opponent'], 1)).toBe('Opponent: Drew a card');
    expect(formatLogRecap({ ...entry, player: 0 }, ['You', 'Opponent'], 1)).toBe('You: Drew Scale');
  });
});

describe('formatResolutionBreadcrumb — never shows raw enum codes', () => {
  const RAW = /[A-Z]{2,}_[A-Z]|[a-z]+_[a-z]+|\b[A-Z]{4,}\b/;

  it('humanizes utility design and step ids', async () => {
    const { humanizeToken } = await import('../../src/ui/uiHints.ts');
    expect(humanizeToken('SELECT_WARE_TYPE')).toBe('Select Ware Type');
    expect(humanizeToken('leopard_statue')).toBe('Leopard Statue');
  });

  it.each([
    { type: 'WARE_SELECT_MULTIPLE', sourceCard: 'basket_maker_1', count: 2 },
    { type: 'BINARY_CHOICE', sourceCard: 'carrier_1', options: ['a', 'b'] },
    { type: 'UTILITY_EFFECT', sourceCard: 'leopard_statue_1', utilityDesign: 'leopard_statue', step: 'SELECT_WARE_TYPE' },
    { type: 'DRAFT', sourceCard: 'ape_1', draftMode: 'cards' },
    { type: 'DECK_PEEK', sourceCard: 'psychic_1' },
  ])('$type reads as plain language', (pr) => {
    const crumb = formatResolutionBreadcrumb(pr as unknown as Parameters<typeof formatResolutionBreadcrumb>[0]);
    expect(crumb).not.toMatch(RAW);
    expect(crumb.length).toBeGreaterThan(3);
  });
});
