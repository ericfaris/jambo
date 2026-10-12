import { describe, it, expect } from 'vitest';
import { aiActionDelayMs, parseAiSpeed, AI_SPEEDS, AI_BASE_DELAY_MS, quoteForSpotlight } from '../../src/ui/gameScreenLogic.ts';
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

  // Budgets re-set 2026-10-12 when every AI pause got +300ms on purpose
  // ("a little more time to breathe"); they still catch accidental creep.
  it('every AI pause is 300ms longer than the old pacing', () => {
    expect(AI_BASE_DELAY_MS).toEqual({ hidden: 1050, choice: 1300, play: 1200, endTurn: 1100 });
  });

  it('a typical AI turn takes under 11.5s at Normal (was 15–20s before pacing work)', () => {
    // draw, keep, play a person (spotlit) + resolve it, play a ware (spotlit), end turn
    const turn = ['DRAW_CARD', 'KEEP_CARD', 'PLAY_CARD', 'RESOLVE_INTERACTION', 'PLAY_CARD', 'END_TURN'];
    const pauses = turn.reduce((ms, t) => ms + aiActionDelayMs(t), 0);
    const spotlights = 2 * spotlightDurationMs(false);
    expect(pauses + spotlights).toBeLessThan(11_500);
  });

  it('parses stored values defensively', () => {
    expect(AI_SPEEDS.map(parseAiSpeed)).toEqual(['relaxed', 'normal', 'brisk']);
    expect(parseAiSpeed('ludicrous')).toBe('normal');
    expect(parseAiSpeed(null)).toBe('normal');
  });
});

describe('busy AI turns', () => {
  it('a 4-play turn (new card, two trades, a utility re-use, two choices) stays under 16s', () => {
    const turn = ['DRAW_CARD', 'KEEP_CARD', 'PLAY_CARD', 'RESOLVE_INTERACTION', 'PLAY_CARD', 'PLAY_CARD', 'ACTIVATE_UTILITY', 'RESOLVE_INTERACTION', 'END_TURN'];
    const pauses = turn.reduce((ms, t) => ms + aiActionDelayMs(t), 0);
    const spotlights = spotlightBlockingMs({}) + 2 * spotlightBlockingMs({ weight: 'trade' }) + spotlightBlockingMs({ weight: 'routine' });
    expect(pauses + spotlights).toBeLessThan(16_000); // ~15.1s with the +300ms pauses; was ~16-20s measured originally
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

describe('trader quotes on the spotlight', () => {
  it('captions a line said about the card on screen, never a leftover one', () => {
    const line = { text: 'Ahh. The sweet smell of profit.', at: 10_000 };
    expect(quoteForSpotlight(line, 9_800)).toBe(line.text); // said just after it arrived
    expect(quoteForSpotlight(line, 10_500)).toBe(line.text); // a beat ahead of the card
    expect(quoteForSpotlight(line, 14_000)).toBeNull(); // from an earlier moment
    expect(quoteForSpotlight(line, null)).toBeNull();
    expect(quoteForSpotlight(null, 10_000)).toBeNull();
  });
});
