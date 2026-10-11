import { describe, it, expect } from 'vitest';
import { aiActionDelayMs, parseAiSpeed, AI_SPEEDS, AI_BASE_DELAY_MS } from '../../src/ui/gameScreenLogic.ts';
import { spotlightDurationMs, spotlightBlockingMs, spotlightHoldMs, SPOTLIGHT_TIMINGS } from '../../src/ui/OpponentPlaySpotlight.tsx';
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

describe('busy AI turns', () => {
  it('a 4-play turn (new card, two trades, a utility re-use, two choices) stays under 13s', () => {
    const turn = ['DRAW_CARD', 'KEEP_CARD', 'PLAY_CARD', 'RESOLVE_INTERACTION', 'PLAY_CARD', 'PLAY_CARD', 'ACTIVATE_UTILITY', 'RESOLVE_INTERACTION', 'END_TURN'];
    const pauses = turn.reduce((ms, t) => ms + aiActionDelayMs(t), 0);
    const spotlights = spotlightBlockingMs({}) + 2 * spotlightBlockingMs({ weight: 'trade' }) + spotlightBlockingMs({ weight: 'routine' });
    expect(pauses + spotlights).toBeLessThan(13_000); // was ~16-20s measured
  });

  it('holds scale with how newsworthy the play is', () => {
    expect(spotlightHoldMs({ weight: 'routine' }, false)).toBeLessThan(spotlightHoldMs({ weight: 'trade' }, false));
    expect(spotlightHoldMs({ weight: 'trade' }, false)).toBeLessThan(spotlightHoldMs({}, false));
    expect(spotlightHoldMs({}, true)).toBe(SPOTLIGHT_TIMINGS.holdQueuedMs);
  });

  it('the AI is released as the card starts to fly off, not after it lands', () => {
    expect(spotlightBlockingMs({})).toBe(spotlightDurationMs(false) - SPOTLIGHT_TIMINGS.exitMs);
  });
});
