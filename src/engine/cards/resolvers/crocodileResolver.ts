// ============================================================================
// Crocodile Resolver - Select opponent utility, use it once, then discard it
// ============================================================================

import type {
  GameState,
  PendingCrocodileUse,
  InteractionResponse,
  PlayerState,
} from '../../types.ts';
import { drawFromDeck } from '../../deck/DeckManager.ts';
import { initializeResolution } from '../CardResolver.ts';

function withPlayer(
  state: GameState,
  player: 0 | 1,
  updates: Partial<PlayerState>
): GameState {
  const newPlayers: [PlayerState, PlayerState] = [
    player === 0 ? { ...state.players[0], ...updates } : state.players[0],
    player === 1 ? { ...state.players[1], ...updates } : state.players[1],
  ];
  return { ...state, players: newPlayers };
}

function withLog(state: GameState, action: string, details: string): GameState {
  return {
    ...state,
    log: [...state.log, { turn: state.turn, player: state.currentPlayer, action, details }],
  };
}

export function resolveCrocodileUse(
  state: GameState,
  pending: PendingCrocodileUse,
  response: InteractionResponse
): GameState {
  const cp = state.currentPlayer;
  const opponent = pending.opponentPlayer;

  if (pending.step === 'SELECT_UTILITY') {
    // Guard: opponent has no utilities — auto-resolve
    if (state.players[opponent].utilities.length === 0) {
      let next: GameState = { ...state, pendingResolution: null };
      next = withLog(next, 'CROCODILE_USE', 'Opponent has no utilities');
      return next;
    }

    if (response.type !== 'SELECT_UTILITY') {
      throw new Error('Expected SELECT_UTILITY response for Crocodile');
    }
    const { utilityIndex } = response;
    const opUtils = state.players[opponent].utilities;

    if (utilityIndex < 0 || utilityIndex >= opUtils.length) {
      throw new Error(`Invalid utility index ${utilityIndex}`);
    }

    const selectedUtility = opUtils[utilityIndex];

    // Set up crocodile cleanup to discard this utility after effect resolves
    let next: GameState = {
      ...state,
      crocodileCleanup: {
        utilityCardId: selectedUtility.cardId,
        crocodileCardId: pending.sourceCard,
        opponentPlayer: opponent,
        utilityIndex,
      },
    };

    // Handle Well specially — it auto-resolves (no gold cost for Crocodile use)
    if (selectedUtility.designId === 'well') {
      const drawResult = drawFromDeck(next);
      if (drawResult.card) {
        next = drawResult.state;
        next = withPlayer(next, cp, { hand: [...next.players[cp].hand, drawResult.card] });
      } else {
        next = drawResult.state;
      }
      next = { ...next, pendingResolution: null };
      next = withLog(next, 'CROCODILE_USE', `Used opponent's Well (drew a card)`);
      return next;
    }

    // For other utilities, initialize their effect resolution
    let innerPending: ReturnType<typeof initializeResolution> = null;
    try {
      innerPending = initializeResolution(next, selectedUtility.cardId);
    } catch (error) {
      next = { ...next, pendingResolution: null };
      next = withLog(
        next,
        'CROCODILE_USE',
        `Used opponent's ${selectedUtility.designId} (skipped: ${(error as Error).message})`,
      );
      return next;
    }

    if (innerPending) {
      next = { ...next, pendingResolution: innerPending };
      next = withLog(next, 'CROCODILE_USE', `Using opponent's ${selectedUtility.designId}`);
    } else {
      // Utility had no effect — just clean up
      next = { ...next, pendingResolution: null };
      next = withLog(next, 'CROCODILE_USE', `Used opponent's ${selectedUtility.designId} (no effect)`);
    }

    return next;
  }

  throw new Error(`Unknown Crocodile step: ${pending.step}`);
}
