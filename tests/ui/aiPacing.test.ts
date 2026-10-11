import { describe, it, expect } from 'vitest';
import { aiActionDelayMs, parseAiSpeed, AI_SPEEDS, AI_BASE_DELAY_MS } from '../../src/ui/gameScreenLogic.ts';
import { spotlightDurationMs } from '../../src/ui/OpponentPlaySpotlight.tsx';
import { CONSTANTS } from '../../src/engine/types.ts';

describe('AI pacing', () => {
  it('hidden moves are quicker than face-up plays', () => {
    expect(aiActionDelayMs('DRAW_CARD')).toBeLessThan(aiActionDelayMs('PLAY_CARD'));
    expect(aiActionDelayMs('KEEP_CARD')).toBe(AI_BASE_DELAY_MS.hidden);
    expect(aiActionDelayMs('RESOLVE_INTERACTION')).toBe(AI_BASE_DELAY_MS.choice);
  });

  it('every action is faster than the old flat 3s delay at Normal', () => {
    for (const t of ['DRAW_CARD', 'KEEP_CARD', 'PLAY_CARD', 'ACTIVATE_UTILITY', 'RESOLVE_INTERACTION', 'GUARD_REACTION', 'END_TURN']) {
      expect(aiActionDelayMs(t)).toBeLessThan(CONSTANTS.AI_ACTION_DELAY_MS);
    }
  });

  it('speed setting orders brisk < normal < relaxed', () => {
    expect(aiActionDelayMs('PLAY_CARD', 'brisk')).toBeLessThan(aiActionDelayMs('PLAY_CARD', 'normal'));
    expect(aiActionDelayMs('PLAY_CARD', 'normal')).toBeLessThan(aiActionDelayMs('PLAY_CARD', 'relaxed'));
  });

  it('a typical AI turn takes under 10s at Normal (was 15–20s)', () => {
    // draw, keep, play a person (spotlit) + resolve it, play a ware (spotlit), end turn
    const turn = ['DRAW_CARD', 'KEEP_CARD', 'PLAY_CARD', 'RESOLVE_INTERACTION', 'PLAY_CARD', 'END_TURN'];
    const pauses = turn.reduce((ms, t) => ms + aiActionDelayMs(t), 0);
    const spotlights = 2 * spotlightDurationMs(false);
    expect(pauses + spotlights).toBeLessThan(10_000);
  });

  it('parses stored values defensively', () => {
    expect(AI_SPEEDS.map(parseAiSpeed)).toEqual(['relaxed', 'normal', 'brisk']);
    expect(parseAiSpeed('ludicrous')).toBe('normal');
    expect(parseAiSpeed(null)).toBe('normal');
  });
});
