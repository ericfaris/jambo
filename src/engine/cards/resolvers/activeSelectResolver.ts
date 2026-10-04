// ============================================================================
// Active Select Resolver - Throne (swap), Parrot (steal)
// ============================================================================

import type {
  GameState,
  PendingWareTheftSwap,
  PendingWareTheftSingle,
  InteractionResponse,
} from '../../types.ts';
import { addWareToMarket, getPlacementCapacity, removeWareFromMarket, setWareAtSlot } from '../../market/MarketManager.ts';

type ActiveSelectPending = PendingWareTheftSwap | PendingWareTheftSingle;

export function resolveActiveSelect(
  state: GameState,
  pending: ActiveSelectPending,
  response: InteractionResponse
): GameState {
  switch (pending.type) {
    case 'WARE_THEFT_SWAP':
      return resolveThrone(state, pending, response);
    case 'WARE_THEFT_SINGLE':
      return resolveParrot(state, pending, response);
    default:
      throw new Error(`Unknown active select type`);
  }
}

function resolveThrone(
  state: GameState,
  pending: PendingWareTheftSwap,
  response: InteractionResponse
): GameState {
  const activePlayer = state.currentPlayer;
  const opponent: 0 | 1 = activePlayer === 0 ? 1 : 0;

  // Throne exchanges one ware each way, in place: the stolen ware takes the
  // given ware's slot and vice versa, so no new market space is filled.
  if (pending.step === 'STEAL') {
    // Guard: either side has nothing to exchange — auto-resolve
    if (!state.players[opponent].market.some(w => w !== null)) {
      return {
        ...state,
        pendingResolution: null,
        log: [...state.log, { turn: state.turn, player: activePlayer, action: 'THRONE_SWAP', details: 'Opponent has no wares to exchange' }],
      };
    }
    if (!state.players[activePlayer].market.some(w => w !== null)) {
      return {
        ...state,
        pendingResolution: null,
        log: [...state.log, { turn: state.turn, player: activePlayer, action: 'THRONE_SWAP', details: 'You have no wares to exchange' }],
      };
    }

    // Step 1: Active player picks the opponent's ware to take
    if (response.type !== 'SELECT_WARE') {
      throw new Error('Expected SELECT_WARE for Throne steal step');
    }
    const { wareIndex } = response;
    const ware = state.players[opponent].market[wareIndex];
    if (!ware) {
      throw new Error(`Opponent's slot ${wareIndex} is empty`);
    }

    return {
      ...state,
      pendingResolution: { ...pending, step: 'GIVE', stolenWare: ware, stolenIndex: wareIndex },
    };
  }

  if (pending.step === 'GIVE') {
    const stolenIndex = pending.stolenIndex;
    const stolenWare = pending.stolenWare;
    if (stolenIndex === undefined || !stolenWare) {
      throw new Error('Throne give step is missing the selected opponent ware');
    }

    // Step 2: Active player picks their own ware to give in exchange
    if (response.type !== 'SELECT_WARE') {
      throw new Error('Expected SELECT_WARE for Throne give step');
    }
    const { wareIndex } = response;
    const ware = state.players[activePlayer].market[wareIndex];
    if (!ware) {
      throw new Error(`Your slot ${wareIndex} is empty`);
    }

    let newState = removeWareFromMarket(state, activePlayer, wareIndex).state;
    newState = removeWareFromMarket(newState, opponent, stolenIndex).state;
    newState = setWareAtSlot(newState, activePlayer, wareIndex, stolenWare);
    newState = setWareAtSlot(newState, opponent, stolenIndex, ware);

    // Mark Throne utility as used this turn
    const newUtilities = state.players[activePlayer].utilities.map(u =>
      u.designId === 'throne' ? { ...u, usedThisTurn: true } : u
    );
    const newPlayers = [...newState.players] as [typeof newState.players[0], typeof newState.players[1]];
    newPlayers[activePlayer] = { ...newPlayers[activePlayer], utilities: newUtilities };

    return {
      ...newState,
      players: newPlayers,
      pendingResolution: null,
      log: [...newState.log, {
        turn: state.turn,
        player: activePlayer,
        action: 'THRONE_SWAP',
        details: `Stole ${stolenWare}, gave ${ware}`,
      }],
    };
  }

  throw new Error(`Unknown Throne step: ${pending.step}`);
}

function resolveParrot(
  state: GameState,
  _pending: PendingWareTheftSingle,
  response: InteractionResponse
): GameState {
  const activePlayer = state.currentPlayer;
  const opponent: 0 | 1 = activePlayer === 0 ? 1 : 0;

  // Guard: no room (or can't pay the 6th-space fee) — the ware stays put
  if (getPlacementCapacity(state, activePlayer) < 1) {
    return {
      ...state,
      pendingResolution: null,
      log: [...state.log, { turn: state.turn, player: activePlayer, action: 'PARROT_STEAL', details: 'Your market is full; cannot steal a ware' }],
    };
  }

  // Guard: opponent has no wares — auto-resolve
  if (!state.players[opponent].market.some(w => w !== null)) {
    return {
      ...state,
      pendingResolution: null,
      log: [...state.log, { turn: state.turn, player: activePlayer, action: 'PARROT_STEAL', details: 'Opponent has no wares to steal' }],
    };
  }

  if (response.type !== 'SELECT_WARE') {
    throw new Error('Expected SELECT_WARE for Parrot steal');
  }
  const { wareIndex } = response;

  const ware = state.players[opponent].market[wareIndex];
  if (!ware) {
    throw new Error(`Opponent's slot ${wareIndex} is empty`);
  }

  let newState = removeWareFromMarket(state, opponent, wareIndex).state;
  newState = addWareToMarket(newState, activePlayer, ware);

  return {
    ...newState,
    pendingResolution: null,
    log: [...newState.log, {
      turn: state.turn,
      player: activePlayer,
      action: 'PARROT_STEAL',
      details: `Stole ${ware} from opponent`,
    }],
  };
}

