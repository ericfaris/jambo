export { getEasyAiAction } from './EasyAI.ts';
export { getMediumAiAction } from './MediumAI.ts';
export { getHardAiAction } from './HardAI.ts';
export { getExpertAiAction } from './ExpertAI.ts';

import type { GameAction, GameState } from '../../engine/types.ts';
import { getEasyAiAction } from './EasyAI.ts';
import { getMediumAiAction } from './MediumAI.ts';
import { getHardAiAction } from './HardAI.ts';
import { getExpertAiAction } from './ExpertAI.ts';
import { createRng } from '../../utils/rng.ts';

export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

/**
 * Ladder spacing (docs/AI_DIFFICULTY_TUNING.md › Ladder). Medium's heuristics
 * and Hard's search are far apart in strength, so each borrows some decisions
 * from the other level to even out the steps Easy → Medium → Hard → Expert:
 *   medium: share of decisions made by Hard instead
 *   hard:   share of decisions made by Medium instead
 * Measured with `npm run ai:ladder`. Mutable only so that script can sweep it.
 */
export const DIFFICULTY_BLEND = {
  medium: 0.22,
  hard: 0.08,
};

/** Deterministic per decision (same state → same roll), so benchmarks and replays are reproducible. */
export function blendRoll(state: GameState): number {
  let seed = (state.rngSeed ^ 0x5bd1e995) | 0;
  seed ^= Math.imul((state.turn + 7) | 0, 0x27d4eb2d);
  seed ^= Math.imul((state.actionsLeft + 13) | 0, 0x165667b1);
  seed ^= Math.imul((state.log.length + 29) | 0, 0x85ebca6b);
  seed ^= Math.imul((state.currentPlayer + 3) | 0, 0xc2b2ae35);
  return createRng(seed)();
}

export function getAiActionByDifficulty(
	state: GameState,
	difficulty: AIDifficulty,
	rng?: () => number,
): GameAction | null {
	switch (difficulty) {
		case 'easy':
			return getEasyAiAction(state, rng);
		case 'hard':
			if (DIFFICULTY_BLEND.hard > 0 && blendRoll(state) < DIFFICULTY_BLEND.hard) {
				return getMediumAiAction(state, rng) ?? getHardAiAction(state, rng);
			}
			return getHardAiAction(state, rng);
		case 'expert':
			return getExpertAiAction(state, rng);
		case 'medium':
		default:
			if (DIFFICULTY_BLEND.medium > 0 && blendRoll(state) < DIFFICULTY_BLEND.medium) {
				return getHardAiAction(state, rng) ?? getMediumAiAction(state, rng);
			}
			return getMediumAiAction(state, rng);
	}
}
