import { isAuctionBidding } from '../engine/responder.ts';
import type { GameState, PendingResolution } from '../engine/types.ts';
import { validatePlayCard } from '../engine/validation/actionValidator.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { redactHiddenCardDetails } from '../engine/logRedaction.ts';

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
      return `Throne > ${pr.step === 'GIVE' ? 'Give Ware' : 'Take Ware'}`;
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
 * Log details for display: card ids become card names (well_1 → Well). With
 * `redactCards` (an entry by a player whose hand the viewer can't see), cards
 * that stayed hidden — draws, kept cards, Psychic picks — read "a card";
 * cards played or discarded face-up keep their names.
 */
export function humanizeLogDetails(details: string, redactCards: boolean): string {
  const visible = redactCards ? redactHiddenCardDetails(details) : details;
  return visible.replace(CARD_ID_PATTERN, (id) => {
    try {
      return getCard(id).name;
    } catch {
      return id;
    }
  });
}

/** Engine status suffixes that mean nothing to a player reading the log. */
const LOG_NOISE_SUFFIX = / - awaiting (?:resolution|Guard reaction from opponent)$/;

/**
 * One log entry as plain words, without the actor's name: card names instead
 * of ids, hidden cards redacted for `hiddenPlayer`, and "opponent" flipped to
 * "you" when the other seat acted and the viewer is "You".
 */
export function describeLogEntry(
  entry: { player: 0 | 1; action: string; details?: string },
  labels: readonly [string, string],
  hiddenPlayer: 0 | 1 | null = null,
): string {
  const who = labels[entry.player];
  const other = labels[entry.player === 0 ? 1 : 0];
  if (entry.action === 'END_TURN') {
    // the engine says "Player 2's turn begins (turn 6)" — say it in board terms
    return who === 'You' ? 'Ended your turn' : 'Ended their turn';
  }
  let text = entry.details
    ? humanizeLogDetails(entry.details, entry.player === hiddenPlayer).replace(LOG_NOISE_SUFFIX, '')
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
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
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
  if (entry.action === 'END_TURN') {
    return who === 'You' ? 'You ended your turn' : `${who} ended their turn`;
  }
  return `${who}: ${describeLogEntry(entry, labels, hiddenPlayer)}`;
}

const TAG_LOOKBACK = 4;

/**
 * The short tag over the center row when a card moves to a pile. A card
 * reaching the discard pile is usually a *play* (buy, sell, person, animal),
 * not a discard — name what actually happened from the newest log entries.
 */
export function describeTrailTag(
  kind: 'draw' | 'discard',
  actor: string,
  recent: readonly { action: string; card?: string; details?: string }[],
): string {
  if (kind === 'draw') return `${actor} drew a card`;
  for (let i = recent.length - 1; i >= Math.max(0, recent.length - TAG_LOOKBACK); i--) {
    const entry = recent[i];
    const name = entry.card ? cardNameOrNull(entry.card) : null;
    switch (entry.action) {
      case 'PLAY_WARE_BUY': return name ? `${actor} bought with ${name}` : `${actor} bought wares`;
      case 'PLAY_WARE_SELL': return name ? `${actor} sold with ${name}` : `${actor} sold wares`;
      case 'PLAY_STAND': return `${actor} built a market stand`;
      case 'PLAY_PEOPLE':
      case 'PLAY_ANIMAL':
      case 'PLAY_CARD':
      case 'GUARD_PLAYED':
      case 'RAIN_MAKER_PLAYED':
        if (name) return `${actor} played ${name}`;
        break;
      case 'DISCARD_DRAWN': {
        // the drawn card goes face-up, so its name is public
        const id = entry.details?.match(/\b[a-z]+(?:_[a-z0-9]+)*_\d+\b/)?.[0];
        const drawnName = id ? cardNameOrNull(id) : null;
        return drawnName ? `${actor} discarded ${drawnName}` : `${actor} discarded a card`;
      }
      default:
        break;
    }
  }
  return `${actor} discarded a card`;
}

function cardNameOrNull(id: string): string | null {
  try {
    return getCard(id).name;
  } catch {
    return null;
  }
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
