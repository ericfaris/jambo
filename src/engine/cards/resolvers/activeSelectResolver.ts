// ============================================================================
// Active Select Resolver - Throne (swap), Parrot (steal)
// ============================================================================

import { hasUsefulThroneSwap, throneGiveOptions } from '../../market/throneSwap.ts';
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

  // Throne exchanges one ware each way, in place: the taken ware takes the
  // given ware's slot and vice versa, so no new market space is filled.
  // A save from before the give-first order may hold a STEAL step with no
  // given ware yet — start it over at the give step.
  if (pending.step === 'GIVE' || pending.givenIndex === undefined || !pending.givenWare) {
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

    // Guard: only same-type exchanges left (e.g. both markets hold just tea) — nothing would change
    if (!hasUsefulThroneSwap(state, activePlayer)) {
      return {
        ...state,
        pendingResolution: null,
        log: [...state.log, { turn: state.turn, player: activePlayer, action: 'THRONE_SWAP', details: 'No exchange would change anything' }],
      };
    }
    if (pending.step !== 'GIVE') {
      return { ...state, pendingResolution: { type: 'WARE_THEFT_SWAP', sourceCard: pending.sourceCard, step: 'GIVE' } };
    }

    // Step 1: Active player picks their own ware to give
    if (response.type !== 'SELECT_WARE') {
      throw new Error('Expected SELECT_WARE for Throne give step');
    }
    const { wareIndex } = response;
    const ware = state.players[activePlayer].market[wareIndex];
    if (!ware) {
      throw new Error(`Your slot ${wareIndex} is empty`);
    }
    if (!throneGiveOptions(state, activePlayer).includes(wareIndex)) {
      throw new Error(`Throne: opponent has nothing different to give for ${ware}`);
    }

    return {
      ...state,
      pendingResolution: { ...pending, step: 'STEAL', givenWare: ware, givenIndex: wareIndex },
    };
  }

  {
    const givenIndex = pending.givenIndex;
    const givenWare = pending.givenWare;

    // Step 2: Active player picks the opponent's ware to take in exchange
    if (response.type !== 'SELECT_WARE') {
      throw new Error('Expected SELECT_WARE for Throne take step');
    }
    const { wareIndex } = response;
    const ware = state.players[opponent].market[wareIndex];
    if (!ware) {
      throw new Error(`Opponent's slot ${wareIndex} is empty`);
    }
    if (ware === givenWare) {
      throw new Error(`Throne: take a ware other than ${givenWare} — a same-type swap changes nothing`);
    }

    let newState = removeWareFromMarket(state, activePlayer, givenIndex).state;
    newState = removeWareFromMarket(newState, opponent, wareIndex).state;
    newState = setWareAtSlot(newState, activePlayer, givenIndex, ware);
    newState = setWareAtSlot(newState, opponent, wareIndex, givenWare);

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
        details: `Stole ${ware}, gave ${givenWare}`,
      }],
    };
  }
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

