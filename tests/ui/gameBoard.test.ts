import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { GameBoard } from '../../src/ui/GameBoard.tsx';
import type { GameBoardProps, OpponentSeat } from '../../src/ui/GameBoard.tsx';
import { traderFor } from '../../src/ai/traders.ts';
import { splitState } from '../../src/multiplayer/stateSplitter.ts';
import { toBoardState, HIDDEN_CARD_ID } from '../../src/ui/onlineView.ts';
import { getResponder } from '../../src/engine/responder.ts';
import { getCard } from '../../src/engine/cards/CardDatabase.ts';
import { createTestState, toPlayPhase } from '../helpers/testHelpers.ts';
import type { GameState } from '../../src/engine/types.ts';

const HUMAN: OpponentSeat = { kind: 'human', name: 'Friend', avatarUrl: null, presence: null, presenceElapsedMs: 0 };

function render(state: GameState, over: Partial<GameBoardProps> & { opponent: OpponentSeat }): string {
  const props: GameBoardProps = {
    state,
    dispatch: () => {},
    viewer: 0,
    responder: getResponder(state),
    hasPendingInteraction: false,
    labels: ['You', 'Opponent'],
    endgame: { story: null, onRematch: () => {}, rematchLabel: 'Rematch', record: null },
    menu: { actions: () => null, showAiOptions: false },
    ...over,
  };
  return renderToStaticMarkup(createElement(GameBoard, props));
}

describe('GameBoard — one table for solo and online', () => {
  const state = toPlayPhase(createTestState(42));

  it('solo: the trader across the table, your market below', () => {
    const trader = traderFor('medium');
    const html = render(state, {
      labels: ['You', trader.name],
      opponent: { kind: 'trader', trader, mood: 'neutral', speaking: false, subtitle: `${trader.title} · Medium`, bubble: '', onBubbleHide: () => {}, line: null, endQuote: null },
    });
    expect(html).toContain(trader.name);
    expect(html).toContain('Your Market');
    expect(html).toContain('Your Hand');
  });

  it('resolve panels name the other seat in solo, not "opponent" (playtest 2026-10-25)', () => {
    const cheetah: GameState = {
      ...state,
      // empty hand: no HandReferenceStrip, which reads window (not in SSR)
      players: [{ ...state.players[0], hand: [] }, state.players[1]],
      currentPlayer: 1,
      pendingResolution: { type: 'OPPONENT_CHOICE', sourceCard: 'cheetah_1', options: ['Give 2g to opponent', 'Let opponent draw 2 cards'] },
    };
    const trader = traderFor('medium');
    const solo = render(cheetah, {
      hasPendingInteraction: true,
      labels: ['You', trader.name],
      opponent: { kind: 'trader', trader, mood: 'neutral', speaking: false, subtitle: '', bubble: '', onBubbleHide: () => {}, line: null, endQuote: null },
    });
    expect(solo).toContain(`Give 2g to ${trader.name}`);
    expect(solo).not.toContain('Give 2g to opponent');
  });

  it('a cover (tutorial) replaces the table', () => {
    const html = render(state, { opponent: HUMAN, cover: createElement('div', { className: 'cover-probe' }, 'Tutorial') });
    expect(html).toContain('cover-probe');
    expect(html).not.toContain('Your Market');
  });

  it("the opponent's-turn hint sits in the hand heading row (a row of its own made the desktop board scroll)", () => {
    const theirTurn: GameState = { ...state, currentPlayer: 1 };
    const html = render(theirTurn, { opponent: { ...HUMAN, name: 'Amara' }, labels: ['You', 'Amara'] });
    const hint = html.match(/<div class="disabled-hint hand-head-hint"[^>]*>([^<]*)</);
    expect(hint?.[1]).toMatch(/turn/i);
    expect(html.indexOf('hand-head-hint')).toBeGreaterThan(html.indexOf('Your Hand'));
  });

  it('online from seat 1: the friend by name, their hand as backs only — no card of theirs in the page', () => {
    const real = state;
    const viewer = 1 as const;
    const { public: pub, private: priv } = splitState(real, viewer);
    const board = toBoardState(pub, priv, viewer);
    const html = render(board, {
      viewer,
      responder: pub.waitingOnPlayer ?? pub.currentPlayer,
      labels: ['sam_trader', 'You'],
      opponent: { kind: 'human', name: 'sam_trader', avatarUrl: null, presence: null, presenceElapsedMs: 0 },
    });
    expect(html).toContain('sam_trader');
    expect(html).toContain('Your Hand');
    expect(html).toContain(`${real.players[0].hand.length} cards`);
    expect(html).not.toContain(HIDDEN_CARD_ID);
    // your own hand is face up; theirs is a fan of backs
    expect(html.match(/class="hand-card"/g)).toHaveLength(real.players[1].hand.length);
    for (const id of real.players[1].hand) expect(html).toContain(`/assets/cards/${getCard(id).designId}.png`);
    const visibleDesigns = new Set([...real.players[1].hand, ...real.discardPile].map((id) => getCard(id).designId));
    for (const id of real.players[0].hand) {
      const design = getCard(id).designId;
      if (!visibleDesigns.has(design)) expect(html).not.toContain(`/assets/cards/${design}.png`);
    }
  });
});
