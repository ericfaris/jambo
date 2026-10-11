import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { coinTossRotation, COIN_TOSS_TIMINGS, FirstPlayerReveal } from '../../src/ui/FirstPlayerReveal.tsx';
import { shouldSweepTurn, TurnSweep } from '../../src/ui/TurnSweep.tsx';
import { UtilityArea } from '../../src/ui/UtilityArea.tsx';
import { createTestState } from '../helpers/testHelpers.ts';

describe('coin toss first-player reveal', () => {
  it('lands on the first player’s face after whole turns', () => {
    expect(coinTossRotation(0) % 360).toBe(0);
    expect(coinTossRotation(1) % 360).toBe(180);
    expect(coinTossRotation(1)).toBeGreaterThan(720);
  });

  it('reveals the line only after the coin lands, and finishes in under 3.5s', () => {
    expect(COIN_TOSS_TIMINGS.revealAt).toBeGreaterThanOrEqual(COIN_TOSS_TIMINGS.spinMs);
    expect(COIN_TOSS_TIMINGS.doneAt).toBeLessThan(3500);
  });

  it('names the faces for solo and hotseat', () => {
    const solo = renderToStaticMarkup(createElement(FirstPlayerReveal, { firstPlayer: 1, onComplete: () => {} }));
    expect(solo).toContain('Opponent goes first');
    expect(solo).toContain('>AI<');
    const hot = renderToStaticMarkup(createElement(FirstPlayerReveal, { firstPlayer: 0, onComplete: () => {}, localMultiplayer: true }));
    expect(hot).toContain('Player 1 goes first');
    expect(hot).toContain('>P2<');
  });
});

describe('"Your turn" sweep', () => {
  const s = (currentPlayer: 0 | 1, turn: number, extra: object = {}) => ({ currentPlayer, turn, phase: 'DRAW' as const, endgame: null, ...extra });

  it('sweeps on a live hand-over to the viewer', () => {
    expect(shouldSweepTurn(s(1, 3), s(0, 4), 0)).toBe(true);
  });

  it('stays quiet on the opening turn, the opponent’s turn, the final turn and game over', () => {
    expect(shouldSweepTurn(null, s(0, 0), 0)).toBe(false);
    expect(shouldSweepTurn(s(1, 0), s(0, 0), 0)).toBe(false);
    expect(shouldSweepTurn(s(0, 3), s(1, 4), 0)).toBe(false);
    expect(shouldSweepTurn(s(1, 3), s(0, 4, { endgame: { triggerPlayer: 1, finalTurnPlayer: 0, isFinalTurn: true } }), 0)).toBe(false);
    expect(shouldSweepTurn(s(1, 3), s(0, 4, { phase: 'GAME_OVER' }), 0)).toBe(false);
  });

  it('renders nothing on mount (a resumed game is not announced)', () => {
    expect(renderToStaticMarkup(createElement(TurnSweep, { state: createTestState(), viewer: 0 }))).toBe('');
  });
});

describe('used utilities are tapped, not hidden', () => {
  it('rotates a used utility and keeps its art, with a small Used pill', () => {
    const html = renderToStaticMarkup(createElement(UtilityArea, {
      utilities: [
        { cardId: 'well_1', designId: 'well', usedThisTurn: true },
        { cardId: 'drums_1', designId: 'drums', usedThisTurn: false },
      ],
    }));
    expect(html.match(/utility-card-tapped/g)).toHaveLength(1);
    expect(html.match(/utility-used-pill/g)).toHaveLength(1);
    expect(html).toContain('/assets/cards/well.png');
    expect(html).not.toContain('rgba(20,10,5,0.7)');
  });
});
