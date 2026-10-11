import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { WareSupply, supplyWareFromError } from '../../src/ui/WareSupply.tsx';
import { friendlyPlayError } from '../../src/ui/uiHints.ts';

const supply = { trinkets: 6, hides: 2, tea: 0, silk: 4, fruit: 1, salt: 5 };

describe('ware supply baskets', () => {
  it('shows every ware with its live count and the total', () => {
    const html = renderToStaticMarkup(createElement(WareSupply, { supply }));
    expect(html).toContain('Supply · 18');
    for (const w of Object.keys(supply)) expect(html).toContain(`data-supply-ware="${w}"`);
    expect(html).toContain('No tea left in the supply');
  });

  it('greys out empty baskets and flags low ones', () => {
    const html = renderToStaticMarkup(createElement(WareSupply, { supply }));
    expect(html.match(/ware-basket-empty/g)).toHaveLength(1);
    expect(html.match(/ware-basket-low/g)).toHaveLength(2); // hides 2, fruit 1
  });

  it('pulses the basket named by a "supply has run out" error', () => {
    const message = friendlyPlayError('Cannot buy: insufficient ware supply (tea)');
    expect(supplyWareFromError(message)).toBe('tea');
    expect(supplyWareFromError('You do not have enough gold for this action.')).toBeNull();
    const html = renderToStaticMarkup(createElement(WareSupply, { supply, highlight: 'tea' }));
    expect(html).toContain('ware-basket-alert');
  });

  it('phones get a one-line strip without the title', () => {
    const html = renderToStaticMarkup(createElement(WareSupply, { supply, compact: true }));
    expect(html).toContain('ware-supply-compact');
    expect(html).not.toContain('Supply ·');
  });
});
