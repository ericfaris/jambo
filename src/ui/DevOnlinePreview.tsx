// ============================================================================
// Dev-only: the online (friend) board from the local game store — no server.
// The store is split through stateSplitter exactly as the server would, and
// the friend's seat is auto-played (a short script, then the Medium AI), so
// you can answer their Parrot with a Guard, watch their draft pick, etc.
//
//   /?online=1                     — live local game, you are seat 0
//   &slot=1                        — sit in seat 1
//   &stage=guard|rainmaker|elephant|ape|lion|auction|arabian|cancel|endgame
//   &hand=N&utils=N                — layout stress
//   &presence=away|left            — the friend is reconnecting / gone
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { OnlineGameScreen } from './OnlineGameScreen.tsx';
import { useGameStore } from '../hooks/useGameStore.ts';
import { splitState } from '../multiplayer/stateSplitter.ts';
import type { WebSocketGameState } from '../multiplayer/client.ts';
import type { GameAction } from '../engine/types.ts';
import { getResponder } from '../engine/responder.ts';
import { getAiActionByDifficulty } from '../ai/difficulties/index.ts';
import { parseOnlinePreviewParams, previewSeats, stageOnlineScenario, stageViewerExtras } from './onlineScenarios.ts';

export function isDevOnlineMode(): boolean {
  if (typeof window === 'undefined') return false;
  // Dev builds only — on the production site ?online=1 is just ignored
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).get('online') === '1';
}

const FRIEND_THINK_MS = 900;

export function DevOnlinePreview() {
  const gameState = useGameStore((store) => store.state);
  const storeError = useGameStore((store) => store.error);
  const dispatch = useGameStore((store) => store.dispatch);
  const [params] = useState(() => parseOnlinePreviewParams(new URLSearchParams(window.location.search)));
  const { slot } = params;
  const friend: 0 | 1 = slot === 0 ? 1 : 0;
  const script = useRef<GameAction[]>([]);
  const staged = useRef(false);
  const [rematchVotes, setRematchVotes] = useState<(0 | 1)[]>([]);
  const [gameNumber, setGameNumber] = useState(1);

  useEffect(() => {
    if (staged.current) return;
    staged.current = true;
    let state = useGameStore.getState().state;
    if (params.stage) {
      const scenario = stageOnlineScenario(state, params.stage, slot);
      state = scenario.state;
      script.current = scenario.script;
    }
    state = stageViewerExtras(state, slot, params.hand, params.utils);
    useGameStore.setState({ state, error: null });
  }, [params, slot]);

  // The friend's seat plays itself (unless they're "away" or gone)
  useEffect(() => {
    if (params.presence !== 'connected') return;
    if (gameState.phase === 'GAME_OVER' || getResponder(gameState) !== friend) return;
    const t = window.setTimeout(() => {
      const current = useGameStore.getState().state;
      if (current.phase === 'GAME_OVER' || getResponder(current) !== friend) return;
      const action = script.current.shift() ?? getAiActionByDifficulty(current, 'medium');
      if (action) dispatch(action, 'Friend');
    }, FRIEND_THINK_MS);
    return () => window.clearTimeout(t);
  }, [gameState, friend, dispatch, params.presence]);

  // Rematch: the friend always agrees
  useEffect(() => {
    if (!rematchVotes.includes(slot)) return;
    const t = window.setTimeout(() => {
      useGameStore.getState().newGame(undefined, Math.random() < 0.5 ? 0 : 1);
      setRematchVotes([]);
      setGameNumber((n) => n + 1);
    }, 1500);
    return () => window.clearTimeout(t);
  }, [rematchVotes, slot]);

  const split = useMemo(() => splitState(gameState, slot), [gameState, slot]);
  const seats = useMemo(() => previewSeats(slot, params.presence), [slot, params.presence]);
  const [seatsReceivedAt] = useState(() => Date.now());

  const mockWs: WebSocketGameState = useMemo(() => ({
    connected: true,
    roomCode: 'DEV',
    castAccessToken: null,
    playerSlot: slot,
    roomMode: 'pvp',
    roomKind: 'friend',
    seats,
    seatsReceivedAt,
    abandoned: params.presence === 'left' ? { leaver: friend, reason: 'left' } : null,
    story: null,
    gameNumber,
    publicState: split.public,
    privateState: split.private,
    audioEvent: null,
    aiMessage: null,
    error: storeError,
    gameOver: gameState.phase === 'GAME_OVER',
    playerJoined: null,
    playerDisconnected: null,
    rematchVotes,
    rematchRequired: [0, 1],
    createRoom: () => {},
    joinRoom: () => {},
    leaveRoom: async () => {},
    resetRoomState: () => {},
    sendAction: (action) => dispatch(action, 'You'),
    requestRematch: () => setRematchVotes((votes) => (votes.includes(slot) ? votes : [...votes, slot])),
    clearError: () => useGameStore.setState({ error: null }),
    clearAudioEvent: () => {},
  }), [split, gameState.phase, dispatch, slot, friend, seats, seatsReceivedAt, params.presence, gameNumber, rematchVotes, storeError]);

  return <OnlineGameScreen ws={mockWs} onLeftToMenu={() => { window.location.href = window.location.pathname; }} />;
}
