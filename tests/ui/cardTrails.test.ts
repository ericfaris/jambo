import { describe, it, expect } from 'vitest';
import { trailEndpoints, spotlightCoversDiscard, measureTrailPath } from '../../src/ui/trailPath.ts';
import { spotlightTargetSelectors, spotlightOriginSelectors } from '../../src/ui/OpponentPlaySpotlight.tsx';
import { spotlightForEntry } from '../../src/ui/actionLog.ts';
import type { GameLogEntry } from '../../src/engine/types.ts';

describe('card trails start and end on real places', () => {
  it('a draw flies from the deck to the drawing player’s hand (the AI’s fan for the AI)', () => {
    expect(trailEndpoints({ kind: 'draw', actor: 1 })).toEqual({ from: '[data-deck-anchor]', to: '[data-hand-anchor="1"]' });
    expect(trailEndpoints({ kind: 'draw', actor: 0 })).toEqual({ from: '[data-deck-anchor]', to: '[data-hand-anchor="0"]' });
  });

  it('a discard flies from the actor’s hand, or their utility row, to the discard pile', () => {
    expect(trailEndpoints({ kind: 'discard', actor: 1, source: 'hand' })).toEqual({ from: '[data-hand-anchor="1"]', to: '[data-spotlight-target="discard"]' });
    expect(trailEndpoints({ kind: 'discard', actor: 1, source: 'utilities' }).from).toBe('[data-utility-anchor="1"]');
  });

  it('skips the trail when the spotlight already flies that play to the discard', () => {
    expect(spotlightCoversDiscard({ card: 'guard_1', player: 1 }, 1)).toBe(true);
    expect(spotlightCoversDiscard({ card: undefined, player: 1 }, 1)).toBe(false); // e.g. AI discarding its drawn card
    expect(spotlightCoversDiscard({ card: 'guard_1', player: 0 }, 1)).toBe(false); // your own play
    expect(spotlightCoversDiscard({ card: 'guard_1', player: 1 }, null)).toBe(false); // hotseat: no spotlight
  });

  it('measures both ends relative to the row, so the first frame starts on the deck', () => {
    const rect = (left: number, top: number, w: number, h: number) => ({ left, top, width: w, height: h }) as DOMRect;
    const doc = {
      querySelector: (sel: string) => ({
        '[data-deck-anchor]': { getBoundingClientRect: () => rect(400, 300, 100, 140) },
        '[data-hand-anchor="1"]': { getBoundingClientRect: () => rect(1200, 100, 100, 50) },
      } as Record<string, unknown>)[sel] ?? null,
    } as unknown as Document;
    const path = measureTrailPath({ kind: 'draw', actor: 1 }, rect(0, 250, 1000, 200), doc);
    expect(path).toEqual({ startX: -50, startY: 20, endX: 750, endY: -225 });
    // an anchor that isn't on screen: no trail rather than a guessed one
    expect(measureTrailPath({ kind: 'draw', actor: 0 }, rect(0, 250, 1000, 200), doc)).toBeNull();
  });
});

describe('opponent spotlight grows from, and lands on, the right place', () => {
  const entry = (action: string, card = 'well_1') => ({ turn: 3, player: 1, action, card }) as GameLogEntry;

  it('a played card comes out of their hand; a used utility from their utility row; a Supplies find from the deck', () => {
    expect(spotlightForEntry(entry('PLAY_PEOPLE', 'guard_1'), 0, 'Amara')?.origin ?? 'hand').toBe('hand');
    expect(spotlightForEntry(entry('ACTIVATE_UTILITY'), 0, 'Amara')?.origin).toBe('utilities');
    expect(spotlightForEntry(entry('SUPPLIES_DRAW', 'ware_3k_1'), 0, 'Amara')?.origin).toBe('deck');
    expect(spotlightOriginSelectors('hand', 1)[0]).toBe('[data-hand-anchor="1"]');
    expect(spotlightOriginSelectors('utilities', 1)[0]).toBe('[data-utility-anchor="1"]');
    expect(spotlightOriginSelectors('deck', 1)).toEqual(['[data-deck-anchor]']);
  });

  it('a card kept in hand lands on their hand fan, a placed utility on their utility row', () => {
    expect(spotlightTargetSelectors('hand', 1)[0]).toBe('[data-hand-anchor="1"]');
    expect(spotlightTargetSelectors('utilities', 1)[0]).toBe('[data-utility-anchor="1"]');
    expect(spotlightTargetSelectors('discard', 1)).toEqual(['[data-spotlight-target="discard"]']);
    expect(spotlightTargetSelectors('inPlace', 1)).toEqual([]);
  });
});

describe('flying cards are real card faces, not bare art', () => {
  it('the center-row discard trail renders a CardFace (frame + name)', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { CenterRow } = await import('../../src/ui/CenterRow.tsx');
    const { createTestState } = await import('../helpers/testHelpers.ts');
    const s = createTestState();
    // the trail needs measured endpoints, which SSR can't do — so check the source instead
    const html = renderToStaticMarkup(createElement(CenterRow, { state: s, dispatch: () => {}, actorLabels: ['You', 'Baraka'] }));
    expect(html).not.toContain('center-row-trail');
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../src/ui/CenterRow.tsx', import.meta.url), 'utf-8');
    const trail = src.slice(src.indexOf('center-row-trail center-row-trail-'), src.indexOf('{actionTag && ('));
    expect(trail).toContain('<CardFace');
    expect(trail).not.toContain('<img');
    const layer = readFileSync(new URL('../../src/ui/FlightLayer.tsx', import.meta.url), 'utf-8');
    const sprite = layer.slice(layer.indexOf("flight.kind === 'card'"));
    expect(sprite).toContain('<CardFace');
    expect(sprite.split('\n').slice(0, 4).join('\n')).not.toContain('<img');
  });
});
