// ============================================================================
// Opponent Choice Resolver - Cheetah (opponent: give 2g or active draws 2)
// ============================================================================

import type {
  GameState,
  PendingOpponentChoice,
  InteractionResponse,
  PlayerState,
} from '../../types.ts';
import { drawFromDeck } from '../../deck/DeckManager.ts';

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

export function resolveOpponentChoice(
  state: GameState,
  _pending: PendingOpponentChoice,
  response: InteractionResponse
): GameState {
  if (response.type !== 'OPPONENT_CHOICE') {
    throw new Error('Expected OPPONENT_CHOICE response for Cheetah');
  }

  const cp = state.currentPlayer;
  const opponent: 0 | 1 = cp === 0 ? 1 : 0;
  const { choice } = response;

  let next = state;

  if (choice === 0) {
    // Opponent gives 2g to active player. Rulebook: "If a player has no gold
    // and wants to take an action that costs gold, he may not take the
    // action" — an opponent who can't pay 2g must let the active player draw
    // (paying "what they have", even 0, used to cancel the Cheetah for free).
    const opGold = next.players[opponent].gold;
    if (opGold < 2) {
      throw new Error(`Cannot give 2g with only ${opGold}g — choose to let the opponent draw 2 cards`);
    }
    const transfer = 2;
    next = withPlayer(next, opponent, { gold: opGold - transfer });
    next = withPlayer(next, cp, { gold: next.players[cp].gold + transfer });

    next = { ...next, pendingResolution: null };
    next = withLog(next, 'CHEETAH_EFFECT', `Opponent gave ${transfer}g`);
  } else {
    // Active player draws 2 cards
    for (let i = 0; i < 2; i++) {
      const result = drawFromDeck(next);
      if (result.card) {
        next = result.state;
        const newHand = [...next.players[cp].hand, result.card];
        next = withPlayer(next, cp, { hand: newHand });
      } else {
        next = result.state;
      }
    }

    next = { ...next, pendingResolution: null };
    next = withLog(next, 'CHEETAH_EFFECT', 'Active player drew 2 cards');
  }

  return next;
}
