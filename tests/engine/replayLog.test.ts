import { describe, it, expect } from 'vitest';
import type { GameAction } from '../../src/engine/types.ts';
import { createInitialState } from '../../src/engine/GameState.ts';
import { processAction } from '../../src/engine/GameEngine.ts';
import {
  createReplayLog,
  exportReplayLog,
  importReplayLog,
  replayToState,
  createStartingState,
} from '../../src/persistence/replayLog.ts';

describe('Replay log', () => {
  // Regression: replays only stored the seed, so a game where player 1 (the AI)
  // moved first replayed from player 0's perspective and threw on action #1.
  it('replays a game where player 1 moved first', () => {
    const actions: GameAction[] = [
      { type: 'DRAW_CARD' },
      { type: 'KEEP_CARD' },
      { type: 'END_TURN' },
      { type: 'SKIP_DRAW' },
    ];
    let state = createStartingState(777, 1);
    expect(state.currentPlayer).toBe(1);
    for (const action of actions) {
      state = processAction(state, action);
    }

    const payload = exportReplayLog(createReplayLog(state, actions, 1));
    const imported = importReplayLog(payload);
    expect(imported.startingPlayer).toBe(1);
    expect(replayToState(imported)).toEqual(state);
  });

  it('treats replays without startingPlayer as player 0 first', () => {
    const payload = JSON.stringify({ formatVersion: '1.0', gameVersion: 'x', createdAt: new Date(0).toISOString(), rngSeed: 5, actions: [] });
    expect(replayToState(importReplayLog(payload)).currentPlayer).toBe(0);
  });

  it('rejects an invalid startingPlayer', () => {
    const payload = JSON.stringify({ formatVersion: '1.0', gameVersion: 'x', createdAt: new Date(0).toISOString(), rngSeed: 5, startingPlayer: 2, actions: [] });
    expect(() => importReplayLog(payload)).toThrow(/startingPlayer/);
  });

  it('replays deterministic final state from seed and action sequence', () => {
    const actions: GameAction[] = [
      { type: 'DRAW_CARD' },
      { type: 'KEEP_CARD' },
      { type: 'END_TURN' },
      { type: 'SKIP_DRAW' },
      { type: 'END_TURN' },
    ];

    let state = createInitialState(12345);
    for (const action of actions) {
      state = processAction(state, action);
    }

    const replay = createReplayLog(state, actions);
    const replayedState = replayToState(replay);

    expect(replayedState).toEqual(state);
  });

  it('exports and imports replay JSON losslessly', () => {
    const baseState = createInitialState(2026);
    const actions: GameAction[] = [
      { type: 'DRAW_CARD' },
      { type: 'DISCARD_DRAWN' },
      { type: 'DRAW_CARD' },
      { type: 'KEEP_CARD' },
    ];

    const replay = createReplayLog(baseState, actions);
    const payload = exportReplayLog(replay);
    const importedReplay = importReplayLog(payload);

    expect(importedReplay).toEqual(replay);
  });

  it('migrates legacy 0.9 replay payloads', () => {
    const payload = JSON.stringify({
      formatVersion: '0.9',
      seed: 1234,
      gameVersion: '0.9.8',
      createdAt: '2025-12-01T00:00:00.000Z',
      actions: [{ type: 'DRAW_CARD' }],
    });

    const imported = importReplayLog(payload);

    expect(imported.formatVersion).toBe('1.0');
    expect(imported.rngSeed).toBe(1234);
    expect(imported.gameVersion).toBe('0.9.8');
    expect(imported.actions).toEqual([{ type: 'DRAW_CARD' }]);
  });

  it('accepts unversioned payloads with rngSeed', () => {
    const payload = JSON.stringify({
      gameVersion: '1.0.0',
      createdAt: '2026-01-01T00:00:00.000Z',
      rngSeed: 42,
      actions: [{ type: 'SKIP_DRAW' }],
    });

    const imported = importReplayLog(payload);

    expect(imported.formatVersion).toBe('1.0');
    expect(imported.rngSeed).toBe(42);
    expect(imported.actions).toEqual([{ type: 'SKIP_DRAW' }]);
  });
});
