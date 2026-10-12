import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MarketSummary, checkSell } from '../../src/ui/MarketSummary.tsx';
import { CardPlayDialog } from '../../src/ui/ActionButtons.tsx';
import { MegaView } from '../../src/ui/MegaView.tsx';
import type { WareType } from '../../src/engine/types.ts';

// Reported 2026-10-04: dialogs cover the market stands, so the player can't
// see their own wares while deciding what to do with a ware card.
const noop = () => {};
const market: (WareType | null)[] = ['trinkets', 'trinkets', 'tea', null, null, null, 'silk', null, null];

describe('checkSell', () => {
  it('reports a sellable card', () => {
    expect(checkSell('ware_3k_1', ['trinkets', 'trinkets', 'trinkets', null])).toEqual({ canSell: true, missing: [] });
  });
  it('lists each missing ware, counting duplicates', () => {
    expect(checkSell('ware_3k_1', market)).toEqual({ canSell: false, missing: ['trinkets'] });
    expect(checkSell('ware_6all_1', [])?.missing).toHaveLength(6);
  });
  it('is null for non-ware cards', () => {
    expect(checkSell('guard_1', market)).toBeNull();
  });
});

describe('MarketSummary', () => {
  it('shows every slot in order, empty slots and the free count', () => {
    const html = renderToStaticMarkup(createElement(MarketSummary, { market }));
    expect(html).toContain('Your market');
    expect(html.match(/data-ware="/g)).toHaveLength(9);
    expect(html.match(/data-ware="empty"/g)).toHaveLength(5);
    expect(html).toContain('5 free');
    expect(html).toContain('aria-label="Your market: 4 wares, 5 free slots"');
  });

  it('tells you what you still need to sell a ware card', () => {
    const html = renderToStaticMarkup(createElement(MarketSummary, { market, cardId: 'ware_3k_1' }));
    expect(html).toContain('To sell, you still need: 1 trinket');
  });

  it('confirms when you can sell it', () => {
    const html = renderToStaticMarkup(createElement(MarketSummary, { market: ['trinkets', 'trinkets', 'trinkets'], cardId: 'ware_3k_1' }));
    expect(html).toContain('You have the wares to sell this');
  });
});

describe('dialogs that cover the board show the market', () => {
  it('Buy/Sell dialog', () => {
    const html = renderToStaticMarkup(createElement(CardPlayDialog, { cardId: 'ware_3k_1', market, onBuy: noop, onSell: noop, onCancel: noop }));
    expect(html).toContain('Your market');
    expect(html).toContain('To sell, you still need');
  });

  it('zoom view', () => {
    const html = renderToStaticMarkup(createElement(MegaView, { cardId: 'guard_1', market, onClose: noop }));
    expect(html).toContain('Your market');
    expect(html).not.toContain('To sell');
  });
});

describe('market ledger styling', () => {
  it('marks filled tokens, the gap before each small stand, and a full market', () => {
    const market = ['hides', 'tea', null, null, null, null, 'salt', null, null] as const;
    const html = renderToStaticMarkup(createElement(MarketSummary, { market: [...market] }));
    expect(html.match(/market-summary-slot-filled/g)).toHaveLength(3);
    expect(html.match(/market-summary-slot-stand/g)).toHaveLength(1);
    expect(html).toContain('6 free');
    const full = renderToStaticMarkup(createElement(MarketSummary, { market: ['hides', 'hides', 'tea', 'tea', 'salt', 'salt'] }));
    expect(full).toContain('market-summary-free-none');
  });
});
