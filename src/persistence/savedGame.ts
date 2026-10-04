// ============================================================================
// Local game autosave (solo vs AI and hotseat) — survives a browser refresh.
//
// The full GameState is saved after every applied action, alongside the
// action log (so replay export and stats keep working after a resume).
// Saving the state itself, not just the replay, keeps a save loadable even if
// engine logic changes between deploys: a replay could diverge, a snapshot
// can't.
//
// A per-tab session flag records that this tab was mid-game, so a refresh
// drops straight back into the game; a fresh visit shows "Resume game".
// ============================================================================

import type { GameAction, GameState } from '../engine/types.ts';
import type { AIDifficulty } from '../ai/difficulties/index.ts';
import type { TaggedAction } from '../hooks/useGameStore.ts';
import { checkInvariants } from '../engine/validation/invariants.ts';

export const SAVED_GAME_KEY = 'jambo.savedGame';
export const ACTIVE_GAME_SESSION_KEY = 'jambo.activeGame';
const SAVE_VERSION = 1;

export type LocalGameMode = 'solo' | 'multiplayer';

export interface SavedGame {
  version: number;
  savedAt: number;
  mode: LocalGameMode;
  aiDifficulty: AIDifficulty;
  state: GameState;
  replayActions: GameAction[];
  taggedActions: TaggedAction[];
  startingPlayer: 0 | 1;
}

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function local(): KV | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
function session(): KV | null {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

export function saveLocalGame(game: Omit<SavedGame, 'version' | 'savedAt'>, storage: KV | null = local()): void {
  if (!storage) return;
  if (game.state.phase === 'GAME_OVER') {
    clearLocalGame(storage);
    return;
  }
  try {
    const payload: SavedGame = { ...game, version: SAVE_VERSION, savedAt: Date.now() };
    storage.setItem(SAVED_GAME_KEY, JSON.stringify(payload));
  } catch {
    // Quota or privacy mode — autosave is best-effort
  }
}

/** The saved game, or null if missing, finished, from another format, or corrupt. */
export function loadLocalGame(storage: KV | null = local()): SavedGame | null {
  if (!storage) return null;
  let raw: string | null;
  try { raw = storage.getItem(SAVED_GAME_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedGame>;
    const valid =
      parsed.version === SAVE_VERSION &&
      (parsed.mode === 'solo' || parsed.mode === 'multiplayer') &&
      typeof parsed.aiDifficulty === 'string' &&
      !!parsed.state &&
      Array.isArray(parsed.replayActions) &&
      Array.isArray(parsed.taggedActions) &&
      (parsed.startingPlayer === 0 || parsed.startingPlayer === 1);
    if (!valid) throw new Error('bad save');
    const game = parsed as SavedGame;
    if (game.state.phase === 'GAME_OVER') throw new Error('finished');
    if (checkInvariants(game.state).length > 0) throw new Error('invalid state');
    return game;
  } catch {
    clearLocalGame(storage);
    return null;
  }
}

export function clearLocalGame(storage: KV | null = local()): void {
  try { storage?.removeItem(SAVED_GAME_KEY); } catch { /* ignore */ }
}

/** Mark this tab as mid-game (set while GameScreen is open). */
export function setGameActiveInTab(active: boolean, storage: KV | null = session()): void {
  try {
    if (active) storage?.setItem(ACTIVE_GAME_SESSION_KEY, '1');
    else storage?.removeItem(ACTIVE_GAME_SESSION_KEY);
  } catch { /* ignore */ }
}

export function isGameActiveInTab(storage: KV | null = session()): boolean {
  try { return storage?.getItem(ACTIVE_GAME_SESSION_KEY) === '1'; } catch { return false; }
}

/** One-line description for the Resume button. */
export function describeSavedGame(game: SavedGame): string {
  const opponent = game.mode === 'solo' ? `vs ${game.aiDifficulty[0].toUpperCase()}${game.aiDifficulty.slice(1)} AI` : 'Pass & play';
  const [a, b] = game.state.players.map((p) => p.gold);
  const score = game.mode === 'solo' ? `you ${a}g · AI ${b}g` : `P1 ${a}g · P2 ${b}g`;
  return `${opponent} · turn ${game.state.turn} · ${score}`;
}
