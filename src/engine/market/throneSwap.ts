import type { GameState } from '../types.ts';

/*
 * Throne swaps one of the opponent's wares for one of yours, in place. Wares
 * are fungible, so trading a ware for one of the same type changes nothing —
 * yet it would still spend the action and the Throne. These helpers list only
 * the exchanges that actually change both markets; the validator, resolver,
 * AI and UI all use them (reported 2026-10-10: the AI "stole tea, gave tea").
 */

/** Opponent slots worth taking: you hold at least one ware of a different type to give back. */
export function throneStealOptions(state: GameState, active: 0 | 1): number[] {
  const opponent: 0 | 1 = active === 0 ? 1 : 0;
  const mine = new Set(state.players[active].market.filter((w) => w !== null));
  const options: number[] = [];
  state.players[opponent].market.forEach((ware, index) => {
    if (ware === null) return;
    for (const own of mine) {
      if (own !== ware) {
        options.push(index);
        return;
      }
    }
  });
  return options;
}

/** Your slots you can give for the taken ware: any ware of a different type. */
export function throneGiveOptions(state: GameState, active: 0 | 1, stolenWare: string | undefined): number[] {
  const options: number[] = [];
  state.players[active].market.forEach((ware, index) => {
    if (ware !== null && ware !== stolenWare) options.push(index);
  });
  return options;
}

/** True when at least one swap would actually change the markets. */
export function hasUsefulThroneSwap(state: GameState, active: 0 | 1): boolean {
  return throneStealOptions(state, active).length > 0;
}
