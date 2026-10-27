// The board pieces work from either seat (online, you may be seat 1) — and
// seat 0 (solo) renders exactly as before.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CenterRow } from '../../src/ui/CenterRow.tsx';
import { EndgameOverlay } from '../../src/ui/EndgameOverlay.tsx';
import { GoldChart } from '../../src/ui/GoldChart.tsx';
import { FirstPlayerReveal } from '../../src/ui/FirstPlayerReveal.tsx';
import { PlayerAvatar } from '../../src/ui/PlayerAvatar.tsx';
import { getPlayDisabledReason, getDrawDisabledReason } from '../../src/ui/uiHints.ts';
import type { VisualFeedbackState, FeedbackTrail } from '../../src/ui/useVisualFeedback.ts';
import { createTestState } from '../helpers/testHelpers.ts';
import type { GameState } from '../../src/engine/types.ts';

const noop = () => {};
const feedback = (actor: 0 | 1): VisualFeedbackState => ({
  deckPulse: 1, discardPulse: 1, actionsPulse: 0, phasePulse: 0,
  marketFlashSlots: [[], []], goldDeltas: [0, 0],
  trail: { id: 1, kind: 'draw', actor } as FeedbackTrail,
});

describe('CenterRow: the opponent\'s moves are the strong ones, whichever seat you are', () => {
  const state = createTestState();
  const row = (actor: 0 | 1, viewer?: 0 | 1) => renderToStaticMarkup(createElement(CenterRow, {
    state, dispatch: noop, visualFeedback: feedback(actor), actorLabels: ['You', 'Baraka'], ...(viewer === undefined ? {} : { viewer }),
  }));
  it('seat 0: unchanged (viewer omitted = viewer 0)', () => {
    expect(row(1)).toBe(row(1, 0));
    expect(row(0)).toBe(row(0, 0));
    expect(row(1)).toContain('pile-pulse-strong');
    expect(row(0)).not.toContain('pile-pulse-strong');
  });
  it('seat 1: the friend at seat 0 is the opponent', () => {
    expect(row(0, 1)).toContain('pile-pulse-strong');
    expect(row(1, 1)).not.toContain('pile-pulse-strong');
  });
});

function finished(gold: [number, number]): GameState {
  const s = createTestState();
  return { ...s, phase: 'GAME_OVER', turn: 30, endgame: { triggerPlayer: 0, finalTurnPlayer: 1, isFinalTurn: false }, players: [{ ...s.players[0], gold: gold[0] }, { ...s.players[1], gold: gold[1] }] };
}

describe('EndgameOverlay from either seat', () => {
  const over = finished([64, 50]);
  const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(EndgameOverlay, { state: over, onRematch: noop, ...props }));
  it('seat 0 is unchanged: your column first', () => {
    expect(render({ labels: ['You', 'Baraka'] })).toBe(render({ labels: ['You', 'Baraka'], viewer: 0 }));
    const html = render({ labels: ['You', 'Baraka'], viewer: 0 });
    expect(html.indexOf('64g')).toBeLessThan(html.indexOf('50g'));
  });
  it('seat 1 sees its own score first, and the result from its side', () => {
    const html = render({ labels: ['sam', 'You'], viewer: 1 });
    expect(html.indexOf('50g')).toBeLessThan(html.indexOf('64g'));
    expect(html).toContain('sam wins!');
  });
  it('the quote is attributed to the opponent of the viewer', () => {
    expect(render({ labels: ['sam', 'You'], viewer: 1, opponentQuote: 'Good game' })).toContain('— sam');
  });
  it('shows the rematch status and can disable the rematch', () => {
    const html = render({ labels: ['sam', 'You'], viewer: 1, rematchStatus: 'Waiting for sam…', rematchDisabled: true });
    expect(html).toContain('endgame-rematch-status');
    expect(html).toContain('Waiting for sam…');
    expect(html).toMatch(/<button[^>]*class="primary"[^>]*disabled/);
    expect(render({ labels: ['You', 'Baraka'] })).not.toContain('endgame-rematch-status');
  });
});

describe('GoldChart from either seat', () => {
  const timeline = [{ turn: 0, gold: [20, 20] as [number, number] }, { turn: 5, gold: [40, 30] as [number, number] }];
  const chart = (viewer?: 0 | 1) => renderToStaticMarkup(createElement(GoldChart, { timeline, labels: ['A', 'B'], ...(viewer === undefined ? {} : { viewer }) }));
  it('seat 0 renders exactly as before', () => {
    expect(chart(0)).toBe(chart());
  });
  it('seat 1: your line gets the gold (seat-0) styling, the rival the teal one', () => {
    const html = chart(1);
    const yours = /<polyline points="([^"]+)" class="gold-chart-line gold-chart-line-0"/.exec(html)?.[1];
    const theirs = /<polyline points="([^"]+)" class="gold-chart-line gold-chart-line-1"/.exec(html)?.[1];
    const plain = chart();
    expect(yours).toBe(/<polyline points="([^"]+)" class="gold-chart-line gold-chart-line-1"/.exec(plain)?.[1]);
    expect(theirs).toBe(/<polyline points="([^"]+)" class="gold-chart-line gold-chart-line-0"/.exec(plain)?.[1]);
    expect(html.indexOf('gold-chart-key-0">B')).toBeGreaterThan(-1);
  });
});

describe('FirstPlayerReveal with names', () => {
  const reveal = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(FirstPlayerReveal, { onComplete: noop, ...props } as never));
  it('existing props keep today\'s output', () => {
    expect(reveal({ firstPlayer: 1 })).toContain('Opponent goes first');
    expect(reveal({ firstPlayer: 0 })).toContain('You go first');
  });
  it('online: names the friend and puts their initial on the coin', () => {
    expect(reveal({ firstPlayer: 0, viewer: 1, names: ['sam', 'You'] })).toContain('sam goes first');
    const mine = reveal({ firstPlayer: 1, viewer: 1, names: ['sam', 'You'] });
    expect(mine).toContain('You go first');
    expect(mine).toContain('>S<');
    expect(mine).toContain('>You<');
  });
});

describe('PlayerAvatar label', () => {
  it('defaults to "You", and can name a friend', () => {
    expect(renderToStaticMarkup(createElement(PlayerAvatar, { avatarUrl: null }))).toContain('aria-label="You"');
    expect(renderToStaticMarkup(createElement(PlayerAvatar, { avatarUrl: null, label: 'sam' }))).toContain('aria-label="sam"');
  });
});

describe('disabled reasons name the friend', () => {
  const base = { phase: 'PLAY' as const, currentPlayer: 0 as const, viewerPlayer: 0 as const, actionsLeft: 3, hasPendingInteraction: true, isAiTurn: true };
  it('default copy is unchanged', () => {
    expect(getPlayDisabledReason(base)).toBe('Opponent is resolving actions.');
    expect(getDrawDisabledReason({ phase: 'DRAW', currentPlayer: 0, viewerPlayer: 0, isAiTurn: true })).toBe('Opponent is resolving actions.');
  });
  it('online says who you are waiting for', () => {
    expect(getPlayDisabledReason({ ...base, opponentLabel: 'sam' })).toBe('Waiting for sam…');
    expect(getDrawDisabledReason({ phase: 'DRAW', currentPlayer: 0, viewerPlayer: 0, isAiTurn: true, opponentLabel: 'sam' })).toBe('Waiting for sam…');
  });
});
