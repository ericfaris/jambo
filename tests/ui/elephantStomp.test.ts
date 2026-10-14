import { beforeEach, describe, expect, it } from 'vitest';
import { claimElephantStomp, elephantDropSchedule, isFreshElephantDraft, resetElephantStompForTests, scheduleElephantStomp, stompDelayAfterTrumpet, stompLockRemaining, TRUMPET_LEAD_MS, wareDropKeyframes } from '../../src/ui/elephantStomp.ts';
import type { PendingResolution } from '../../src/engine/types.ts';

type Draft = Extract<PendingResolution, { type: 'DRAFT' }>;
const draft = (over: Partial<Draft> = {}): Draft => ({
  type: 'DRAFT', sourceCard: 'elephant_1', draftMode: 'wares',
  availableWares: ['tea', 'salt', 'silk', 'hides'], availableCards: [], currentPicker: 0, picks: [[], []],
  ...over,
});

describe('Elephant stomp', () => {
  beforeEach(() => resetElephantStompForTests());

  it('only a ware draft nobody has picked from yet stomps', () => {
    expect(isFreshElephantDraft(draft())).toBe(true);
    expect(isFreshElephantDraft(draft({ picks: [['tea'], []] }))).toBe(false);
    expect(isFreshElephantDraft(draft({ availableWares: [] }))).toBe(false);
    expect(isFreshElephantDraft(draft({ draftMode: 'cards', sourceCard: 'ape_1' }))).toBe(false);
  });

  it('stomps once per draft, not on every re-render or remount', () => {
    expect(claimElephantStomp(draft(), 1000)).toBe(true);
    expect(claimElephantStomp(draft(), 1200)).toBe(false);
    expect(claimElephantStomp(draft({ picks: [['tea'], []] }), 1300)).toBe(false);
  });

  it('a later Elephant stomps again, even the same card after a cancel', () => {
    expect(claimElephantStomp(draft(), 1000)).toBe(true);
    expect(claimElephantStomp(draft(), 60_000)).toBe(true);
    expect(claimElephantStomp(draft({ availableWares: ['fruit'] }), 60_100)).toBe(true);
  });

  it('every ware goes up together, then lands one by one in slot order', () => {
    const drops = elephantDropSchedule(5);
    expect(new Set(drops.map((d) => d.tossStart)).size).toBe(1);
    for (let i = 1; i < drops.length; i++) {
      expect(drops[i].fallStart).toBeGreaterThan(drops[i - 1].fallStart);
      expect(drops[i].land).toBeGreaterThan(drops[i - 1].land);
    }
    for (const d of drops) expect(d.fallStart).toBeGreaterThan(d.tossEnd);
    // a full 18-ware pool still settles in a few seconds
    expect(elephantDropSchedule(18).at(-1)!.land).toBeLessThan(4000);
  });

  it('keyframes are valid for the Web Animations API (sorted offsets in 0..1, ending at rest)', () => {
    elephantDropSchedule(12).forEach((drop, i) => {
      const frames = wareDropKeyframes(drop, i);
      const offsets = frames.map((f) => f.offset as number);
      expect(offsets[0]).toBe(0);
      expect(offsets.at(-1)).toBe(1);
      for (let k = 1; k < offsets.length; k++) expect(offsets[k]).toBeGreaterThanOrEqual(offsets[k - 1]);
      expect(frames.at(-1)).toMatchObject({ transform: 'translate(0, 0) scale(1)', opacity: 1 });
    });
  });
});

describe('Elephant: trumpet first, then the stomp', () => {
  it('waits out the trumpet that just started', () => {
    expect(stompDelayAfterTrumpet(0)).toBe(TRUMPET_LEAD_MS);
    expect(stompDelayAfterTrumpet(400)).toBe(TRUMPET_LEAD_MS - 400);
  });

  it('stomps at once when the trumpet already finished (a long spotlight)', () => {
    expect(stompDelayAfterTrumpet(TRUMPET_LEAD_MS + 1)).toBe(0);
    expect(stompDelayAfterTrumpet(3000)).toBe(0);
  });

  it('no trumpet heard yet (it rides in with the same online state): full lead', () => {
    expect(stompDelayAfterTrumpet(Infinity)).toBe(TRUMPET_LEAD_MS);
    expect(stompDelayAfterTrumpet(60_000)).toBe(TRUMPET_LEAD_MS); // an earlier game's trumpet
  });
});

describe('scheduleElephantStomp', () => {
  beforeEach(() => resetElephantStompForTests());

  function fakeStage(tokenCount: number) {
    const sounds: string[] = [];
    const animated: number[] = [];
    let shook = 0;
    const tokens = Array.from({ length: tokenCount }, (_, i) => ({ animate: () => { animated.push(i); } }) as unknown as HTMLElement);
    const stage = {
      sound: (e: string) => { sounds.push(e); },
      pool: () => tokens,
      shake: () => ({ animate: () => { shook++; } }) as unknown as HTMLElement,
    };
    return { stage, sounds, animated, shook: () => shook };
  }

  it('waits for the trumpet, then stomps, shakes, and drops every ware with a tap each', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
      const { stage, sounds, animated, shook } = fakeStage(3);
      scheduleElephantStomp(1000, true, stage);
      expect(stompLockRemaining()).toBeGreaterThan(1000); // picks locked through the wait
      vi.advanceTimersByTime(999);
      expect(sounds).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(sounds).toEqual(['elephant-stomp']);
      expect(shook()).toBe(1);
      expect(animated).toEqual([0, 1, 2]);
      vi.advanceTimersByTime(5000);
      expect(sounds.filter((e) => e === 'ware-land')).toHaveLength(3);
      expect(stompLockRemaining()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reduced motion: the stomp sound only, nothing locked', async () => {
    const { vi } = await import('vitest');
    vi.useFakeTimers();
    try {
      const { stage, sounds, animated, shook } = fakeStage(3);
      scheduleElephantStomp(500, false, stage);
      expect(stompLockRemaining()).toBe(0);
      vi.advanceTimersByTime(3000);
      expect(sounds).toEqual(['elephant-stomp']);
      expect(animated).toEqual([]);
      expect(shook()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
