import type { GameState } from '../types.ts';

/*
 * Throne swaps one of the opponent's wares for one of yours, in place. Wares
 * are fungible, so trading a ware for one of the same type changes nothing —
 * yet it would still spend the action and the Throne. These helpers list only
 * the exchanges that actually change both markets; the validator, resolver,
 * AI and UI all use them (reported 2026-10-10: the AI "stole tea, gave tea").
 */

/*
 * Order (2026-10-12): you pick your own ware to give first, then the
 * opponent's ware to take for it.
 */

/** Your slots worth giving: the opponent holds at least one ware of a different type to take. */
export function throneGiveOptions(state: GameState, active: 0 | 1): number[] {
  const opponent: 0 | 1 = active === 0 ? 1 : 0;
  const theirs = new Set(state.players[opponent].market.filter((w) => w !== null));
  const options: number[] = [];
  state.players[active].market.forEach((ware, index) => {
    if (ware === null) return;
    for (const other of theirs) {
      if (other !== ware) {
        options.push(index);
        return;
      }
    }
  });
  return options;
}

/** Opponent slots you can take for the given ware: any ware of a different type. */
export function throneStealOptions(state: GameState, active: 0 | 1, givenWare: string | undefined): number[] {
  const opponent: 0 | 1 = active === 0 ? 1 : 0;
  const options: number[] = [];
  state.players[opponent].market.forEach((ware, index) => {
    if (ware !== null && ware !== givenWare) options.push(index);
  });
  return options;
}

/** True when at least one swap would actually change the markets. */
export function hasUsefulThroneSwap(state: GameState, active: 0 | 1): boolean {
  return throneGiveOptions(state, active).length > 0;
}
