import { describe, it, expect } from 'vitest';
import { cornerButtonInset } from '../../src/ui/cornerClearance.ts';

describe('cornerButtonInset (opponent block vs the fixed profile button)', () => {
  it('needs no inset on a wide screen, where the panel ends left of the button', () => {
    // 1920 wide board centered with a wide margin: content ends well before the button
    expect(cornerButtonInset({ top: 10, right: 1800 }, 1920)).toBe(0);
  });

  it('steps in just enough to clear the button when the panel runs under it', () => {
    // panel content ends at 1258-17 = 1241; button's left (with gap) = 1280-16-42-8 = 1214
    expect(cornerButtonInset({ top: 16, right: 1258 }, 1280)).toBe(27);
  });

  it('needs no inset when the panel starts below the button', () => {
    expect(cornerButtonInset({ top: 60, right: 1258 }, 1280)).toBe(0);
  });
});
