import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { HandDisplay, MAX_READABLE_OVERLAP_RATIO, SCROLL_HAND_SIZE, fanOverlapPx } from '../../src/ui/HandDisplay.tsx';
import { createTestState } from '../helpers/testHelpers.ts';

describe('HandDisplay with large hands (no hand limit)', () => {
  const deck = createTestState().deck;

  it('scrolls sideways instead of squeezing a 20-card hand', () => {
    const html = renderToStaticMarkup(createElement(HandDisplay, { hand: deck.slice(0, 20) }));
    expect(html).toContain('overflow-x:auto');
    expect(html).toContain('20 cards in hand');
    // overlap is capped at half a card (140px card → -70px margins)
    expect(html).toContain(`margin-left:-${140 * MAX_READABLE_OVERLAP_RATIO}px`);
    expect(html).not.toMatch(/margin-left:-(?:7[1-9]|[89]\d|1\d\d)(?:\.\d+)?px/);
  });

  it('keeps small hands centered with no count badge', () => {
    const html = renderToStaticMarkup(createElement(HandDisplay, { hand: deck.slice(0, 5) }));
    expect(html).toContain('justify-content:center');
    expect(html).not.toContain('cards in hand');
    expect(SCROLL_HAND_SIZE).toBeGreaterThan(5);
  });
});

describe('fanOverlapPx — the desktop fan uses the width it actually has', () => {
  it('a 12-card hand on a wide mat overlaps only as much as it must (it used to sit half-covered)', () => {
    const overlap = fanOverlapPx(12, 140, 10, 1270);
    expect(overlap).toBeGreaterThan(0);
    expect(overlap).toBeLessThan(140 * MAX_READABLE_OVERLAP_RATIO);
    // the whole hand fits the mat
    expect(12 * 140 + 11 * 10 - 11 * overlap).toBeLessThanOrEqual(1270);
  });

  it('a 9-card hand that fits needs no overlap at all', () => {
    expect(fanOverlapPx(9, 140, 10, 1400)).toBe(0);
  });

  it('never covers more than half a card, and falls back to 600px before measuring', () => {
    expect(fanOverlapPx(20, 140, 10, 900)).toBe(140 * MAX_READABLE_OVERLAP_RATIO);
    expect(fanOverlapPx(12, 140, 10, 0)).toBe(140 * MAX_READABLE_OVERLAP_RATIO);
  });

  it('scales with the card size (short desktops shrink cards)', () => {
    expect(fanOverlapPx(20, 140 * 0.76, 10, 900)).toBeCloseTo(140 * 0.76 * MAX_READABLE_OVERLAP_RATIO);
  });
});
