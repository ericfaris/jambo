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

// --- Room & Connection ---

export type RoomMode = 'ai' | 'pvp';
export type ConnectionRole = 'player';
export type PlayerSlot = 0 | 1;

// --- Client → Server Messages ---

export type ClientMessage =
  | { type: 'CREATE_ROOM'; mode: RoomMode; aiDifficulty?: AIDifficulty }
  | { type: 'JOIN_ROOM'; code: string; role: ConnectionRole; reconnectToken?: string }
  | { type: 'GAME_ACTION'; action: GameAction }
  | { type: 'REQUEST_REMATCH' };

// --- Server → Client Messages ---

export type ServerMessage =
  | { type: 'ROOM_CREATED'; code: string; castAccessToken?: string }
  | { type: 'JOINED'; playerSlot: PlayerSlot | null; mode: RoomMode; reconnectToken?: string; castAccessToken?: string }
  | { type: 'GAME_STATE'; public: PublicGameState; private: PrivateGameState | null; audioEvent: AudioEvent | null; aiMessage: string | null }
  | { type: 'PLAYER_JOINED'; playerSlot: PlayerSlot }
  | { type: 'PLAYER_DISCONNECTED'; playerSlot: PlayerSlot }
  | { type: 'REMATCH_STATUS'; votes: PlayerSlot[]; required: PlayerSlot[] }
  | { type: 'ERROR'; message: string }
  | { type: 'GAME_OVER'; public: PublicGameState };

// --- Audio Events ---

export type AudioEvent =
  | 'coin'
  | 'card-play'
  | 'card-draw'
  | 'turn-end'
  | 'attack'
  | 'guard';

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
