// ============================================================================
// Responder — which player must act next
// Single source of truth for the store, the AI, and the local (hotseat) UI.
// ============================================================================

import type { GameState, PendingAuction } from './types.ts';

/** True once an auction is in its bidding rounds (vs. Traveling Merchant's ware pick). */
export function isAuctionBidding(pr: PendingAuction): boolean {
  return (pr.revealedCards?.length ?? 0) > 0 || pr.wares.length >= 2;
}

/** Player who must answer the current pendingResolution. */
export function getPendingResponder(state: GameState): 0 | 1 {
  const pr = state.pendingResolution;
  if (!pr) return state.currentPlayer;

  switch (pr.type) {
    case 'AUCTION':
      return isAuctionBidding(pr) ? pr.nextBidder : state.currentPlayer;
    case 'DRAFT':
      return pr.currentPicker;
    case 'OPPONENT_DISCARD':
    case 'CARRIER_WARE_SELECT':
      return pr.targetPlayer;
    case 'UTILITY_KEEP':
      return pr.step === 'ACTIVE_CHOOSE' ? state.currentPlayer : (state.currentPlayer === 0 ? 1 : 0);
    case 'OPPONENT_CHOICE':
      return state.currentPlayer === 0 ? 1 : 0;
    default:
      return state.currentPlayer;
  }
}

/** Player who must act next, including Guard / Rain Maker reaction windows. */
export function getResponder(state: GameState): 0 | 1 {
  if (state.pendingGuardReaction) return state.pendingGuardReaction.targetPlayer;
  if (state.pendingWareCardReaction) return state.pendingWareCardReaction.targetPlayer;
  if (state.pendingResolution) return getPendingResponder(state);
  return state.currentPlayer;
}
