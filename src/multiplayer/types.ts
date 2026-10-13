// ============================================================================
// Cast Mode — Protocol Types (shared by client and server)
// ============================================================================

import type {
  GameAction,
  WareType,
  Phase,
  PendingResolution,
  TurnModifiers,
  EndgameState,
  GameLogEntry,
  UtilityState,
  DeckCardId,
} from '../engine/types.ts';
import type { AIDifficulty } from '../ai/difficulties/index.ts';
import type { GameStory } from '../ui/gameStory.ts';

// --- Room & Connection ---

export type RoomMode = 'ai' | 'pvp';
export type ConnectionRole = 'player';
export type PlayerSlot = 0 | 1;
/** A Cast room (TV shows the board) or a friend game (each player sees the full board). */
export type RoomKind = 'cast' | 'friend';

/** How a friend-game seat looks to both players — never an email or a profile id. */
export interface OnlineSeatView {
  /** The account's display name, or 'Guest'. */
  name: string;
  /** https only. */
  avatarUrl: string | null;
  signedIn: boolean;
  status: 'connected' | 'reconnecting' | 'left';
  /** Time left to come back, while 'reconnecting' (relative, so client clocks don't matter). */
  graceMsLeft: number | null;
}

// --- Client → Server Messages ---

export type ClientMessage =
  | { type: 'CREATE_ROOM'; mode: RoomMode; aiDifficulty?: AIDifficulty; kind?: RoomKind }
  | { type: 'JOIN_ROOM'; code: string; role: ConnectionRole; reconnectToken?: string; localProfileId?: string }
  | { type: 'GAME_ACTION'; action: GameAction }
  | { type: 'REQUEST_REMATCH' }
  | { type: 'LEAVE_ROOM' };

// --- Server → Client Messages ---

export type ServerMessage =
  | { type: 'ROOM_CREATED'; code: string; castAccessToken?: string }
  | { type: 'JOINED'; playerSlot: PlayerSlot | null; mode: RoomMode; reconnectToken?: string; castAccessToken?: string; kind: RoomKind }
  | { type: 'GAME_STATE'; public: PublicGameState; private: PrivateGameState | null; audioEvent: AudioEvent | null; aiMessage: string | null; gameNumber?: number }
  | { type: 'PLAYER_JOINED'; playerSlot: PlayerSlot }
  | { type: 'PLAYER_DISCONNECTED'; playerSlot: PlayerSlot }
  | { type: 'REMATCH_STATUS'; votes: PlayerSlot[]; required: PlayerSlot[] }
  | { type: 'ERROR'; message: string }
  | { type: 'GAME_OVER'; public: PublicGameState; story?: GameStory | null }
  // Friend rooms only
  | { type: 'ROOM_PLAYERS'; seats: [OnlineSeatView | null, OnlineSeatView | null] }
  | { type: 'GAME_ABANDONED'; leaver: PlayerSlot; reason: 'left' | 'timeout' };

// --- Audio Events ---

/** Each animal has its own call (they all used the same big-cat growl). */
export type AnimalSound = 'parrot' | 'elephant' | 'snake' | 'hyena' | 'crocodile' | 'ape' | 'lion' | 'cheetah';
/** Utilities you activate every turn get a tactile sound of their own. */
export type UtilitySound = 'drums' | 'well' | 'kettle' | 'boat' | 'scale' | 'weapons';

export type AudioEvent =
  | 'coin'        // coins onto a pile — selling
  | 'coin-out'    // purse jingle — buying
  | 'card-play'
  | 'card-draw'
  | 'card-keep'     // a drawn card tucked into the hand — quieter than the draw
  | 'card-discard'  // a drawn card flicked onto the discard pile
  | 'turn-end'
  | 'attack'      // fallback animal growl
  | 'guard'
  | 'ware-land'   // a ware token landing in a market slot
  | 'win'
  | 'lose'
  | 'final-turn'
  | 'gavel'       // auction won
  | AnimalSound
  | UtilitySound;

// --- Public Game State (visible on TV and both players) ---

export interface PublicPlayerState {
  gold: number;
  market: (WareType | null)[];
  utilities: UtilityState[];
  smallMarketStands: number;
  handCount: number;
}

export interface PublicGameState {
  turn: number;
  phase: Phase;
  currentPlayer: 0 | 1;
  actionsLeft: number;
  drawsThisPhase: number;
  deckCount: number;
  discardPile: DeckCardId[];
  wareSupply: Record<WareType, number>;
  players: [PublicPlayerState, PublicPlayerState];
  pendingGuardReaction: { animalCard: DeckCardId; targetPlayer: 0 | 1 } | null;
  pendingWareCardReaction: { wareCardId: DeckCardId; targetPlayer: 0 | 1 } | null;
  turnModifiers: TurnModifiers;
  endgame: EndgameState | null;
  log: GameLogEntry[];
  // Sanitized resolution info for TV display (type only, no secret data)
  pendingResolutionType: PendingResolution['type'] | null;
  // Who needs to act on the current resolution
  waitingOnPlayer: 0 | 1 | null;
  // The active player may still back out of the card/utility they just started
  canCancel: boolean;
}

// --- Private Game State (sent only to the relevant player) ---

export interface PrivateGameState {
  hand: DeckCardId[];
  drawnCard: DeckCardId | null;
  // Full resolution data when it's your turn to respond
  pendingResolution: PendingResolution | null;
  // Semi-private fields for specific resolutions
  revealedCards: DeckCardId[] | null;    // Psychic deck peek, Arabian Merchant auction
  revealedHand: DeckCardId[] | null;     // Hyena hand swap
}
