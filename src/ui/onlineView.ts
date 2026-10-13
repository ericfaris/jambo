// ============================================================================
// Online (friend) board view model — turns what the server sends one player
// (PublicGameState + their PrivateGameState) into the GameState the solo
// board components read.
//
// Hidden cards are placeholders, not empty arrays: the opponent's hand and
// the deck keep their real lengths (Hyena/Ape/Tribal Elder/Arabian Merchant
// validation and the card-back fan read .length). Only their lengths may be
// read — getCard(HIDDEN_CARD_ID) throws.
// ============================================================================

import type { DeckCardId, GameState, PendingResolution, PlayerState } from '../engine/types.ts';
import type { PrivateGameState, PublicGameState } from '../multiplayer/types.ts';

export const HIDDEN_CARD_ID: DeckCardId = 'hidden_card';

export function isHiddenCard(cardId: DeckCardId): boolean {
  return cardId === HIDDEN_CARD_ID;
}

function hidden(count: number): DeckCardId[] {
  return Array.from({ length: Math.max(0, count) }, () => HIDDEN_CARD_ID);
}

export function toBoardState(pub: PublicGameState, priv: PrivateGameState, slot: 0 | 1): GameState {
  const player = (seat: 0 | 1): PlayerState => {
    const p = pub.players[seat];
    return {
      gold: p.gold,
      hand: seat === slot ? priv.hand : hidden(p.handCount),
      market: p.market,
      utilities: p.utilities,
      smallMarketStands: p.smallMarketStands,
    };
  };
  return {
    version: 'online-view',
    rngSeed: 0,
    rngState: 0,
    turn: pub.turn,
    currentPlayer: pub.currentPlayer,
    phase: pub.phase,
    actionsLeft: pub.actionsLeft,
    drawsThisPhase: pub.drawsThisPhase,
    drawnCard: priv.drawnCard,
    keptCardThisDrawPhase: false,
    deck: hidden(pub.deckCount),
    discardPile: pub.discardPile,
    reshuffleCount: 0,
    wareSupply: pub.wareSupply,
    players: [player(0), player(1)],
    pendingResolution: priv.pendingResolution,
    turnModifiers: pub.turnModifiers,
    endgame: pub.endgame,
    pendingGuardReaction: pub.pendingGuardReaction,
    crocodileCleanup: null,
    pendingWareCardReaction: pub.pendingWareCardReaction,
    log: pub.log,
  };
}

/** Who must act next — the engine's getResponder(), from the public view. Null once the game is over. */
export function responderFromPublic(pub: PublicGameState): 0 | 1 | null {
  if (pub.phase === 'GAME_OVER') return null;
  return pub.waitingOnPlayer ?? pub.currentPlayer;
}

/** A resolution or reaction window is open — whoever it's waiting on. */
export function hasPendingFromPublic(pub: PublicGameState): boolean {
  return !!(pub.pendingResolutionType || pub.pendingGuardReaction || pub.pendingWareCardReaction);
}

/** Cast phone copy while the other side resolves (unchanged for the Cast PlayerScreen). */
export function resolutionStatusMessage(type: PendingResolution['type'], opponentName = 'Opponent'): string {
  switch (type) {
    case 'AUCTION':
      return 'Resolving auction...';
    case 'DRAFT':
      return 'Resolving draft picks...';
    case 'OPPONENT_DISCARD':
      return `${opponentName} is choosing cards to discard...`;
    case 'OPPONENT_CHOICE':
    case 'BINARY_CHOICE':
      return 'Waiting for a decision...';
    case 'HAND_SWAP':
      return 'Resolving hand swap...';
    case 'WARE_TRADE':
    case 'WARE_SELECT_MULTIPLE':
    case 'WARE_SELL_BULK':
    case 'WARE_RETURN':
    case 'WARE_CASH_CONVERSION':
    case 'CARRIER_WARE_SELECT':
      return 'Resolving ware transaction...';
    case 'WARE_THEFT_SINGLE':
    case 'WARE_THEFT_SWAP':
      return 'Resolving ware theft...';
    case 'UTILITY_KEEP':
    case 'UTILITY_REPLACE':
    case 'UTILITY_EFFECT':
    case 'CROCODILE_USE':
      return 'Resolving utility effect...';
    case 'SUPPLIES_DISCARD':
      return 'Resolving Supplies card...';
    case 'DECK_PEEK':
      return 'Resolving card selection...';
    case 'DISCARD_PICK':
      return 'Resolving discard pile pick...';
    case 'DRAW_MODIFIER':
      return 'Resolving draw effect...';
    case 'TURN_MODIFIER':
      return 'Applying turn effect...';
    default:
      return 'Resolving card effect...';
  }
}

/**
 * The online board's "what is my friend doing" line, while they hold the
 * decision: named, and specific where the public view says enough.
 */
export function friendWaitingHint(pub: PublicGameState, viewer: 0 | 1, name: string): string | null {
  if (pub.phase === 'GAME_OVER') return null;
  const responder = responderFromPublic(pub);
  if (responder === null || responder === viewer) return null;
  if (pub.pendingGuardReaction) return `${name} may answer with a Guard…`;
  if (pub.pendingWareCardReaction) return `${name} may answer with a Rain Maker…`;
  switch (pub.pendingResolutionType) {
    case null:
      return pub.phase === 'DRAW' ? `${name} is drawing…` : `${name} is taking their turn…`;
    case 'DRAFT':
      return `${name} is picking…`;
    case 'AUCTION':
      return `${name} is on the auction…`;
    case 'OPPONENT_DISCARD':
      return `${name} is choosing cards to discard…`;
    case 'OPPONENT_CHOICE':
    case 'BINARY_CHOICE':
    case 'UTILITY_KEEP':
      return `${name} is deciding…`;
    case 'CARRIER_WARE_SELECT':
    case 'WARE_TRADE':
    case 'WARE_SELECT_MULTIPLE':
    case 'WARE_THEFT_SINGLE':
    case 'WARE_THEFT_SWAP':
    case 'WARE_RETURN':
    case 'WARE_SELL_BULK':
    case 'WARE_CASH_CONVERSION':
      return `${name} is choosing wares…`;
    default:
      return `${name} is choosing…`;
  }
}
