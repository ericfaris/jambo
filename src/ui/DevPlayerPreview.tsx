// ============================================================================
// Dev-only: renders the Cast-mode PlayerScreen (phone view) from the local
// game store — no server needed. Mirrors the `?tv=1` DevTVPreview.
//
//   /?player=1              — live local game, slot 0
//   /?player=1&hand=10      — stage a 10-card hand (layout stress test)
//   &utils=3                — stage N utilities in play
//   &phase=play             — skip the draw phase on load (slot 0's turn)
// ============================================================================

import { useEffect, useMemo, useRef } from 'react';
import { PlayerScreen } from './PlayerScreen.tsx';
import { useGameStore } from '../hooks/useGameStore.ts';
import { splitState } from '../multiplayer/stateSplitter.ts';
import type { WebSocketGameState } from '../multiplayer/client.ts';
import type { DeckCardId, GameState, UtilityDesignId } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';

export function isDevPlayerMode(): boolean {
  if (typeof window === 'undefined') return false;
  // Dev builds only — on the production site ?player=1 is just ignored
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).get('player') === '1';
}

/**
 * Build a staged state for layout testing. Cards are moved out of the deck
 * (never conjured), so the 110-card invariant holds and the game stays
 * playable. Pure — exported for tests.
 */
export function stagePreviewState(base: GameState, params: URLSearchParams): GameState {
  const handSize = Number(params.get('hand'));
  const utilCount = Math.min(Number(params.get('utils')) || 0, 3);
  const skipDraw = params.get('phase') === 'play';
  const p0 = base.players[0];
  let deck = [...base.deck];
  let hand = [...p0.hand];
  let utilities = [...p0.utilities];

  if (utilCount > 0) {
    const seen = new Set<string>(utilities.map((u) => u.designId));
    for (const id of [...deck]) {
      if (utilities.length >= utilCount) break;
      const card = getCard(id);
      if (card.type !== 'utility' || seen.has(card.designId)) continue;
      seen.add(card.designId);
      utilities.push({ cardId: id, designId: card.designId as UtilityDesignId, usedThisTurn: utilities.length === 1 });
      deck = deck.filter((d) => d !== id);
    }
  }

  if (Number.isFinite(handSize) && handSize > hand.length) {
    const extra: DeckCardId[] = deck.filter((id) => getCard(id).type !== 'utility').slice(0, handSize - hand.length);
    hand = [...hand, ...extra];
    deck = deck.filter((id) => !extra.includes(id));
  }

  let state: GameState = {
    ...base,
    deck,
    players: [{ ...p0, hand, utilities }, base.players[1]],
  };
  if (skipDraw && state.phase === 'DRAW') {
    state = { ...state, currentPlayer: 0, phase: 'PLAY', drawnCard: null };
  }
  return state;
}

export function DevPlayerPreview() {
  const gameState = useGameStore((store) => store.state);
  const dispatch = useGameStore((store) => store.dispatch);
  const staged = useRef(false);

  useEffect(() => {
    if (staged.current) return;
    staged.current = true;
    const params = new URLSearchParams(window.location.search);
    useGameStore.setState({ state: stagePreviewState(useGameStore.getState().state, params) });
  }, []);

  const split = useMemo(() => splitState(gameState, 0), [gameState]);

  const mockWs: WebSocketGameState = useMemo(() => ({
    connected: true,
    roomCode: 'DEV',
    castAccessToken: null,
    playerSlot: 0,
    roomMode: 'ai',
    publicState: split.public,
    privateState: split.private,
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
    resetRoomState: () => {},
    sendAction: (action) => dispatch(action),
    requestRematch: () => {},
    clearError: () => {},
    clearAudioEvent: () => {},
  }), [split, gameState.phase, dispatch]);

  return <PlayerScreen ws={mockWs} />;
}
