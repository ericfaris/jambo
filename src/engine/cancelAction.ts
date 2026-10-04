// ============================================================================
// Cancel Action — lets the active player back out of a card or utility they
// just started, before making its first choice.
//
// Only offered when backing out leaks nothing and wrongs nobody:
//   - nothing hidden has been revealed yet (no deck peeks, no hand reveals,
//     Scale hasn't drawn), and
//   - the opponent hasn't been involved (no animals — the Guard window has
//     already been offered — and no auction bids).
// Cancelling refunds the action and restores the card to the same hand
// position, or clears the utility's "used this turn" flag. Nothing else
// changes between starting these actions and their first choice, so the
// undo is exact (only the log gains a "Cancelled" line).
// ============================================================================

import type { CancellableAction, DeckCardId, GameAction, GameState, PendingResolution, PlayerState } from './types.ts';
import { getCard } from './cards/CardDatabase.ts';

/** True if `pr` is still at the very first step of its effect. */
export function isAtFirstStep(pr: PendingResolution): boolean {
  switch (pr.type) {
    case 'UTILITY_EFFECT':
      if (pr.utilityDesign === 'leopard_statue') return pr.step === 'SELECT_WARE_TYPE';
      if (pr.utilityDesign === 'scale') return pr.step === 'SELECT_CARD' && !(pr.selectedCards && pr.selectedCards.length > 0);
      return pr.step === 'SELECT_CARD'; // boat, kettle, weapons, drums
    case 'WARE_THEFT_SWAP':
      return pr.step === 'STEAL'; // Throne
    case 'DRAW_MODIFIER': // Mask of Transformation
    case 'BINARY_CHOICE': // Supplies, Tribal Elder, Carrier
    case 'WARE_SELL_BULK': // Portuguese
    case 'WARE_SELECT_MULTIPLE': // Basket Maker
    case 'DISCARD_PICK': // Drummer (discard pile is public)
    case 'UTILITY_REPLACE': // placing a 4th utility
      return true;
    case 'WARE_TRADE':
      return pr.step === 'SELECT_GIVE'; // Shaman
    case 'WARE_CASH_CONVERSION':
      return pr.step === 'SELECT_CARD'; // Dancer
    case 'AUCTION':
      // Traveling Merchant before any ware is chosen or bid is made.
      // Arabian Merchant has already revealed deck cards — never cancellable.
      return !pr.revealedCards && pr.wares.length === 0 && pr.currentBid === 0;
    default:
      // DECK_PEEK (Psychic) and HAND_SWAP (Hyena) reveal hidden cards;
      // DRAFT/CROCODILE_USE/UTILITY_KEEP/OPPONENT_* are animals; the rest are
      // later steps or opponent-side decisions.
      return false;
  }
}

/**
 * Called by processAction after every action: decide whether the resulting
 * state offers a cancel. `before` is the state the action was applied to.
 */
export function deriveCancellableAction(before: GameState, action: GameAction, after: GameState): CancellableAction | null {
  const pr = after.pendingResolution;
  if (!pr || after.pendingGuardReaction || after.pendingWareCardReaction) return null;
  if (after.currentPlayer !== before.currentPlayer || !isAtFirstStep(pr)) return null;

  if (action.type === 'ACTIVATE_UTILITY') {
    return { kind: 'utility', utilityIndex: action.utilityIndex };
  }
  if (action.type === 'PLAY_CARD') {
    const type = getCard(action.cardId).type;
    if (type !== 'people' && type !== 'utility') return null; // never animals
    const handIndex = before.players[before.currentPlayer].hand.indexOf(action.cardId);
    return handIndex === -1 ? null : { kind: 'card', cardId: action.cardId, handIndex };
  }
  return null;
}

export function canCancelAction(state: GameState): boolean {
  return !!state.cancellableAction && !!state.pendingResolution && isAtFirstStep(state.pendingResolution);
}

function withPlayer(state: GameState, player: 0 | 1, updates: Partial<PlayerState>): GameState {
  const players: [PlayerState, PlayerState] = [
    player === 0 ? { ...state.players[0], ...updates } : state.players[0],
    player === 1 ? { ...state.players[1], ...updates } : state.players[1],
  ];
  return { ...state, players };
}

export function handleCancelAction(state: GameState): GameState {
  const undo = state.cancellableAction;
  const pr = state.pendingResolution;
  if (!undo || !pr) throw new Error('Nothing to cancel');

  const cp = state.currentPlayer;
  const player = state.players[cp];
  let next: GameState;
  let name: string;

  if (undo.kind === 'utility') {
    const utility = player.utilities[undo.utilityIndex];
    if (!utility) throw new Error('Cancelled utility is no longer in play');
    name = getCard(utility.cardId).name;
    next = withPlayer(state, cp, {
      utilities: player.utilities.map((u, i) => (i === undo.utilityIndex ? { ...u, usedThisTurn: false } : u)),
    });
  } else {
    name = getCard(undo.cardId).name;
    const hand: DeckCardId[] = [...player.hand];
    hand.splice(Math.min(undo.handIndex, hand.length), 0, undo.cardId);
    next = withPlayer(state, cp, { hand });
  }

  return {
    ...next,
    actionsLeft: next.actionsLeft + 1,
    pendingResolution: null,
    cancellableAction: null,
    log: [...next.log, { turn: next.turn, player: cp, action: 'CANCEL_ACTION', details: `Cancelled ${name}` }],
  };
}
