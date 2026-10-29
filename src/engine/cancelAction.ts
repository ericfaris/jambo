// ============================================================================
// Cancel Action — lets the active player back out of a card or utility they
// started, from any of its resolution screens, until the opponent acts.
//
// Starting a card or utility that opens a resolution keeps a snapshot of the
// state just before it. Cancelling restores that snapshot exactly — deck
// order, gold, wares, hands, the action spent — and logs "Cancelled X".
//
// The snapshot is dropped the moment the opponent is involved — a Guard
// decision, an auction bid, a draft pick, an opponent choice — or the effect
// finishes. Rewinding someone else's decision is never offered.
//
// It is also dropped the moment a step shows you anything hidden — a card
// drawn from or peeked off the deck, or a card from the opponent's hand —
// since no undo can take that knowledge back (2026-10-29; replaces the
// 2026-10-12 rule that let Psychic/Arabian Merchant rewind after a peek).
// So Psychic, Arabian Merchant, Hyena, Ape, Scale (even borrowed by a
// Crocodile) and any step that draws are never cancellable from that point.
// ============================================================================

import type { CancellableAction, GameAction, GameState } from './types.ts';
import { getCard } from './cards/CardDatabase.ts';
import { getResponder } from './responder.ts';

/** The snapshot to restore, without its own (older) cancel point. */
function snapshotOf(state: GameState): GameState {
  return { ...state, cancellableAction: null };
}

/** Waiting on the active player themselves (not the opponent, not a reaction). */
function activePlayerToAct(state: GameState): boolean {
  if (!state.pendingResolution || state.pendingGuardReaction || state.pendingWareCardReaction) return false;
  return getResponder(state) === state.currentPlayer;
}

function cardName(before: GameState, action: GameAction): string | null {
  if (action.type === 'PLAY_CARD') return getCard(action.cardId).name;
  if (action.type === 'ACTIVATE_UTILITY') {
    const u = before.players[before.currentPlayer].utilities[action.utilityIndex];
    return u ? getCard(u.cardId).name : null;
  }
  return null;
}

/** Every card id a resolution carries (revealed, pooled, selected…), wherever it keeps them. */
function cardsShownBy(pr: GameState['pendingResolution']): Set<string> {
  const ids = new Set<string>();
  if (!pr) return ids;
  for (const value of Object.values(pr)) {
    if (typeof value === 'string') ids.add(value);
    else if (Array.isArray(value)) {
      for (const v of value.flat()) if (typeof v === 'string') ids.add(v);
    }
  }
  return ids;
}

/**
 * Did going from `before` to `after` show the active player something hidden?
 * The deck moved (a draw, a reshuffle), or the resolution now shows a card
 * that was in the deck or the opponent's hand (Psychic, Arabian Merchant,
 * Hyena, Ape, Scale).
 */
export function revealsHiddenInfo(before: GameState, after: GameState): boolean {
  if (after.deck.length !== before.deck.length || after.deck.some((id, i) => id !== before.deck[i])) return true;
  const opponent = before.currentPlayer === 0 ? 1 : 0;
  const hidden = new Set<string>([...before.deck, ...before.players[opponent].hand]);
  for (const id of cardsShownBy(after.pendingResolution)) if (hidden.has(id)) return true;
  return false;
}

/**
 * Called by processAction after every action: the cancel point `after`
 * carries. `before` is the state the action was applied to.
 */
export function deriveCancellableAction(before: GameState, action: GameAction, after: GameState): CancellableAction | null {
  if (after.currentPlayer !== before.currentPlayer || !activePlayerToAct(after)) return null;
  if (revealsHiddenInfo(before, after)) return null;

  // A card or utility just opened a resolution waiting on its player
  if (action.type === 'PLAY_CARD' || action.type === 'ACTIVATE_UTILITY') {
    const name = cardName(before, action);
    return name ? { name, restore: snapshotOf(before) } : null;
  }

  // A further choice by the same player keeps the original cancel point;
  // anything the opponent did (bid, pick, choice, Guard) has already cleared it
  if (action.type === 'RESOLVE_INTERACTION' && before.cancellableAction && getResponder(before) === before.currentPlayer) {
    return before.cancellableAction;
  }
  return null;
}

export function canCancelAction(state: GameState): boolean {
  return !!state.cancellableAction && activePlayerToAct(state);
}

export function handleCancelAction(state: GameState): GameState {
  const undo = state.cancellableAction;
  if (!undo || !state.pendingResolution) throw new Error('Nothing to cancel');
  const restored = undo.restore;
  return {
    ...restored,
    cancellableAction: null,
    log: [...restored.log, { turn: restored.turn, player: restored.currentPlayer, action: 'CANCEL_ACTION', details: `Cancelled ${undo.name}` }],
  };
}
