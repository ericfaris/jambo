import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { describeTrailTag } from '../../src/ui/uiHints.ts';

describe('center-row action tag names the real play', () => {
  it('a buy is not "discarded a card" (2026-10-11 review)', () => {
    const recent = [
      { action: 'PLAY_WARE_BUY', card: 'ware_3k_1', details: 'Bought wares for 3g via ware_3k_1' },
      { action: 'RAIN_MAKER_WINDOW', details: 'Opponent may play Rain Maker' },
    ];
    expect(describeTrailTag('discard', 'You', recent)).toBe('You bought with Trinket Stall');
  });

  it('names sells, people, animals, stands and reactions', () => {
    expect(describeTrailTag('discard', 'Opponent', [{ action: 'PLAY_WARE_SELL', card: 'ware_3k_1' }])).toBe('Opponent sold with Trinket Stall');
    expect(describeTrailTag('discard', 'Opponent', [{ action: 'PLAY_ANIMAL', card: 'parrot_1' }])).toBe('Opponent played Parrot');
    expect(describeTrailTag('discard', 'You', [{ action: 'PLAY_STAND', card: 'small_market_stand_1' }])).toBe('You built a market stand');
    expect(describeTrailTag('discard', 'You', [{ action: 'GUARD_PLAYED', card: 'guard_1' }])).toBe('You played Guard');
  });

  it('a drawn card discarded face-up is named; anything unknown stays generic', () => {
    expect(describeTrailTag('discard', 'Opponent', [{ action: 'DISCARD_DRAWN', details: 'Discarded parrot_2' }])).toBe('Opponent discarded Parrot');
    expect(describeTrailTag('discard', 'You', [{ action: 'KETTLE_EFFECT' }])).toBe('You discarded a card');
    expect(describeTrailTag('draw', 'Opponent', [{ action: 'PLAY_ANIMAL', card: 'parrot_1' }])).toBe('Opponent drew a card');
  });

  it('only looks at the last few entries, never naming an old play', () => {
    const old = [{ action: 'PLAY_ANIMAL', card: 'parrot_1' }, { action: 'A' }, { action: 'B' }, { action: 'C' }, { action: 'D' }];
    expect(describeTrailTag('discard', 'You', old)).toBe('You discarded a card');
  });
});

describe('short phones keep resolve-panel controls on screen', () => {
  it('shrinks the source card on short screens and phones (Dancer Confirm was off-screen on 360×640)', () => {
    const css = readFileSync('src/index.css', 'utf8');
    const short = css.slice(css.indexOf('@media (max-height: 760px)'));
    expect(short).toMatch(/\.resolve-panel-with-card\s*{\s*--resolve-card-w: clamp\(110px/);
    const phone = css.slice(css.indexOf('@media (max-width: 600px)'));
    expect(phone).toMatch(/\.resolve-panel-with-card\s*{\s*--resolve-card-w: 84px;/);
  });
});
