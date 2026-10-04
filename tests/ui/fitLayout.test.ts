import { describe, it, expect } from 'vitest';
import { fitCardsToBox, fitMarketSlots, splitIntoRows, CARD_BASE_WIDTH } from '../../src/ui/fitLayout.ts';

/** Total footprint of a fit result, as HandDisplay's fitRows mode renders it. */
function footprint(r: ReturnType<typeof fitCardsToBox>, rowGap = 8) {
  const step = r.overlapPx > 0 ? r.cardWidth - r.overlapPx : r.cardWidth + r.gap;
  return {
    width: r.perRow > 0 ? r.cardWidth + (r.perRow - 1) * step : 0,
    height: r.rows * r.cardHeight + (r.rows - 1) * rowGap,
  };
}

// Phone hand boxes measured from the real PlayerScreen (iPhone SE / 14, Android 360)
const BOXES = [
  { width: 343, height: 300 },
  { width: 358, height: 470 },
  { width: 328, height: 380 },
];

describe('fitCardsToBox — phone player view never scrolls', () => {
  for (const box of BOXES) {
    for (let count = 1; count <= 24; count++) {
      it(`${count} cards fit in ${box.width}×${box.height}`, () => {
        const r = fitCardsToBox({ count, ...box, maxRows: 4 });
        const f = footprint(r);
        expect(r.rows * r.perRow).toBeGreaterThanOrEqual(count);
        expect(f.width).toBeLessThanOrEqual(box.width);
        expect(f.height).toBeLessThanOrEqual(box.height + 1); // CardFace rounds height
        // never bury more than the readable-overlap cap
        expect(r.overlapPx).toBeLessThanOrEqual(Math.ceil(r.cardWidth * 0.55));
      });
    }
  }

  it('at the legibility floor, overlaps harder instead of overflowing', () => {
    // 360×640 phone, 20 cards, two 21-slot markets: ~110px of hand height
    const box = { width: 328, height: 110 };
    const r = fitCardsToBox({ count: 20, ...box, maxRows: 4, maxScale: 1.3 });
    expect(r.scale).toBeCloseTo(0.3);
    expect(footprint(r).width).toBeLessThanOrEqual(box.width);
    expect(r.overlapPx).toBeLessThan(r.cardWidth); // every card still peeks out
  });

  it('caps small hands at maxScale instead of ballooning', () => {
    const r = fitCardsToBox({ count: 1, width: 1000, height: 1000, maxScale: 1.4 });
    expect(r.cardWidth).toBe(Math.floor(CARD_BASE_WIDTH * 1.4));
    expect(r.overlapPx).toBe(0);
  });

  it('prefers a layout where cards are not mostly buried', () => {
    // 5 cards in a tall box: 2 rows (3+2) beats one heavily overlapped row
    const r = fitCardsToBox({ count: 5, width: 343, height: 480, maxRows: 4 });
    expect(r.rows).toBeGreaterThan(1);
  });

  it('handles empty input and zero-size boxes (before first measure)', () => {
    expect(fitCardsToBox({ count: 0, width: 300, height: 300 }).perRow).toBe(0);
    // Unmeasured box → smallest cards, never the largest (that overflowed the
    // phone board when the measuring hook missed a late-mounted board)
    const unmeasured = fitCardsToBox({ count: 5, width: 0, height: 0, maxScale: 1.3, minScale: 0.3 });
    expect(unmeasured.scale).toBe(0.3);
    expect(unmeasured.scale).toBeLessThan(1);
  });
});

describe('splitIntoRows', () => {
  it('fills rows in order, earlier rows get the extra card', () => {
    expect(splitIntoRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2, 3], [4, 5]]);
    expect(splitIntoRows([1, 2, 3], 1)).toEqual([[1, 2, 3]]);
    expect(splitIntoRows([], 3)).toEqual([]);
  });
});

describe('fitMarketSlots', () => {
  it('keeps the starting 6-slot market on one row at full size', () => {
    expect(fitMarketSlots(6, 328)).toEqual({ columns: 6, rows: 1, slotSize: 32 });
  });

  it.each([6, 9, 12, 15, 18, 21])('%i slots fit 328px wide without shrinking below 24px', (n) => {
    const r = fitMarketSlots(n, 328);
    expect(r.columns * r.rows).toBeGreaterThanOrEqual(n);
    expect(r.columns * r.slotSize + (r.columns - 1) * 4).toBeLessThanOrEqual(328);
    expect(r.slotSize).toBeGreaterThanOrEqual(24);
  });
});
