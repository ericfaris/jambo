import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveLocalGame, loadLocalGame, clearLocalGame, setGameActiveInTab, isGameActiveInTab,
  describeSavedGame, SAVED_GAME_KEY,
} from '../../src/persistence/savedGame.ts';
import { createTestState, toPlayPhase, act } from '../helpers/testHelpers.ts';
import { useGameStore } from '../../src/hooks/useGameStore.ts';
import type { GameState } from '../../src/engine/types.ts';

class MemStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

function midGame(): GameState {
  let s = toPlayPhase(createTestState(7));
  s = act(s, { type: 'END_TURN' });
  return s;
}

const base = (state: GameState) => ({
  mode: 'solo' as const,
  aiDifficulty: 'hard' as const,
  state,
  replayActions: [{ type: 'DRAW_CARD' as const }, { type: 'KEEP_CARD' as const }, { type: 'END_TURN' as const }],
  taggedActions: [],
  startingPlayer: 0 as const,
});

describe('local game autosave', () => {
  let store: MemStorage;
  beforeEach(() => { store = new MemStorage(); });

  it('round-trips a game in progress exactly', () => {
    const state = midGame();
    saveLocalGame(base(state), store);
    const loaded = loadLocalGame(store);
    expect(loaded?.state).toEqual(state);
    expect(loaded?.mode).toBe('solo');
    expect(loaded?.aiDifficulty).toBe('hard');
    expect(loaded?.replayActions).toHaveLength(3);
  });

  it('a finished game clears the save instead of storing it', () => {
    saveLocalGame(base(midGame()), store);
    saveLocalGame(base({ ...midGame(), phase: 'GAME_OVER' }), store);
    expect(store.getItem(SAVED_GAME_KEY)).toBeNull();
    expect(loadLocalGame(store)).toBeNull();
  });

  it('discards corrupt, foreign-version, and invariant-breaking saves', () => {
    store.setItem(SAVED_GAME_KEY, '{not json');
    expect(loadLocalGame(store)).toBeNull();
    expect(store.getItem(SAVED_GAME_KEY)).toBeNull();

    saveLocalGame(base(midGame()), store);
    const v2 = JSON.parse(store.getItem(SAVED_GAME_KEY)!);
    store.setItem(SAVED_GAME_KEY, JSON.stringify({ ...v2, version: 99 }));
    expect(loadLocalGame(store)).toBeNull();

    const broken = midGame();
    saveLocalGame(base({ ...broken, deck: broken.deck.slice(5) }), store); // 5 cards vanish
    expect(loadLocalGame(store)).toBeNull();
  });

  it('clearLocalGame removes it', () => {
    saveLocalGame(base(midGame()), store);
    clearLocalGame(store);
    expect(loadLocalGame(store)).toBeNull();
  });

  it('never throws when storage is unavailable or full', () => {
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } };
    expect(() => saveLocalGame(base(midGame()), throwing)).not.toThrow();
    expect(loadLocalGame(throwing)).toBeNull();
    expect(loadLocalGame(null)).toBeNull();
  });

  it('tracks "this tab was mid-game" separately', () => {
    const tab = new MemStorage();
    expect(isGameActiveInTab(tab)).toBe(false);
    setGameActiveInTab(true, tab);
    expect(isGameActiveInTab(tab)).toBe(true);
    setGameActiveInTab(false, tab);
    expect(isGameActiveInTab(tab)).toBe(false);
  });

  it('describes the save for the Resume button', () => {
    const state = midGame();
    const text = describeSavedGame({ ...base(state), version: 1, savedAt: 0 });
    expect(text).toContain('vs Hard AI');
    expect(text).toContain(`turn ${state.turn}`);
    expect(text).toContain(`you ${state.players[0].gold}g`);
    expect(describeSavedGame({ ...base(state), mode: 'multiplayer', version: 1, savedAt: 0 })).toContain('Pass & play');
  });

  it('store.restore puts a saved game back and play continues from it', () => {
    const state = midGame();
    useGameStore.getState().restore({ ...base(state), taggedActions: [] });
    const s = useGameStore.getState();
    expect(s.state).toEqual(state);
    expect(s.replayActions).toHaveLength(3);
    expect(s.error).toBeNull();
    // the restored game is live: the next player can act
    s.dispatch(s.state.phase === 'DRAW' ? { type: 'DRAW_CARD' } : { type: 'END_TURN' });
    expect(useGameStore.getState().error).toBeNull();
    expect(useGameStore.getState().replayActions).toHaveLength(4);
  });
});
