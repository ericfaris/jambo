// ============================================================================
// Dev-only: the Cast TV view without a Chromecast or a server.
//   /?tv=1               a staged mid-game table (every element filled in)
//   /?tv=1&slots=21      the staged table with a 21-space market (layout stress)
//   /?tv=1&autoplay=1    two AIs play a whole game, so spotlights, flights,
//                        strikes and the turn sweep can be watched on the TV board
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import type { WebSocketGameState } from '../multiplayer/client.ts';
import type { PublicGameState } from '../multiplayer/types.ts';
import { useGameStore } from '../hooks/useGameStore.ts';
import { extractPublicState } from '../multiplayer/stateSplitter.ts';
import { getResponder } from '../engine/responder.ts';
import { getAiActionByDifficulty } from '../ai/difficulties/index.ts';
import { TVScreen } from './TVScreen.tsx';

const AUTOPLAY_THINK_MS = 1100;

export function isDevTVMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).get('tv') === '1';
}

/** Dummy seats so a static preview shows every element at its real size. */
function withStagedSeats(pub: PublicGameState, slots: number): PublicGameState {
  const wares = ['trinkets', 'hides', 'tea', null, 'silk', null, 'fruit', 'salt', null] as const;
  const market = slots > 0 ? Array.from({ length: slots }, (_, i) => wares[i % wares.length]) : [...wares];
  return {
    ...pub,
    players: [
      {
        ...pub.players[0],
        market,
        utilities: [
          { cardId: 'well_1', designId: 'well', usedThisTurn: false },
          { cardId: 'drums_1', designId: 'drums', usedThisTurn: false },
          { cardId: 'throne_1', designId: 'throne', usedThisTurn: true },
        ],
        gold: 35,
      },
      {
        ...pub.players[1],
        market: ['fruit', null, 'salt', 'trinkets', null, null],
        utilities: [
          { cardId: 'boat_1', designId: 'boat', usedThisTurn: false },
          { cardId: 'scale_1', designId: 'scale', usedThisTurn: false },
        ],
        gold: 28,
      },
    ],
  };
}

export function DevTVPreview() {
  const gameState = useGameStore((store) => store.state);
  const dispatch = useGameStore((store) => store.dispatch);
  const [autoplay] = useState(() => new URLSearchParams(window.location.search).get('autoplay') === '1');
  const [slots] = useState(() => Math.min(30, Math.max(0, Number(new URLSearchParams(window.location.search).get('slots')) || 0)));

  // Autoplay: whoever must act next plays, a beat apart; a finished game restarts
  useEffect(() => {
    if (!autoplay) return;
    const t = window.setTimeout(() => {
      const current = useGameStore.getState().state;
      if (current.phase === 'GAME_OVER') {
        useGameStore.getState().newGame(undefined, Math.random() < 0.5 ? 0 : 1);
        return;
      }
      const action = getAiActionByDifficulty(current, 'medium');
      if (action) dispatch(action, `Player ${getResponder(current) + 1}`);
    }, gameState.phase === 'GAME_OVER' ? 8000 : AUTOPLAY_THINK_MS);
    return () => window.clearTimeout(t);
  }, [autoplay, gameState, dispatch]);

  const publicState = useMemo((): PublicGameState => {
    const pub = extractPublicState(gameState);
    return autoplay ? pub : withStagedSeats(pub, slots);
  }, [gameState, autoplay, slots]);

  const mockWs: WebSocketGameState = useMemo(() => ({
    connected: true,
    roomCode: 'DEV',
    castAccessToken: null,
    playerSlot: null,
    roomMode: 'ai',
    roomKind: 'cast',
    seats: null,
    seatsReceivedAt: null,
    abandoned: null,
    story: null,
    gameNumber: null,
    publicState,
    privateState: null,
    audioEvent: null,
    aiMessage: null,
    error: null,
    gameOver: gameState.phase === 'GAME_OVER',
    playerJoined: null,
    playerDisconnected: null,
    rematchVotes: [],
    rematchRequired: [],
    createRoom: () => {},
    joinRoom: () => {},
    leaveRoom: async () => {},
    resetRoomState: () => {},
    sendAction: () => {},
    requestRematch: () => {},
    clearError: () => {},
    clearAudioEvent: () => {},
  }), [publicState, gameState.phase]);

  return <TVScreen ws={mockWs} />;
}
