import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { HandDisplay, MAX_READABLE_OVERLAP_RATIO, SCROLL_HAND_SIZE } from '../../src/ui/HandDisplay.tsx';
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
