import { isAuctionBidding } from '../engine/responder.ts';
import type { PendingResolution } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';

interface PlayDisabledReasonInput {
  phase: 'DRAW' | 'PLAY' | 'GAME_OVER';
  currentPlayer: 0 | 1;
  viewerPlayer: 0 | 1;
  actionsLeft: number;
  hasPendingInteraction: boolean;
  isAiTurn: boolean;
}

interface DrawDisabledReasonInput {
  phase: 'DRAW' | 'PLAY' | 'GAME_OVER';
  currentPlayer: 0 | 1;
  viewerPlayer: 0 | 1;
  isAiTurn: boolean;
}

export function getPlayDisabledReason(input: PlayDisabledReasonInput): string | null {
  if (input.phase !== 'PLAY') return 'Play cards during the Play phase.';
  if (input.currentPlayer !== input.viewerPlayer) return "Wait for your turn to play cards.";
  if (input.isAiTurn) return 'Opponent is resolving actions.';
  if (input.hasPendingInteraction) return 'Finish the current interaction first.';
  if (input.actionsLeft <= 0) return 'No actions remaining this turn.';
  return null;
}

export function getDrawDisabledReason(input: DrawDisabledReasonInput): string | null {
  if (input.phase !== 'DRAW') return 'Drawing is only available during the Draw phase.';
  if (input.currentPlayer !== input.viewerPlayer) return "Wait for your turn to draw.";
  if (input.isAiTurn) return 'Opponent is resolving actions.';
  return null;
}

export function formatResolutionBreadcrumb(pr: PendingResolution): string {
  switch (pr.type) {
    case 'WARE_THEFT_SWAP':
      return `Parrot Swap > ${pr.step === 'STEAL' ? 'Steal Ware' : 'Give Ware'}`;
    case 'HAND_SWAP':
      return `Hyena > ${pr.step === 'TAKE' ? 'Take Card' : 'Give Card'}`;
    case 'OPPONENT_DISCARD':
      return `Tribal Elder > Opponent Discard to ${pr.discardTo}`;
    case 'WARE_CASH_CONVERSION':
      return `Dancer > ${pr.step === 'SELECT_CARD' ? 'Select Ware Card' : 'Select 3 Wares'}`;
    case 'UTILITY_KEEP':
      return `Snake > ${pr.step === 'ACTIVE_CHOOSE' ? 'Active Chooses Keep' : 'Opponent Chooses Keep'}`;
    case 'CROCODILE_USE':
      return `Crocodile > ${pr.step === 'SELECT_UTILITY' ? 'Select Utility' : 'Resolve Utility'}`;
    case 'UTILITY_EFFECT':
      return `Utility > ${pr.utilityDesign} > ${pr.step}`;
    case 'AUCTION':
      if (pr.revealedCards && pr.revealedCards.length > 0) return 'Auction > Cards > Bidding';
      return `Auction > ${isAuctionBidding(pr) ? 'Bidding' : 'Select Wares'}`;
    case 'DRAFT':
      return `Draft > ${pr.draftMode}`;
    case 'WARE_TRADE':
      return `Shaman > ${pr.step === 'SELECT_GIVE' ? 'Select Give Type' : 'Select Receive Type'}`;
    default:
      return pr.type.replace(/_/g, ' > ');
  }
}

const CARD_ID_PATTERN = /\b[a-z]+(?:_[a-z0-9]+)*_\d+\b/g;

/**
 * Log details for display: card ids become card names (well_1 → Well), or
 * "a card" when the entry belongs to a player whose cards the viewer can't see.
 */
export function humanizeLogDetails(details: string, redactCards: boolean): string {
  return details.replace(CARD_ID_PATTERN, (id) => {
    try {
      const name = getCard(id).name;
      return redactCards ? 'a card' : name;
    } catch {
      return id;
    }
  });
}

/**
 * Player-facing one-liner for a log entry: speaker name instead of "P2", card
 * names instead of ids, no raw action codes. Pass `hiddenPlayer` (the AI in
 * solo) so its private draws aren't revealed.
 */
export function formatLogRecap(
  entry: { player: 0 | 1; action: string; details?: string },
  labels: readonly [string, string],
  hiddenPlayer: 0 | 1 | null = null,
): string {
  const who = labels[entry.player];
  const text = entry.details
    ? humanizeLogDetails(entry.details, entry.player === hiddenPlayer)
    : entry.action.toLowerCase().replace(/_/g, ' ');
  return `${who}: ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Status-pill owner text: "Your turn" for the local player, "Opponent's turn" / "Player 2's turn" otherwise. */
export function formatTurnOwner(label: string): string {
  return label === 'You' ? 'Your turn' : `${label}'s turn`;
}
