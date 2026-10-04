// ============================================================================
// Game action -> sound effect mapping. Shared by the Cast server (broadcast
// to phones + TV) and the local solo/hotseat GameScreen, so every mode plays
// the same sounds for the same moves.
// ============================================================================

import type { GameAction } from '../engine/types.ts';
import type { AudioEvent } from './types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';

export function detectAudioEvent(action: GameAction): AudioEvent | null {
  switch (action.type) {
    case 'DRAW_CARD':
    case 'KEEP_CARD':
      return 'card-draw';
    case 'PLAY_CARD': {
      if (action.wareMode) return 'coin';
      const card = getCard(action.cardId);
      if (card.type === 'animal') return 'attack';
      return 'card-play';
    }
    case 'END_TURN':
      return 'turn-end';
    case 'GUARD_REACTION':
      return action.play ? 'guard' : null;
    default:
      return null;
  }
}
