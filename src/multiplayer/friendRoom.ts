// ============================================================================
// Friend rooms ("Play a friend") — the pure rules the server applies: how each
// seat looks to both players, which results and abandons get recorded, and
// who goes first. Kept pure so it's testable (server.ts listens on import).
// ============================================================================

import type { GameAction, GameState } from '../engine/types.ts';
import { getWinner } from '../engine/endgame/EndgameManager.ts';
import type { AbandonedGameInput, GameResultInput } from './statsStore.ts';
import type { OnlineSeatView, PlayerSlot } from './types.ts';

/** Who sits in a seat. `profileId` stays on the server; the rest is shown to both players. */
export interface SeatIdentity {
  name: string;
  avatarUrl: string | null;
  signedIn: boolean;
  /** The canonical stats profile — set only for signed-in players. */
  profileId: string | null;
}

export type SeatPair<T> = [T | null, T | null];

export function seatViews(input: {
  identities: SeatPair<SeatIdentity>;
  connected: ReadonlySet<PlayerSlot>;
  reservations: readonly { slot: PlayerSlot; expiresAt: number }[];
  left: ReadonlySet<PlayerSlot>;
  now: number;
}): SeatPair<OnlineSeatView> {
  const view = (slot: PlayerSlot): OnlineSeatView | null => {
    const identity = input.identities[slot];
    if (!identity) return null;
    const base = { name: identity.name, avatarUrl: identity.avatarUrl, signedIn: identity.signedIn };
    // A seat that left is gone for good, even if a stale reservation lingers
    if (input.left.has(slot)) return { ...base, status: 'left', graceMsLeft: null };
    if (input.connected.has(slot)) return { ...base, status: 'connected', graceMsLeft: null };
    const reservation = input.reservations.find((r) => r.slot === slot && r.expiresAt > input.now);
    if (reservation) {
      return { ...base, status: 'reconnecting', graceMsLeft: Math.max(0, Math.round(reservation.expiresAt - input.now)) };
    }
    return { ...base, status: 'left', graceMsLeft: null };
  };
  return [view(0), view(1)];
}

/**
 * One result per signed-in seat for a finished game (`mode: 'online'`).
 * Nothing when the game isn't over, has no winner, nobody is signed in, or
 * both seats are the same profile (playing yourself proves nothing).
 */
export function onlineGameResults(
  state: GameState,
  identities: SeatPair<SeatIdentity>,
  completedAt: number,
  actions: readonly GameAction[],
): GameResultInput[] {
  const winnerSeat = getWinner(state);
  if (winnerSeat === null) return [];
  const ids = [identities[0]?.profileId ?? null, identities[1]?.profileId ?? null];
  if (ids[0] !== null && ids[0] === ids[1]) return [];
  const results: GameResultInput[] = [];
  for (const seat of [0, 1] as const) {
    const profileId = ids[seat];
    if (!profileId) continue;
    const other = (1 - seat) as PlayerSlot;
    results.push({
      localProfileId: profileId,
      mode: 'online',
      winner: winnerSeat === seat ? 0 : 1,
      playerGold: state.players[seat].gold,
      opponentGold: state.players[other].gold,
      turnCount: state.turn,
      rngSeed: state.rngSeed,
      completedAt,
      actions: [...actions],
      opponentProfileId: ids[other],
    });
  }
  return results;
}

/** The leaver's abandon, if there's a live game and they're signed in. */
export function onlineAbandon(
  state: GameState | null,
  leaver: PlayerSlot,
  identity: SeatIdentity | null,
  abandonedAt: number,
): AbandonedGameInput | null {
  if (!state || state.phase === 'GAME_OVER') return null;
  if (!identity?.profileId) return null;
  return {
    localProfileId: identity.profileId,
    mode: 'online',
    playerGold: state.players[leaver].gold,
    opponentGold: state.players[1 - leaver as PlayerSlot].gold,
    turnCount: state.turn,
    rngSeed: state.rngSeed,
    abandonedAt,
  };
}

export function randomFirstPlayer(rng: () => number = Math.random): PlayerSlot {
  return rng() < 0.5 ? 0 : 1;
}
