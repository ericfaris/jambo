import { describe, it, expect, afterEach } from 'vitest';
import {
  DIFFICULTY_BLEND, blendRoll, getAiActionByDifficulty, getHardAiAction, getMediumAiAction,
} from '../../src/ai/difficulties/index.ts';
import { validateAction } from '../../src/engine/validation/actionValidator.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import { getResponder } from '../../src/engine/responder.ts';
import { createTestState, toPlayPhase } from '../helpers/testHelpers.ts';
import { wilson, logit } from '../../scripts/ai-ladder.ts';

const shipped = { ...DIFFICULTY_BLEND };
afterEach(() => Object.assign(DIFFICULTY_BLEND, shipped));

describe('difficulty ladder blend', () => {
  it('ships a small, non-zero blend for the two middle levels only', () => {
    expect(shipped.medium).toBeGreaterThan(0);
    expect(shipped.medium).toBeLessThan(0.5);
    expect(shipped.hard).toBeGreaterThan(0);
    expect(shipped.hard).toBeLessThan(0.25);
  });

  it('rolls the same for the same state (reproducible benchmarks and replays)', () => {
    const s = toPlayPhase(createTestState(7));
    expect(blendRoll(s)).toBe(blendRoll({ ...s }));
    const later = { ...s, log: [...s.log, { turn: s.turn, player: 0 as const, action: 'X' }] };
    expect(blendRoll(later)).not.toBe(blendRoll(s));
    expect(blendRoll(s)).toBeGreaterThanOrEqual(0);
    expect(blendRoll(s)).toBeLessThan(1);
  });

  it('routes a blended decision to the neighbouring level', () => {
    const s = toPlayPhase(createTestState(11));
    DIFFICULTY_BLEND.medium = 1;
    expect(getAiActionByDifficulty(s, 'medium')).toEqual(getHardAiAction(s));
    DIFFICULTY_BLEND.medium = 0;
    expect(getAiActionByDifficulty(s, 'medium')).toEqual(getMediumAiAction(s));
    DIFFICULTY_BLEND.hard = 1;
    expect(getAiActionByDifficulty(s, 'hard')).toEqual(getMediumAiAction(s));
  });

  it('blended levels only ever make legal moves through a whole game', () => {
    let s = createTestState(4242);
    for (let step = 0; step < 1500 && s.phase !== 'GAME_OVER'; step++) {
      const action = getAiActionByDifficulty(s, getResponder(s) === 0 ? 'medium' : 'hard');
      expect(action).not.toBeNull();
      expect(validateAction(s, action!).valid).toBe(true);
      s = processAction(s, action!);
    }
    expect(s.phase).toBe('GAME_OVER');
  });
});

describe('ladder stats', () => {
  it('Wilson interval brackets the observed rate', () => {
    const [lo, hi] = wilson(320, 400);
    expect(lo).toBeLessThan(0.8);
    expect(hi).toBeGreaterThan(0.8);
    expect(hi - lo).toBeLessThan(0.1);
  });
  it('logit is symmetric and clamped', () => {
    expect(logit(0.5)).toBeCloseTo(0);
    expect(logit(0.8)).toBeCloseTo(-logit(0.2));
    expect(Number.isFinite(logit(1))).toBe(true);
  });
});
