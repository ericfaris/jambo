// ============================================================================
// Seeded random games for property tests — every state a real game passes
// through, with the action that led to it.
// ============================================================================

import type { GameAction, GameState } from '../../src/engine/types.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import { getRandomAiAction } from '../../src/ai/RandomAI.ts';
import { canCancelAction } from '../../src/engine/cancelAction.ts';
import { createStartingState } from '../../src/persistence/replayLog.ts';
import { createRng } from '../../src/utils/rng.ts';

export interface VisitedState {
  game: number;
  step: number;
  state: GameState;
  /** The action that produced this state (null for the deal). */
  action: GameAction | null;
}

/**
 * Plays `games` random games (seeds `seedBase + n`, alternating first player)
 * to GAME_OVER or the step cap and calls `visit` on every state, the deal
 * included. Cancels now and then, so cancel paths are covered too.
 */
export function forEachRandomGameState(
  games: number,
  seedBase: number,
  visit: (v: VisitedState) => void,
  maxSteps = 1500,
): void {
  for (let g = 0; g < games; g++) {
    const rng = createRng((seedBase + g) ^ 0x2c1b3c6d);
    let state = createStartingState(seedBase + g, (g % 2) as 0 | 1);
    visit({ game: g, step: 0, state, action: null });
    for (let step = 1; step <= maxSteps && state.phase !== 'GAME_OVER'; step++) {
      let action: GameAction | null;
      if (canCancelAction(state) && rng() < 0.04) {
        action = { type: 'CANCEL_ACTION' };
      } else {
        action = getRandomAiAction(state, rng);
        // end turns now and then so games finish within the cap
        if (action && !state.pendingResolution && !state.pendingGuardReaction && !state.pendingWareCardReaction
          && state.phase === 'PLAY' && rng() < 0.1) {
          action = { type: 'END_TURN' };
        }
      }
      if (!action) break;
      try {
        state = processAction(state, action);
      } catch {
        // a random choice the engine rejects — try the next step's choice
        continue;
      }
      visit({ game: g, step, state, action });
    }
  }
}
