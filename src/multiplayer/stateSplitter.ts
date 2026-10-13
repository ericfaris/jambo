// ============================================================================
// Cast Mode — State Splitter
// Splits full GameState into public + private views for each player/TV.
// ============================================================================

import { canCancelAction } from '../engine/cancelAction.ts';
import { isAuctionBidding } from '../engine/responder.ts';
import { redactHiddenCards } from '../engine/logRedaction.ts';
import type { GameState, DeckCardId } from '../engine/types.ts';
import type {
  PublicGameState,
  PublicPlayerState,
  PrivateGameState,
  PlayerSlot,
} from './types.ts';

/**
 * Extract the public portion of GameState (visible to all: TV + both players).
 */
export function extractPublicState(state: GameState): PublicGameState {
  const publicPlayers: [PublicPlayerState, PublicPlayerState] = [
    toPublicPlayer(state, 0),
    toPublicPlayer(state, 1),
  ];

  return {
    turn: state.turn,
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    actionsLeft: state.actionsLeft,
    drawsThisPhase: state.drawsThisPhase,
    deckCount: state.deck.length,
    discardPile: state.discardPile,
    wareSupply: state.wareSupply,
    players: publicPlayers,
    pendingGuardReaction: state.pendingGuardReaction,
    pendingWareCardReaction: state.pendingWareCardReaction,
    turnModifiers: state.turnModifiers,
    endgame: state.endgame,
    log: state.log.map(redactHiddenCards),
    pendingResolutionType: state.pendingResolution?.type ?? null,
    waitingOnPlayer: getWaitingPlayer(state),
    canCancel: canCancelAction(state),
  };
}

// The public log goes to the TV and both phones; hidden draws stay hidden.
export { redactHiddenCards };

/**
 * Extract the private portion of GameState for a specific player.
 */
export function extractPrivateState(
  state: GameState,
  playerSlot: PlayerSlot,
): PrivateGameState {
  const player = state.players[playerSlot];
  const isCurrentPlayer = state.currentPlayer === playerSlot;
  const pr = state.pendingResolution;

  // drawnCard is only visible to the current player during DRAW phase
  const drawnCard: DeckCardId | null =
    isCurrentPlayer && state.phase === 'DRAW' ? state.drawnCard : null;

  // Determine what resolution data this player should see
  let pendingResolution = pr;
  let revealedCards: DeckCardId[] | null = null;
  let revealedHand: DeckCardId[] | null = null;

  if (pr) {
    const waitingOn = getWaitingPlayer(state);

    if (waitingOn !== playerSlot) {
      // This player is NOT the one who needs to act — hide resolution details.
      // Exceptions, public by the rules: an AUCTION (bids, the Arabian
      // Merchant's revealed cards) and a DRAFT (the pool is laid face up and
      // both players watch it shrink — the board shows it read-only).
      if (pr.type === 'AUCTION' || pr.type === 'DRAFT') {
        pendingResolution = pr;
      } else {
        pendingResolution = null;
      }
    } else {
      // This player IS the one who needs to act
      pendingResolution = pr;

      // Extract semi-private fields
      if (pr.type === 'DECK_PEEK') {
        revealedCards = pr.revealedCards;
      }
      if (pr.type === 'HAND_SWAP') {
        revealedHand = pr.revealedHand;
      }
    }
  }

  return {
    hand: player.hand,
    drawnCard,
    pendingResolution,
    revealedCards,
    revealedHand,
  };
}

/**
 * Convenience: split state for a specific player (public + private).
 */
export function splitState(
  state: GameState,
  playerSlot: PlayerSlot,
): { public: PublicGameState; private: PrivateGameState } {
  return {
    public: extractPublicState(state),
    private: extractPrivateState(state, playerSlot),
  };
}

// --- Helpers ---

function toPublicPlayer(state: GameState, slot: 0 | 1): PublicPlayerState {
  const p = state.players[slot];
  return {
    gold: p.gold,
    market: p.market,
    utilities: p.utilities,
    smallMarketStands: p.smallMarketStands,
    handCount: p.hand.length,
  };
}

/**
 * Determine which player needs to act on the current pending state.
 * Returns null if no one is waiting.
 */
function getWaitingPlayer(state: GameState): 0 | 1 | null {
  // Guard reaction
  if (state.pendingGuardReaction) {
    return state.pendingGuardReaction.targetPlayer;
  }

  // Ware card reaction (Rain Maker)
  if (state.pendingWareCardReaction) {
    return state.pendingWareCardReaction.targetPlayer;
  }

  const pr = state.pendingResolution;
  if (!pr) return null;

  switch (pr.type) {
    case 'OPPONENT_DISCARD':
      return pr.targetPlayer;
    case 'OPPONENT_CHOICE':
      // Opponent of current player makes the choice
      return state.currentPlayer === 0 ? 1 : 0;
    case 'AUCTION':
      // Traveling Merchant first requires the current player to pick 2 wares,
      // then bidding alternates by nextBidder.
      if (!isAuctionBidding(pr)) {
        return state.currentPlayer;
      }
      return pr.nextBidder;
    case 'DRAFT':
      return pr.currentPicker;
    case 'UTILITY_KEEP':
      return pr.step === 'ACTIVE_CHOOSE'
        ? state.currentPlayer
        : (state.currentPlayer === 0 ? 1 : 0);
    case 'CARRIER_WARE_SELECT':
      return pr.targetPlayer;
    default:
      return state.currentPlayer;
  }
}
