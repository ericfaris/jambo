import type { GameState } from '../engine/types.ts';
import { CONSTANTS } from '../engine/types.ts';

/** Share of the way to the 60g endgame trigger, 0..1. */
export function goldProgress(gold: number, target: number = CONSTANTS.ENDGAME_GOLD_THRESHOLD): number {
  if (target <= 0) return 1;
  return Math.max(0, Math.min(1, gold / target));
}

/**
 * During the final turn: how much more gold the final-turn player needs to
 * win. They win ties (official rules), so matching the trigger player is
 * enough. Live — it changes as either total moves.
 */
export function finalTurnNeed(state: Pick<GameState, 'endgame' | 'players' | 'phase'>): { player: 0 | 1; need: number } | null {
  const eg = state.endgame;
  if (!eg || !eg.isFinalTurn || state.phase === 'GAME_OVER') return null;
  const need = Math.max(0, state.players[eg.triggerPlayer].gold - state.players[eg.finalTurnPlayer].gold);
  return { player: eg.finalTurnPlayer, need };
}

/** Banner copy for the moment the final turn starts. */
export function finalTurnCopy(
  state: Pick<GameState, 'endgame' | 'players' | 'phase'>,
  labels: readonly [string, string],
): { headline: string; detail: string } | null {
  const f = finalTurnNeed(state);
  if (!f) return null;
  const who = labels[f.player];
  const trigger = labels[f.player === 0 ? 1 : 0];
  const target = CONSTANTS.ENDGAME_GOLD_THRESHOLD;
  if (who === 'You') {
    return {
      headline: 'Your final turn',
      detail: f.need > 0 ? `${trigger} reached ${target}g — you need ${f.need}g more to win` : 'You are level or ahead — hold on to win',
    };
  }
  return {
    headline: `${who}'s final turn`,
    detail: f.need > 0 ? `${who} needs ${f.need}g more to catch ${trigger === 'You' ? 'you' : trigger}` : `${who} is level or ahead`,
  };
}

/** The short live line under the phase box. */
export function finalTurnStatus(state: Pick<GameState, 'endgame' | 'players' | 'phase'>, labels: readonly [string, string]): string | null {
  const f = finalTurnNeed(state);
  if (!f) return null;
  const who = labels[f.player];
  if (f.need === 0) return who === 'You' ? 'Final turn · you’re winning' : `Final turn · ${who} is winning`;
  return who === 'You' ? `Final turn · you need ${f.need}g` : `Final turn · ${who} needs ${f.need}g`;
}
