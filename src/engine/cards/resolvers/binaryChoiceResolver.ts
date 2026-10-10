// ============================================================================
// Binary Choice Resolver - Carrier (wares vs cards), Supplies (pay/discard first)
// ============================================================================

import type { GameState, PendingBinaryChoice, InteractionResponse, PlayerState } from '../../types.ts';
import { isDesign } from '../CardDatabase.ts';
import { drawFromDeck } from '../../deck/DeckManager.ts';
import { drawUntilWare } from './suppliesDiscardResolver.ts';

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

export function resolveBinaryChoice(
  state: GameState,
  pending: PendingBinaryChoice,
  response: InteractionResponse
): GameState {
  if (response.type !== 'BINARY_CHOICE') {
    throw new Error('Expected BINARY_CHOICE response');
  }

  const { choice } = response; // 0 or 1

  if (isDesign(pending.sourceCard, 'carrier')) {
    return resolveCarrier(state, pending, choice);
  }
  if (isDesign(pending.sourceCard, 'supplies')) {
    return resolveSupplies(state, pending, choice);
  }
  if (isDesign(pending.sourceCard, 'tribal_elder')) {
    return resolveTribalElder(state, pending, choice);
  }

  throw new Error(`Unknown binary choice card: ${pending.sourceCard}`);
}

function resolveCarrier(state: GameState, pending: PendingBinaryChoice, choice: 0 | 1): GameState {
  const activePlayer = state.currentPlayer;
  const opponent: 0 | 1 = activePlayer === 0 ? 1 : 0;

  if (choice === 0) {
    // Active player takes 2 wares (they pick type next), opponent draws 2 cards
    let next = state;
    for (let i = 0; i < 2; i++) {
      const result = drawFromDeck(next);
      if (result.card) {
        next = result.state;
        next = withPlayer(next, opponent, { hand: [...next.players[opponent].hand, result.card] });
      } else {
        next = result.state;
      }
    }
    // Chain to CARRIER_WARE_SELECT — active player picks ware type
    return {
      ...next,
      pendingResolution: {
        type: 'CARRIER_WARE_SELECT',
        sourceCard: pending.sourceCard,
        targetPlayer: activePlayer,
      },
      log: [...next.log, {
        turn: state.turn,
        player: activePlayer,
        action: 'CARRIER_CHOICE',
        details: 'Chose wares; opponent drew 2 cards. Now select ware type.',
      }],
    };
  } else {
    // Active player draws 2 cards, opponent takes 2 wares (they pick type next)
    let next = state;
    for (let i = 0; i < 2; i++) {
      const result = drawFromDeck(next);
      if (result.card) {
        next = result.state;
        next = withPlayer(next, activePlayer, { hand: [...next.players[activePlayer].hand, result.card] });
      } else {
        next = result.state;
      }
    }
    // Chain to CARRIER_WARE_SELECT — opponent picks ware type
    return {
      ...next,
      pendingResolution: {
        type: 'CARRIER_WARE_SELECT',
        sourceCard: pending.sourceCard,
        targetPlayer: opponent,
      },
      log: [...next.log, {
        turn: state.turn,
        player: activePlayer,
        action: 'CARRIER_CHOICE',
        details: 'Chose cards; opponent selects ware type.',
      }],
    };
  }
}

function resolveTribalElder(state: GameState, pending: PendingBinaryChoice, choice: 0 | 1): GameState {
  const activePlayer = state.currentPlayer;
  const opponent: 0 | 1 = activePlayer === 0 ? 1 : 0;

  if (choice === 0) {
    // Draw cards until hand has 5
    let next = state;
    const hand = next.players[activePlayer].hand;
    const cardsToDraw = Math.max(0, 5 - hand.length);
    for (let i = 0; i < cardsToDraw; i++) {
      const result = drawFromDeck(next);
      if (result.card) {
        next = result.state;
        next = withPlayer(next, activePlayer, { hand: [...next.players[activePlayer].hand, result.card] });
      } else {
        next = result.state;
        break;
      }
    }
    return {
      ...next,
      pendingResolution: null,
      log: [...next.log, {
        turn: state.turn,
        player: activePlayer,
        action: 'TRIBAL_ELDER_DRAW',
        details: `Drew ${cardsToDraw} card(s) (hand to 5)`,
      }],
    };
  } else {
    // Opponent discards to 3 — chain to OPPONENT_DISCARD
    return {
      ...state,
      pendingResolution: {
        type: 'OPPONENT_DISCARD',
        sourceCard: pending.sourceCard,
        targetPlayer: opponent,
        discardTo: 3,
      },
      log: [...state.log, {
        turn: state.turn,
        player: activePlayer,
        action: 'TRIBAL_ELDER_DISCARD',
        details: 'Made opponent discard down to 3',
      }],
    };
  }
}

function resolveSupplies(state: GameState, pending: PendingBinaryChoice, choice: 0 | 1): GameState {
  const activePlayer = state.currentPlayer;

  if (choice === 0) {
    // Pay 1g, then draw until ware found
    const player = state.players[activePlayer];
    if (player.gold < 1) {
      throw new Error('Not enough gold to pay for Supplies (1g)');
    }
    let next = withPlayer(state, activePlayer, { gold: player.gold - 1 });

    // Execute draw-until-ware inline
    next = drawUntilWare(next, activePlayer);

    return {
      ...next,
      pendingResolution: null,
      log: [...next.log, {
        turn: state.turn,
        player: activePlayer,
        action: 'SUPPLIES_PAY',
        details: 'Paid 1g, drew until ware found',
      }],
    };
  } else {
    // Discard 1 card from hand first — chain to SUPPLIES_DISCARD
    return {
      ...state,
      pendingResolution: {
        type: 'SUPPLIES_DISCARD',
        sourceCard: pending.sourceCard,
      },
      log: [...state.log, {
        turn: state.turn,
        player: activePlayer,
        action: 'SUPPLIES_DISCARD_CHOICE',
        details: 'Chose to discard. Select a card to discard.',
      }],
    };
  }
}
