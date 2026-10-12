import type { DeckCardId, GameState } from '../engine/types.ts';
import { validateActivateUtility } from '../engine/validation/actionValidator.ts';

/** What the utility row shows about one unused utility right now. */
export interface UtilityHint {
  usable: boolean;
  /** Why not, in player words — the tooltip on a faded utility. */
  reason?: string;
}

/** Turns an engine rejection into something a player would say. */
export function friendlyUtilityError(reason: string): string {
  if (reason.includes('before drawing') || reason.includes('after drawing')) return 'The Mask is used at the start of your turn, before you draw.';
  if (reason.includes('No actions remaining')) return "You've used all your actions this turn.";
  if (reason.includes('need at least 1g or 1 card')) return 'Needs 1 gold or a card in hand.';
  const gold = reason.match(/need at least (\d+)g/);
  if (gold) return `Needs ${gold[1]} gold.`;
  if (reason.includes('no room on your market')) return 'No room on your market stands.';
  if (reason.includes('no wares available in supply')) return 'The supply has run out of wares.';
  if (reason.includes('opponent has no wares')) return 'Your opponent has no wares to swap with.';
  if (reason.includes('no wares to exchange')) return 'You need a ware in your market to swap.';
  if (reason.includes('every swap would trade')) return 'Every swap would trade a ware for the same kind.';
  if (reason.includes('no wares in market')) return 'You need a ware in your market to return.';
  if (reason.includes('no cards in hand to trade')) return 'You need a card in hand to trade.';
  if (reason.includes('no cards in hand')) return 'You need a card in hand to discard.';
  if (reason.includes('discard pile is empty')) return 'The discard pile is empty.';
  return 'This utility cannot be used right now.';
}

/**
 * Hints for each unused utility of `viewer`, or null when the row isn't
 * actionable (not their play phase, something pending, no actions) — then
 * nothing fades, matching the hand (computeHandHints). Used utilities are
 * left out: they're already turned sideways. Every verdict comes from
 * validateActivateUtility(), so a faded card is exactly one the engine refuses.
 */
export function computeUtilityHints(state: GameState, viewer: 0 | 1): Map<DeckCardId, UtilityHint> | null {
  if (state.phase !== 'PLAY' || state.currentPlayer !== viewer || state.actionsLeft <= 0) return null;
  if (state.pendingResolution || state.pendingGuardReaction || state.pendingWareCardReaction) return null;

  const hints = new Map<DeckCardId, UtilityHint>();
  state.players[viewer].utilities.forEach((u, i) => {
    if (u.usedThisTurn) return;
    let verdict: { valid: boolean; reason?: string };
    try {
      verdict = validateActivateUtility(state, i);
    } catch {
      return; // partial client state (Cast) — let the engine decide on tap
    }
    hints.set(u.cardId, verdict.valid ? { usable: true } : { usable: false, reason: friendlyUtilityError(verdict.reason ?? '') });
  });
  return hints;
}
