// ============================================================================
// Jambo Digital - Endgame Manager
// Manages endgame trigger, final turn logic, and winner determination.
// Pure functions, immutable updates.
// ============================================================================

import type { GameState, EndgameState } from '../types.ts';
import { CONSTANTS } from '../types.ts';

/**
 * Check and apply endgame trigger logic at the end of a turn.
 *
 * Rules:
 * - When the current player ends their turn with >= 60 gold, endgame activates.
 * - The OTHER player receives exactly 1 final turn (with 5 actions).
 * - If endgame is already active and the final-turn player's turn is ending,
 *   the game transitions to GAME_OVER.
 * - Endgame check is PAUSED while pendingResolution is active.
 * - The final-turn player does NOT trigger recursive endgame (already active).
 * - This function is called only at turn END, never mid-action.
 */
export function checkEndgameTrigger(state: GameState): GameState {
  // Do not check endgame while a resolution is pending
  if (state.pendingResolution !== null) {
    return state;
  }

  const currentPlayer = state.currentPlayer;
  const currentGold = state.players[currentPlayer].gold;

  // Case 1: Endgame already active - check if the final-turn player just finished
  if (state.endgame !== null) {
    if (currentPlayer === state.endgame.finalTurnPlayer) {
      // Final turn is over - transition to GAME_OVER
      return {
        ...state,
        phase: 'GAME_OVER',
      };
    }
    // Trigger player's turn is ending but final turn hasn't happened yet.
    // Mark that the next turn IS the final turn.
    return {
      ...state,
      endgame: {
        ...state.endgame,
        isFinalTurn: true,
      },
    };
  }

  // Case 2: No endgame active - check if current player triggers it
  if (currentGold >= CONSTANTS.ENDGAME_GOLD_THRESHOLD) {
    const finalTurnPlayer: 0 | 1 = currentPlayer === 0 ? 1 : 0;

    // "His opponent takes one last turn" — the turn that starts now IS the
    // final turn. (This used to be false here, and the branch that flipped it
    // can't run in a 2-player game, so the UI never showed "FINAL TURN!".)
    const endgame: EndgameState = {
      triggerPlayer: currentPlayer,
      finalTurnPlayer,
      isFinalTurn: true,
    };

    return {
      ...state,
      endgame,
    };
  }

  // No endgame conditions met
  return state;
}

/**
 * Returns true if the endgame has been triggered (a player reached >= 60 gold).
 */
export function isEndgameTriggered(state: GameState): boolean {
  return state.endgame !== null;
}

/**
 * Returns true if the current turn is the final turn
 * (i.e., the final-turn player is currently playing their last turn).
 */
export function isFinalTurn(state: GameState): boolean {
  if (state.endgame === null) {
    return false;
  }
  return state.endgame.isFinalTurn;
}

/**
 * Determine the winner of the game.
 *
 * Returns null if the game is not over.
 *
 * Scoring rules:
 * - The trigger player wins ONLY if they have strictly more gold.
 * - On a tie, the final-turn player wins (NOT the trigger player).
 * - If the final-turn player has more gold, the final-turn player wins.
 */
export function getWinner(state: GameState): 0 | 1 | null {
  if (state.phase !== 'GAME_OVER' || state.endgame === null) {
    return null;
  }

  const { triggerPlayer, finalTurnPlayer } = state.endgame;
  const triggerGold = state.players[triggerPlayer].gold;
  const finalGold = state.players[finalTurnPlayer].gold;

  // Trigger player wins only if strictly ahead
  if (triggerGold > finalGold) {
    return triggerPlayer;
  }

  // Tie or final-turn player ahead: final-turn player wins
  return finalTurnPlayer;
}

/**
 * Return the final scores and winner.
 *
 * Assumes the game is over (phase === GAME_OVER and endgame is set).
 * If called before the game is over, winner defaults based on current state.
 */
export function getFinalScores(state: GameState): {
  player0: number;
  player1: number;
  winner: 0 | 1;
} {
  const player0Gold = state.players[0].gold;
  const player1Gold = state.players[1].gold;
  const winner = getWinner(state);

  return {
    player0: player0Gold,
    player1: player1Gold,
    // If game isn't over yet, getWinner returns null.
    // Default to player 0 as a fallback, though callers should check phase first.
    winner: winner ?? 0,
  };
}
