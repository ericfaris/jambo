import type { GameAction, GameState, InteractionResponse } from '../engine/types.ts';
import { createInitialState } from '../engine/GameState.ts';
import { processAction } from '../engine/GameEngine.ts';

export interface ReplayLog {
  formatVersion: '1.0';
  gameVersion: string;
  createdAt: string;
  rngSeed: number;
  /** Who moved first. Older replays omit it (treated as player 0). */
  startingPlayer?: 0 | 1;
  actions: GameAction[];
}

interface LegacyReplayLogV09 {
  formatVersion: '0.9';
  gameVersion?: string;
  createdAt?: string;
  seed: number;
  actions: GameAction[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isWareType(value: unknown): boolean {
  return value === 'trinkets' || value === 'hides' || value === 'tea' || value === 'silk' || value === 'fruit' || value === 'salt';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => isInteger(item));
}

function isInteractionResponse(value: unknown): value is InteractionResponse {
  if (!isObject(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'SELECT_WARE':
      return isInteger(value.wareIndex);
    case 'SELECT_WARE_TYPE':
      return isWareType(value.wareType);
    case 'SELECT_CARD':
      return typeof value.cardId === 'string';
    case 'SELECT_CARDS':
      return isStringArray(value.cardIds);
    case 'SELECT_WARES':
      return isIntegerArray(value.wareIndices);
    case 'AUCTION_BID':
      return isInteger(value.amount);
    case 'AUCTION_PASS':
      return true;
    case 'BINARY_CHOICE':
      return value.choice === 0 || value.choice === 1;
    case 'DECK_PEEK_PICK':
      return isInteger(value.cardIndex);
    case 'DISCARD_PICK':
      return typeof value.cardId === 'string';
    case 'SELL_WARES':
      return isIntegerArray(value.wareIndices);
    case 'RETURN_WARE':
      return isInteger(value.wareIndex);
    case 'OPPONENT_DISCARD_SELECTION':
      return isIntegerArray(value.cardIndices);
    case 'OPPONENT_CHOICE':
      return value.choice === 0 || value.choice === 1;
    case 'SELECT_UTILITY':
      return isInteger(value.utilityIndex);
    default:
      return false;
  }
}

function isGameAction(value: unknown): value is GameAction {
  if (!isObject(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'DRAW_CARD':
    case 'KEEP_CARD':
    case 'DISCARD_DRAWN':
    case 'SKIP_DRAW':
    case 'END_TURN':
      return true;
    case 'PLAY_CARD':
      return typeof value.cardId === 'string' && (value.wareMode === undefined || value.wareMode === 'buy' || value.wareMode === 'sell');
    case 'ACTIVATE_UTILITY':
      return isInteger(value.utilityIndex);
    case 'RESOLVE_INTERACTION':
      return isInteractionResponse(value.response);
    case 'GUARD_REACTION':
    case 'WARE_CARD_REACTION':
      return typeof value.play === 'boolean';
    default:
      return false;
  }
}

function parseReplayLog(value: unknown): ReplayLog {
  if (!isObject(value)) {
    throw new Error('Replay payload must be an object');
  }

  const formatVersion = typeof value.formatVersion === 'string' ? value.formatVersion : null;

  if (formatVersion === '0.9') {
    return migrateLegacyReplayV09(value);
  }

  if (formatVersion === null) {
    // Backward compatibility: allow unversioned payloads and infer fields.
    if (isInteger(value.rngSeed) && Array.isArray(value.actions)) {
      return {
        formatVersion: '1.0',
        gameVersion: typeof value.gameVersion === 'string' ? value.gameVersion : 'unknown',
        createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
        rngSeed: value.rngSeed,
        actions: normalizeActions(value.actions),
      };
    }
    if (isInteger(value.seed) && Array.isArray(value.actions)) {
      const legacy: LegacyReplayLogV09 = {
        formatVersion: '0.9',
        seed: value.seed,
        gameVersion: typeof value.gameVersion === 'string' ? value.gameVersion : undefined,
        createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
        actions: normalizeActions(value.actions),
      };
      return migrateLegacyReplayV09(legacy as unknown as Record<string, unknown>);
    }
    throw new Error('Replay missing formatVersion');
  }

  if (formatVersion !== '1.0') {
    throw new Error(`Unsupported replay format version: ${formatVersion}`);
  }

  if (typeof value.gameVersion !== 'string') {
    throw new Error('Replay missing gameVersion');
  }

  if (typeof value.createdAt !== 'string') {
    throw new Error('Replay missing createdAt');
  }

  if (!isInteger(value.rngSeed)) {
    throw new Error('Replay missing integer rngSeed');
  }

  if (!Array.isArray(value.actions)) {
    throw new Error('Replay actions must be an array');
  }

  if (value.startingPlayer !== undefined && value.startingPlayer !== 0 && value.startingPlayer !== 1) {
    throw new Error('Replay startingPlayer must be 0 or 1');
  }

  return {
    formatVersion: '1.0',
    gameVersion: value.gameVersion,
    createdAt: value.createdAt,
    rngSeed: value.rngSeed,
    ...(value.startingPlayer !== undefined ? { startingPlayer: value.startingPlayer } : {}),
    actions: normalizeActions(value.actions),
  };
}

function normalizeActions(actions: unknown[]): GameAction[] {
  if (!actions.every((action) => isGameAction(action))) {
    throw new Error('Replay contains invalid action entries');
  }
  return [...actions];
}

function migrateLegacyReplayV09(value: Record<string, unknown>): ReplayLog {
  if (!isInteger(value.seed)) {
    throw new Error('Legacy replay missing integer seed');
  }
  if (!Array.isArray(value.actions)) {
    throw new Error('Legacy replay actions must be an array');
  }

  return {
    formatVersion: '1.0',
    gameVersion: typeof value.gameVersion === 'string' ? value.gameVersion : 'legacy-0.9',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    rngSeed: value.seed,
    actions: normalizeActions(value.actions),
  };
}

export function createReplayLog(
  state: GameState,
  actions: readonly GameAction[],
  startingPlayer: 0 | 1 = 0,
): ReplayLog {
  return {
    formatVersion: '1.0',
    gameVersion: state.version,
    createdAt: new Date().toISOString(),
    rngSeed: state.rngSeed,
    startingPlayer,
    actions: [...actions],
  };
}

/** Initial state for a seed + starting player (mirrors useGameStore.newGame). */
export function createStartingState(seed: number | undefined, startingPlayer: 0 | 1 = 0): GameState {
  const initial = createInitialState(seed);
  return startingPlayer === 0 ? initial : { ...initial, currentPlayer: 1 };
}

export function exportReplayLog(log: ReplayLog): string {
  return JSON.stringify(log, null, 2);
}

export function importReplayLog(payload: string): ReplayLog {
  const parsed = JSON.parse(payload) as unknown;
  return parseReplayLog(parsed);
}

export function replayToState(log: ReplayLog): GameState {
  let state = createStartingState(log.rngSeed, log.startingPlayer ?? 0);
  for (const action of log.actions) {
    state = processAction(state, action);
  }
  return state;
}