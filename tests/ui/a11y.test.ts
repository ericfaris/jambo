import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CardFace } from '../../src/ui/CardFace.tsx';
import { CardPlayDialog } from '../../src/ui/ActionButtons.tsx';
import { MarketDisplay } from '../../src/ui/MarketDisplay.tsx';
import { buttonProps } from '../../src/ui/a11y.ts';
import { getCard } from '../../src/engine/cards/CardDatabase.ts';

const noop = () => {};

describe('accessible controls', () => {
  it('a playable card is a named, focusable button', () => {
    const html = renderToStaticMarkup(createElement(CardFace, { cardId: 'well_1', onClick: noop, onMegaView: noop }));
    expect(html).toContain('role="button"');
    expect(html).toContain('aria-label="Well"');
    expect(html).toContain('aria-label="Zoom in on Well"');
    expect(html).toContain('tabindex="0"');
  });

  it('a non-interactive card is not announced as a button', () => {
    const html = renderToStaticMarkup(createElement(CardFace, { cardId: 'well_1' }));
    expect(html).not.toContain('role="button"');
  });

  it('buy/sell coins say what they do', () => {
    const wares = getCard('ware_3h_1').wares!;
    const html = renderToStaticMarkup(createElement(CardPlayDialog, { cardId: 'ware_3h_1', onBuy: noop, onSell: noop, onCancel: noop }));
    expect(html).toContain(`aria-label="Buy for ${wares.buyPrice}g"`);
    expect(html).toContain(`aria-label="Sell for ${wares.sellPrice}g"`);
  });

  it('selectable market slots are labelled with ware and slot', () => {
    const html = renderToStaticMarkup(createElement(MarketDisplay, { market: ['silk', null, null, null, null, null], onSlotClick: noop }));
    expect(html).toContain('aria-label="silk in slot 1"');
  });

  it('Enter activates without bubbling to a parent control', () => {
    let activated = 0;
    let stopped = false;
    const props = buttonProps(() => { activated++; }, 'x');
    props.onKeyDown?.({ key: 'Enter', preventDefault: noop, stopPropagation: () => { stopped = true; } } as never);
    expect(activated).toBe(1);
    expect(stopped).toBe(true);
    expect(buttonProps(undefined, 'x')).toEqual({});
  });
});
