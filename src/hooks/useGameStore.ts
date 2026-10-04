import { create } from 'zustand';
import type { GameState, GameAction } from '../engine/types.ts';
import { processAction } from '../engine/GameEngine.ts';
import { getResponder } from '../engine/responder.ts';
import { createInitialState } from '../engine/GameState.ts';
import {
  createReplayLog,
  exportReplayLog,
  importReplayLog,
  replayToState,
  createStartingState,
} from '../persistence/replayLog.ts';

export interface TaggedAction {
  player: 0 | 1;
  playerLabel: string;
  action: GameAction;
}

interface GameStore {
  state: GameState;
  error: string | null;
  replayActions: GameAction[];
  taggedActions: TaggedAction[];
  startingPlayer: 0 | 1;
  dispatch: (action: GameAction, playerLabel?: string) => void;
  newGame: (seed?: number, startingPlayer?: 0 | 1) => void;
  exportReplay: () => string;
  importReplay: (payload: string) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  state: createInitialState(),
  error: null,
  replayActions: [],
  taggedActions: [],
  startingPlayer: 0,

  dispatch: (action: GameAction, playerLabel?: string) => {
    set((store) => {
      try {
        const player = getResponder(store.state);
        const label = playerLabel ?? (player === 0 ? 'Player' : 'AI');
        const next = processAction(store.state, action);
        const tagged: TaggedAction = { player, playerLabel: label, action };
        return {
          state: next,
          error: null,
          replayActions: [...store.replayActions, action],
          taggedActions: [...store.taggedActions, tagged],
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    });
  },

  newGame: (seed?: number, startingPlayer: 0 | 1 = 0) => {
    set({ state: createStartingState(seed, startingPlayer), error: null, replayActions: [], taggedActions: [], startingPlayer });
  },

  exportReplay: () => {
    const store = useGameStore.getState();
    const replay = createReplayLog(store.state, store.replayActions, store.startingPlayer);
    return exportReplayLog(replay);
  },

  importReplay: (payload: string) => {
    const replay = importReplayLog(payload);
    const state = replayToState(replay);
    set({ state, error: null, replayActions: [...replay.actions], taggedActions: [], startingPlayer: replay.startingPlayer ?? 0 });
  },
}));
