// ============================================================================
// Which choices in a resolve panel can actually succeed? Mirrors the engine
// resolvers' rejection rules using only data every client has (supply, own
// market, own gold), so unusable options are shown disabled with a reason
// instead of failing silently when tapped. Found by fuzzing (2026-10-04):
// Basket Maker offered wares with <2 in supply; Supplies offered "Pay 1g"
// at 0 gold.
// ============================================================================

import type { GameState, PendingResolution, WareType } from '../engine/types.ts';
import { isDesign } from '../engine/cards/CardDatabase.ts';

const left = (n: number) => (n <= 0 ? 'None left in supply' : `Only ${n} left in supply`);

/** Reason a ware type can't be picked right now, or null if it can. */
export function wareChoiceBlocked(state: GameState, pr: PendingResolution, ware: WareType): string | null {
  const supply = state.wareSupply[ware] ?? 0;
  switch (pr.type) {
    case 'WARE_SELECT_MULTIPLE':
      return supply < pr.count ? left(supply) : null;
    case 'CARRIER_WARE_SELECT':
    case 'AUCTION':
      return supply < 1 ? left(supply) : null;
    case 'UTILITY_EFFECT':
      return pr.step === 'SELECT_WARE_TYPE' && supply < 1 ? left(supply) : null;
    case 'WARE_TRADE': {
      if (pr.step === 'SELECT_GIVE') {
        const owned = state.players[state.currentPlayer].market.filter((w) => w === ware).length;
        return owned === 0 ? 'None in your market' : null;
      }
      const need = pr.giveCount ?? 1;
      return supply < need ? left(supply) : null;
    }
    default:
      return null;
  }
}

/** Reason option `choice` of a two-way choice can't be taken, or null. */
export function binaryChoiceBlocked(state: GameState, pr: PendingResolution, choice: 0 | 1): string | null {
  if (pr.type === 'BINARY_CHOICE' && isDesign(pr.sourceCard, 'supplies') && choice === 0) {
    return state.players[state.currentPlayer].gold < 1 ? 'Needs 1g' : null;
  }
  return null;
}
