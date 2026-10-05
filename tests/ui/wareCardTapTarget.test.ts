import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CardFace } from '../../src/ui/CardFace.tsx';

// Reported 2026-10-04: tapping a ware card "sometimes" showed the card with no
// Buy/Sell. The coin/pip strip was its own zoom button, so a tap on the coins
// opened the zoom view instead of the Buy/Sell dialog.
const noop = () => {};

describe('ware card tap targets', () => {
  for (const cardId of ['ware_3k_1', 'ware_6all_1'] as const) {
    it(`${cardId}: when playable, the coin strip is not a separate zoom button (the whole card opens Buy/Sell)`, () => {
      const html = renderToStaticMarkup(createElement(CardFace, { cardId, onClick: noop, onMegaView: noop }));
      expect(html).not.toContain('Zoom in on');
      expect(html).toContain('role="button"'); // the card itself
    });

    it(`${cardId}: when not playable, the coin strip still zooms`, () => {
      const html = renderToStaticMarkup(createElement(CardFace, { cardId, onMegaView: noop }));
      expect(html).toContain('Zoom in on');
    });
  }

  it('non-ware cards keep their caption zoom even when playable (tapping them plays instantly)', () => {
    const html = renderToStaticMarkup(createElement(CardFace, { cardId: 'guard_1', onClick: noop, onMegaView: noop }));
    expect(html).toContain('Zoom in on');
  });
});
