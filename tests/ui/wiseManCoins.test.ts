import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { effectiveWarePrices } from '../../src/engine/market/warePrices.ts';
import { viewerPriceModifiers, wareCoinPrices } from '../../src/ui/WareCoin.tsx';
import { CardFace } from '../../src/ui/CardFace.tsx';
import { CardPlayDialog } from '../../src/ui/ActionButtons.tsx';

const none = { buyDiscount: 0, sellBonus: 0 };
const wiseMan = { buyDiscount: 2, sellBonus: 2 };
const twoWiseMen = { buyDiscount: 4, sellBonus: 4 };

describe('effectiveWarePrices (shared by the engine and the coins)', () => {
  it('Wise Man: buys 2g less, sells 2g more', () => {
    expect(effectiveWarePrices({ buyPrice: 3, sellPrice: 10 }, wiseMan)).toEqual({ buy: 1, sell: 12 });
    expect(effectiveWarePrices({ buyPrice: 10, sellPrice: 18 }, wiseMan)).toEqual({ buy: 8, sell: 20 });
  });
  it('two Wise Men stack, and a buy never goes below 0', () => {
    expect(effectiveWarePrices({ buyPrice: 3, sellPrice: 10 }, twoWiseMen)).toEqual({ buy: 0, sell: 14 });
  });
  it('no modifier, printed prices', () => {
    expect(effectiveWarePrices({ buyPrice: 4, sellPrice: 11 }, none)).toEqual({ buy: 4, sell: 11 });
  });
});

describe('viewerPriceModifiers', () => {
  it('applies only on your own turn, and only when Wise Man is active', () => {
    expect(viewerPriceModifiers(wiseMan, 0, 0)).toEqual(wiseMan);
    expect(viewerPriceModifiers(wiseMan, 1, 0)).toBeNull();
    expect(viewerPriceModifiers(none, 0, 0)).toBeNull();
  });
});

describe('ware coins on the card face', () => {
  it('show the printed coin art with no modifier', () => {
    const html = renderToStaticMarkup(createElement(CardFace, { cardId: 'ware_3k_1' }));
    expect(html).toContain('/assets/coins/coin_3.png');
    expect(html).toContain('/assets/coins/coin_10.png');
    expect(html).not.toContain('ware-coin-deal');
  });

  it('show the Wise Man prices as deal coins', () => {
    const html = renderToStaticMarkup(createElement(CardFace, { cardId: 'ware_3k_1', priceModifiers: wiseMan }));
    expect(html).not.toContain('coin_3.png');
    expect(html).not.toContain('coin_10.png');
    expect(html.match(/ware-coin-deal/g)).toHaveLength(2);
    expect(html).toContain('>1</span>');
    expect(html).toContain('>12</span>');
    expect(html).toContain('Buy: 1g | Sell: 12g');
  });

  it('the Buy/Sell dialog shows and announces the same prices', () => {
    const html = renderToStaticMarkup(createElement(CardPlayDialog, { cardId: 'ware_3k_1', priceModifiers: wiseMan, onBuy: () => {}, onSell: () => {}, onCancel: () => {} }));
    expect(html).toContain('Buy for 1g');
    expect(html).toContain('Sell for 12g');
  });

  it('a deal price is drawn as a deal coin even when art exists for that number', () => {
    // a 5g buy becomes 3g: coin_3.png exists, but the coin must still read as the deal
    expect(wareCoinPrices({ buyPrice: 5, sellPrice: 12 }, wiseMan).buy).toEqual({ price: 3, basePrice: 5 });
  });
});
