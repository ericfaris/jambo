import type { TurnModifiers, WareCardWares } from '../types.ts';

/**
 * What a ware card actually costs / pays this turn: Wise Man takes 2g off
 * ware-card buys (never below 0) and adds 2g to ware-card sells; two stack.
 * Shared by the engine and the card faces so the coins always match the charge.
 */
export function effectiveWarePrices(
  wares: Pick<WareCardWares, 'buyPrice' | 'sellPrice'>,
  modifiers: Pick<TurnModifiers, 'buyDiscount' | 'sellBonus'>,
): { buy: number; sell: number } {
  return {
    buy: Math.max(0, wares.buyPrice - modifiers.buyDiscount),
    sell: wares.sellPrice + modifiers.sellBonus,
  };
}
