import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { goldProgress, finalTurnNeed, finalTurnCopy, finalTurnStatus } from '../../src/ui/endgameHints.ts';
import { GoldTrack } from '../../src/ui/GoldTrack.tsx';
import { FinalTurnBanner } from '../../src/ui/FinalTurnBanner.tsx';
import { createTestState } from '../helpers/testHelpers.ts';
import type { GameState } from '../../src/engine/types.ts';

const LABELS = ['You', 'Opponent'] as const;

function finalTurn(trigger: 0 | 1, gold: [number, number]): GameState {
  const s = createTestState();
  const players = [{ ...s.players[0], gold: gold[0] }, { ...s.players[1], gold: gold[1] }] as GameState['players'];
  return { ...s, phase: 'PLAY', players, currentPlayer: trigger === 0 ? 1 : 0, endgame: { triggerPlayer: trigger, finalTurnPlayer: trigger === 0 ? 1 : 0, isFinalTurn: true } };
}

describe('race to 60', () => {
  it('progress is clamped to 0..1 of the 60g trigger', () => {
    expect(goldProgress(0)).toBe(0);
    expect(goldProgress(30)).toBe(0.5);
    expect(goldProgress(75)).toBe(1);
    expect(goldProgress(-3)).toBe(0);
  });

  it('track exposes progress to assistive tech and lights up at 60g', () => {
    const half = renderToStaticMarkup(createElement(GoldTrack, { gold: 30 }));
    expect(half).toContain('aria-valuenow="30"');
    expect(half).toContain('width:50%');
    expect(half).not.toContain('gold-track-reached');
    expect(renderToStaticMarkup(createElement(GoldTrack, { gold: 64 }))).toContain('gold-track-reached');
  });
});

describe('final turn', () => {
  it('the final-turn player needs to match the trigger player (they win ties)', () => {
    expect(finalTurnNeed(finalTurn(1, [41, 63]))).toEqual({ player: 0, need: 22 });
    expect(finalTurnNeed(finalTurn(1, [63, 63]))).toEqual({ player: 0, need: 0 });
    expect(finalTurnNeed({ ...finalTurn(1, [41, 63]), endgame: { triggerPlayer: 1, finalTurnPlayer: 0, isFinalTurn: false } })).toBeNull();
    expect(finalTurnNeed({ ...finalTurn(1, [41, 63]), phase: 'GAME_OVER' })).toBeNull();
  });

  it('speaks to the viewer on their final turn and about the opponent on theirs', () => {
    expect(finalTurnCopy(finalTurn(1, [41, 63]), LABELS)).toEqual({ headline: 'Your final turn', detail: 'Opponent reached 60g — you need 22g more to win' });
    expect(finalTurnCopy(finalTurn(0, [62, 50]), LABELS)).toEqual({ headline: "Opponent's final turn", detail: 'Opponent needs 12g more to catch you' });
    expect(finalTurnStatus(finalTurn(1, [41, 63]), LABELS)).toBe('Final turn · you need 22g');
    expect(finalTurnStatus(finalTurn(1, [70, 63]), LABELS)).toBe('Final turn · you’re winning');
    expect(finalTurnStatus(finalTurn(0, [62, 50]), ['Player 1', 'Player 2'])).toBe('Final turn · Player 2 needs 12g');
  });

  it('a game resumed already in its final turn is not re-announced', () => {
    const html = renderToStaticMarkup(createElement(FinalTurnBanner, { state: finalTurn(1, [41, 63]), labels: LABELS }));
    expect(html).toBe('');
  });
});
