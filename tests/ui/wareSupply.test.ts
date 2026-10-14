import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { WareSupply, supplyWareFromError } from '../../src/ui/WareSupply.tsx';
import { friendlyPlayError } from '../../src/ui/uiHints.ts';

const supply = { trinkets: 6, hides: 2, tea: 0, silk: 4, fruit: 1, salt: 5 };

describe('ware supply baskets', () => {
  it('shows every ware with its live count and the total', () => {
    const html = renderToStaticMarkup(createElement(WareSupply, { supply }));
    expect(html).toContain('18 wares left');
    expect(html).toContain('ware-supply-tray');
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
    expect(html).not.toContain('wares left');
  });
});

describe('supply tray life', () => {
  it('each basket ring drains with what is left of that ware', () => {
    const html = renderToStaticMarkup(createElement(WareSupply, { supply }));
    const full = renderToStaticMarkup(createElement(WareSupply, { supply: { ...supply, trinkets: 6 } }));
    expect(full).toContain('data-supply-ware="trinkets" class="ware-basket" style="--left:360deg');
    expect(html).toMatch(/data-supply-ware="tea"[^>]*--left:0deg/);
    expect(html).toContain('2 of 6 hides left in the supply');
  });

  it('remembers which way a count last moved until it moves again', async () => {
    const { supplyChanges } = await import('../../src/ui/WareSupply.tsx');
    const first = supplyChanges(null, supply);
    expect(first.tea.change).toBeNull();
    const bought = supplyChanges(first, { ...supply, silk: 3 });
    expect(bought.silk).toEqual({ n: 3, change: 'took' });
    expect(bought.salt.change).toBeNull();
    // a re-render with the same counts keeps the animation's class
    expect(supplyChanges(bought, { ...supply, silk: 3 }).silk.change).toBe('took');
    expect(supplyChanges(bought, { ...supply, silk: 5 }).silk).toEqual({ n: 5, change: 'got' });
  });
});
