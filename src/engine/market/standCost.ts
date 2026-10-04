// Official rule: "The first player who builds a small market stand pays 6 gold
// to the bank to build it. All further small market stands (for either player)
// cost the player building it only 3 gold."

import type { GameState } from '../types.ts';
import { CONSTANTS } from '../types.ts';

export function getSmallStandCost(state: GameState): number {
  const builtInGame = state.players[0].smallMarketStands + state.players[1].smallMarketStands;
  return builtInGame === 0 ? CONSTANTS.FIRST_STAND_COST : CONSTANTS.ADDITIONAL_STAND_COST;
}
