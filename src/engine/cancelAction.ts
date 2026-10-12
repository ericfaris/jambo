// ============================================================================
// Cancel Action — lets the active player back out of a card or utility they
// started, from any of its resolution screens, until the opponent acts.
//
// Starting a card or utility that opens a resolution keeps a snapshot of the
// state just before it. Cancelling restores that snapshot exactly — deck
// order, gold, wares, hands, the action spent — and logs "Cancelled X".
// Cards a step already revealed to you (Scale, Psychic, Arabian Merchant) go
// back where they were; you've seen them, by design (2026-10-12 decision).
//
// The snapshot is dropped the moment the opponent is involved — a Guard
// decision, an auction bid, a draft pick, an opponent choice — or the effect
// finishes. Rewinding someone else's decision is never offered.
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

/**
 * Called by processAction after every action: the cancel point `after`
 * carries. `before` is the state the action was applied to.
 */
export function deriveCancellableAction(before: GameState, action: GameAction, after: GameState): CancellableAction | null {
  if (after.currentPlayer !== before.currentPlayer || !activePlayerToAct(after)) return null;

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
