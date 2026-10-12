import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { spotlightForEntry } from '../../src/ui/actionLog.ts';
import { spotlightHoldMs, SPOTLIGHT_TIMINGS } from '../../src/ui/OpponentPlaySpotlight.tsx';
import { UtilityArea } from '../../src/ui/UtilityArea.tsx';
import type { GameLogEntry } from '../../src/engine/types.ts';

const used = { turn: 3, player: 1, action: 'ACTIVATE_UTILITY', card: 'well_1' } as GameLogEntry;

describe('opponent uses a utility', () => {
  it('stays in place: nothing flies, since flying means placing or discarding', () => {
    expect(spotlightForEntry(used, 0, 'Baraka')?.destination).toBe('inPlace');
    // placing one still flies to the utility row
    expect(spotlightForEntry({ ...used, action: 'PLAY_UTILITY' }, 0, 'Baraka')?.destination).toBe('utilities');
  });

  it('holds long enough to turn and be seen turned', () => {
    const hold = spotlightHoldMs({ weight: 'routine', destination: 'inPlace' }, false);
    expect(hold).toBeGreaterThanOrEqual(SPOTLIGHT_TIMINGS.turnMs + SPOTLIGHT_TIMINGS.holdQueuedMs);
    // and no longer than a brand-new card's announcement
    expect(hold).toBeLessThanOrEqual(SPOTLIGHT_TIMINGS.holdMs + 100);
  });

  it('on the board, the used card stays upright while its spotlight is up, then turns', () => {
    const utilities = [{ cardId: 'well_1' as const, usedThisTurn: true }, { cardId: 'drums_1' as const, usedThisTurn: true }];
    const during = renderToStaticMarkup(createElement(UtilityArea, { utilities, disabled: true, untappedCardId: 'well_1' }));
    expect(during.match(/utility-card-tapped/g)).toHaveLength(1); // only drums
    const after = renderToStaticMarkup(createElement(UtilityArea, { utilities, disabled: true, untappedCardId: null }));
    expect(after.match(/utility-card-tapped/g)).toHaveLength(2);
  });
});
