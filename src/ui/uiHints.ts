import { isAuctionBidding } from '../engine/responder.ts';
import type { GameState, PendingResolution } from '../engine/types.ts';
import { validatePlayCard } from '../engine/validation/actionValidator.ts';
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
      return `${humanizeToken(pr.utilityDesign)} > ${humanizeToken(pr.step)}`;
    case 'AUCTION':
      if (pr.revealedCards && pr.revealedCards.length > 0) return 'Auction > Cards > Bidding';
      return `Auction > ${isAuctionBidding(pr) ? 'Bidding' : 'Select Wares'}`;
    case 'DRAFT':
      return `Draft > ${humanizeToken(pr.draftMode)}`;
    case 'WARE_TRADE':
      return `Shaman > ${pr.step === 'SELECT_GIVE' ? 'Select Give Type' : 'Select Receive Type'}`;
    default:
      return RESOLUTION_LABELS[pr.type] ?? humanizeToken(pr.type);
  }
}

/** Plain-language breadcrumb for resolution types without step detail. */
const RESOLUTION_LABELS: Partial<Record<PendingResolution['type'], string>> = {
  WARE_SELECT_MULTIPLE: 'Choose a Ware Type',
  CARRIER_WARE_SELECT: 'Carrier > Choose a Ware Type',
  WARE_THEFT_SINGLE: 'Steal a Ware',
  UTILITY_REPLACE: 'Replace a Utility',
  BINARY_CHOICE: 'Make a Choice',
  OPPONENT_CHOICE: "Opponent's Choice",
  DECK_PEEK: 'Look at the Deck',
  DISCARD_PICK: 'Pick from Discard',
  WARE_SELL_BULK: 'Sell Wares',
  WARE_RETURN: 'Return Wares',
  SUPPLIES_DISCARD: 'Supplies > Discard',
  DRAW_MODIFIER: 'Draw Phase',
  TURN_MODIFIER: 'This Turn',
};

/** 'SELECT_WARE_TYPE' / 'leopard_statue' → 'Select Ware Type' / 'Leopard Statue'. */
export function humanizeToken(token: string): string {
  return token
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
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
  const other = labels[entry.player === 0 ? 1 : 0];
  if (entry.action === 'END_TURN') {
    // the engine says "Player 2's turn begins (turn 6)" — say it in board terms
    return who === 'You' ? 'You ended your turn' : `${who} ended their turn`;
  }
  let text = entry.details
    ? humanizeLogDetails(entry.details, entry.player === hiddenPlayer)
    : entry.action.toLowerCase().replace(/_/g, ' ');
  if (other === 'You') {
    // Log lines are written from the actor's side; when the actor is the
    // other seat, "opponent" is the viewer.
    text = text
      .replace(/\bopponent's\b/g, 'your')
      .replace(/\bOpponent's\b/g, 'Your')
      .replace(/\bopponent\b/g, 'you')
      .replace(/\bOpponent\b/g, 'You');
  }
  return `${who}: ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Status-pill owner text: "Your turn" for the local player, "Opponent's turn" / "Player 2's turn" otherwise. */
export function formatTurnOwner(label: string): string {
  return label === 'You' ? 'Your turn' : `${label}'s turn`;
}

/**
 * Validator reason -> player-facing message, as specific as the reason allows.
 * Shared by GameScreen, PlayerScreen and the draw dialog.
 */
export function friendlyPlayError(reason: string): string {
  if (reason.includes('PLAY phase')) return 'You can only play cards during your turn.';
  if (reason.includes('No actions remaining')) return "You've used all your actions this turn.";
  if (reason.includes('not in hand')) return 'This card is not in your hand.';
  if (reason.includes('wareMode')) return 'Choose buy or sell for this ware card.';
  if (reason.startsWith('Cannot sell')) return 'To sell, your market needs every ware shown on this card.';
  const gold = reason.match(/need (\d+)g, have (\d+)g/);
  if (gold) return `Buying costs ${gold[1]}g — you have ${gold[2]}g.`;
  if (reason.includes('gold') || reason.includes('cost')) return 'You do not have enough gold for this action.';
  if (reason.includes('market') || reason.includes('space')) return 'Not enough room in your market for these wares.';
  const supply = reason.match(/supply \((\w+)\)/);
  if (supply) return `The supply has run out of ${supply[1]}.`;
  if (reason.includes('supply')) return 'The supply has run out of a ware this card needs.';
  return 'This card cannot be played right now.';
}

export interface KeepAndPlayOption { valid: boolean; reason?: string }

/**
 * Draw dialog: can the just-drawn ware card be kept AND bought/sold right
 * away? Evaluated against the state as it will be after KEEP_CARD (draw phase
 * over, card in hand), so it applies exactly the normal play rules — the
 * shortcut only saves the "find it in your hand" step. Null when the drawn
 * card isn't a ware card.
 */
export function keepAndPlayOptions(state: GameState, viewer: 0 | 1): { buy: KeepAndPlayOption; sell: KeepAndPlayOption } | null {
  const drawn = state.drawnCard;
  if (!drawn || state.phase !== 'DRAW' || state.currentPlayer !== viewer) return null;
  if (getCard(drawn).type !== 'ware') return null;
  const me = state.players[viewer];
  const afterKeep: GameState = {
    ...state,
    phase: 'PLAY',
    drawnCard: null,
    keptCardThisDrawPhase: true,
    players: (viewer === 0
      ? [{ ...me, hand: [...me.hand, drawn] }, state.players[1]]
      : [state.players[0], { ...me, hand: [...me.hand, drawn] }]) as GameState['players'],
  };
  const check = (mode: 'buy' | 'sell'): KeepAndPlayOption => {
    try {
      const v = validatePlayCard(afterKeep, drawn, mode);
      return v.valid ? { valid: true } : { valid: false, reason: friendlyPlayError(v.reason ?? '') };
    } catch {
      return { valid: true }; // partial client state — let the engine/server decide
    }
  };
  return { buy: check('buy'), sell: check('sell') };
}
