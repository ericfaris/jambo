import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SeatInfo } from '../../src/ui/SeatInfo.tsx';

describe('SeatInfo (the shared you / opponent block)', () => {
  it('shows gold, the card count and a fan of that many card backs', () => {
    const html = renderToStaticMarkup(createElement(SeatInfo, { seat: 0, label: 'You · your turn', gold: 52, handCount: 5, isActive: true }));
    expect(html).toContain('You · your turn');
    expect(html).toContain('aria-label="52 gold"');
    expect(html).toContain('5 cards');
    expect(html.match(/opp-hand-card/g)).toHaveLength(5);
    expect(html).toContain('opp-hand-fan-thinking');
  });

  it('only the opponent fan is a card-flight target; yours land on your real hand', () => {
    const yours = renderToStaticMarkup(createElement(SeatInfo, { seat: 0, label: 'You', gold: 20, handCount: 1 }));
    expect(yours).not.toContain('data-hand-anchor');
    expect(yours).toContain('1 card<');
    const theirs = renderToStaticMarkup(createElement(SeatInfo, { seat: 1, label: 'Baraka', gold: 20, handCount: 3, handAnchor: true }));
    expect(theirs).toContain('data-hand-anchor="1"');
  });
});
