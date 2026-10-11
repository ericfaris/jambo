import type { DeckCardId, GameState } from '../engine/types.ts';
import { getCard, isDesign } from '../engine/cards/CardDatabase.ts';
import { CONSTANTS } from '../engine/types.ts';
import { validatePlayCard } from '../engine/validation/actionValidator.ts';
import { friendlyPlayError } from './uiHints.ts';

/** What the hand shows about one card right now. */
export interface HandCardHint {
  /** Can be played this moment (for a ware card: bought or sold). */
  playable: boolean;
  /** Why not, in player words — shown as the tooltip on a dimmed card. */
  reason?: string;
  /** A ware card your market can sell right now — gets the green coin. */
  sellReady?: boolean;
  /** Guard / Rain Maker: never played on your turn, so never dimmed. */
  reaction?: boolean;
}

export const REACTION_HINT = 'Reaction — played on the opponent’s turn when they attack or trade.';

/**
 * Hints for every card in `viewer`'s hand, or null when the hand isn't
 * actionable (not their play phase, an interaction pending, no actions) —
 * then nothing is dimmed, because nothing is playable anyway and the board
 * already says why. Every verdict comes from validatePlayCard(), so a hint
 * can never disagree with what the engine accepts.
 */
export function computeHandHints(state: GameState, viewer: 0 | 1): Map<DeckCardId, HandCardHint> | null {
  if (state.phase !== 'PLAY' || state.currentPlayer !== viewer || state.actionsLeft <= 0) return null;
  if (state.pendingResolution || state.pendingGuardReaction || state.pendingWareCardReaction) return null;

  const hints = new Map<DeckCardId, HandCardHint>();
  for (const cardId of state.players[viewer].hand) {
    if (isDesign(cardId, 'guard') || isDesign(cardId, 'rain_maker')) {
      hints.set(cardId, { playable: false, reaction: true, reason: REACTION_HINT });
      continue;
    }
    if (getCard(cardId).type === 'ware') {
      const buy = validatePlayCard(state, cardId, 'buy');
      const sell = validatePlayCard(state, cardId, 'sell');
      const playable = buy.valid || sell.valid;
      hints.set(cardId, {
        playable,
        sellReady: sell.valid,
        reason: playable ? undefined : friendlyPlayError(buy.reason ?? sell.reason ?? ''),
      });
      continue;
    }
    const v = validatePlayCard(state, cardId);
    hints.set(cardId, v.valid ? { playable: true } : { playable: false, reason: friendlyPlayError(v.reason ?? '') });
  }
  return hints;
}

/** End Turn earns +1g with 2+ actions unused (official rules). */
export function endTurnBonus(actionsLeft: number): number {
  return actionsLeft >= CONSTANTS.ACTION_BONUS_THRESHOLD ? CONSTANTS.ACTION_BONUS_GOLD : 0;
}
