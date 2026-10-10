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
      .toBe('Opponent: Discarded your Well after Crocodile use');
  });

  it("speaks from the viewer's side when the other seat acted", () => {
    expect(formatLogRecap({ player: 1, action: 'BINARY_CHOICE', details: 'Made opponent discard down to 3' }, ['You', 'Opponent']))
      .toBe('Opponent: Made you discard down to 3');
    expect(formatLogRecap({ player: 1, action: 'CHEETAH_EFFECT', details: 'Opponent gave 2g' }, ['You', 'Opponent']))
      .toBe('Opponent: You gave 2g');
    // your own actions keep "opponent"
    expect(formatLogRecap({ player: 0, action: 'SCALE_EFFECT', details: 'Kept scale_1, gave well_1 to opponent' }, ['You', 'Opponent']))
      .toBe('You: Kept Scale, gave Well to opponent');
    // hotseat seat names are left alone
    expect(formatLogRecap({ player: 1, action: 'BINARY_CHOICE', details: 'Made opponent discard down to 3' }, ['Player 1', 'Player 2']))
      .toBe('Player 2: Made opponent discard down to 3');
  });

  it('never shows raw action codes, nor engine seat numbers for a turn end', () => {
    const mine = formatLogRecap({ player: 0, action: 'END_TURN', details: "Turn ended. Player 2's turn begins (turn 6)" }, ['You', 'Opponent']);
    expect(mine).toBe('You ended your turn');
    expect(mine).not.toContain('END_TURN');
    expect(formatLogRecap({ player: 1, action: 'END_TURN', details: "Turn ended. Player 1's turn begins (turn 7)" }, ['You', 'Opponent']))
      .toBe('Opponent ended their turn');
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

import { friendlyPlayError, keepAndPlayOptions } from '../../src/ui/uiHints.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import { withGold, withMarket } from '../helpers/testHelpers.ts';
import type { GameState as GS } from '../../src/engine/types.ts';

describe('friendlyPlayError', () => {
  it('names the real problem instead of a generic buy/sell message', () => {
    expect(friendlyPlayError('Cannot sell: player does not have the required wares')).toMatch(/To sell, your market needs/);
    expect(friendlyPlayError('Cannot buy: insufficient gold (need 12g, have 8g)')).toBe('Buying costs 12g — you have 8g.');
    expect(friendlyPlayError('Cannot buy: insufficient market space')).toMatch(/Not enough room/);
    expect(friendlyPlayError('Cannot buy: insufficient ware supply (tea)')).toBe('The supply has run out of tea.');
    expect(friendlyPlayError('No actions remaining')).toMatch(/used all your actions/);
  });
});

describe('keepAndPlayOptions (draw dialog Keep & Buy / Keep & Sell)', () => {
  /** Turn-1 draw of the Grand Market (6-ware) card, the reported case. */
  function drewSixWare(gold = 20): GS {
    let s = createTestState(11);
    const id = 'ware_6all_1';
    const strip = (l: string[]) => l.filter((x) => x !== id);
    s = {
      ...s,
      currentPlayer: 0,
      players: [{ ...s.players[0], hand: strip(s.players[0].hand) }, { ...s.players[1], hand: strip(s.players[1].hand) }],
      deck: [id, ...strip(s.deck)],
      discardPile: strip(s.discardPile),
    };
    s = withGold(s, 0, gold);
    return processAction(s, { type: 'DRAW_CARD' });
  }

  it('offers Keep & Buy for a drawn six-ware card on turn 1, and not Sell (empty market)', () => {
    const s = drewSixWare();
    expect(s.drawnCard).toBe('ware_6all_1');
    const opts = keepAndPlayOptions(s, 0)!;
    expect(opts.buy.valid).toBe(true);
    expect(opts.sell.valid).toBe(false);
    expect(opts.sell.reason).toMatch(/To sell/);
  });

  it('the shortcut is exactly KEEP_CARD then PLAY_CARD, and both succeed', () => {
    let s = drewSixWare();
    s = processAction(s, { type: 'KEEP_CARD' });
    s = processAction(s, { type: 'PLAY_CARD', cardId: 'ware_6all_1', wareMode: 'buy' });
    expect(s.players[0].market.filter(Boolean)).toHaveLength(6);
    expect(s.players[0].gold).toBe(20 - 10 - 2); // card + 6th-space fee
  });

  it('explains why Buy is unavailable (not enough gold incl. the 6th-space fee)', () => {
    const opts = keepAndPlayOptions(drewSixWare(11), 0)!;
    expect(opts.buy.valid).toBe(false);
    expect(opts.buy.reason).toBe('Buying costs 12g — you have 11g.');
  });

  it('offers Sell when the market holds the wares', () => {
    const s0 = drewSixWare();
    const s = withMarket(s0, 0, ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt']);
    expect(keepAndPlayOptions(s, 0)!.sell.valid).toBe(true);
  });

  it('is null for non-ware draws and for the other player', () => {
    const s = drewSixWare();
    expect(keepAndPlayOptions(s, 1)).toBeNull();
    expect(keepAndPlayOptions({ ...s, drawnCard: 'shaman_1' }, 0)).toBeNull();
  });
});
