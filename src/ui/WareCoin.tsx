import type { CSSProperties } from 'react';
import type { TurnModifiers, WareCardWares } from '../engine/types.ts';
import { effectiveWarePrices } from '../engine/market/warePrices.ts';

export type PriceModifiers = Pick<TurnModifiers, 'buyDiscount' | 'sellBonus'>;

/** The buy and sell coins a ware card shows; with Wise Man active they show this turn's prices. */
export function wareCoinPrices(wares: Pick<WareCardWares, 'buyPrice' | 'sellPrice'>, modifiers?: PriceModifiers | null) {
  const { buy, sell } = modifiers ? effectiveWarePrices(wares, modifiers) : { buy: wares.buyPrice, sell: wares.sellPrice };
  return {
    buy: { price: buy, basePrice: wares.buyPrice },
    sell: { price: sell, basePrice: wares.sellPrice },
  };
}

/**
 * A price coin. The printed price uses its coin art; a Wise Man price (no art
 * for it) is drawn as a matching coin with a green "deal" ring.
 */
export function WareCoin({ price, basePrice, size, style }: { price: number; basePrice: number; size: number; style?: CSSProperties }) {
  if (price === basePrice) {
    return (
      <img
        src={`/assets/coins/coin_${price}.png`}
        alt={`${price}g`}
        style={{ width: size, height: size, ...style }}
        draggable={false}
      />
    );
  }
  return (
    <span
      className="ware-coin ware-coin-deal"
      role="img"
      aria-label={`${price}g (Wise Man, normally ${basePrice}g)`}
      title={`Wise Man: ${basePrice}g → ${price}g this turn`}
      style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * (price >= 10 ? 0.44 : 0.52))), ...style }}
    >
      {price}
    </span>
  );
}

/**
 * The modifiers your ware coins should reflect: this turn's Wise Man bonus,
 * but only on your own turn (it applies to the player who played it) and only
 * when one is active.
 */
export function viewerPriceModifiers(
  turnModifiers: PriceModifiers,
  currentPlayer: 0 | 1,
  viewer: 0 | 1,
): PriceModifiers | null {
  if (currentPlayer !== viewer) return null;
  if (turnModifiers.buyDiscount === 0 && turnModifiers.sellBonus === 0) return null;
  return turnModifiers;
}
