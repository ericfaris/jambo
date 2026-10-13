// ============================================================================
// Play a friend — which lobby screen to show, from the socket's state. Pure.
// ============================================================================

import type { OnlineSeatView, PlayerSlot } from '../multiplayer/types.ts';
import { friendlyJoinError } from './friendRoute.ts';

export type LobbyMode = 'host' | 'join';

export type LobbyView =
  | { kind: 'connecting' }
  /** Host: asking the server for a room. */
  | { kind: 'creating' }
  /** Invite link: on the way into room `code`. */
  | { kind: 'joining'; code: string }
  /** Seated, no game yet: the host shows the invite; a guest waits for the host. */
  | { kind: 'waiting'; code: string; friendLeft: boolean }
  | { kind: 'error'; title: string; body: string };

export interface LobbyInput {
  mode: LobbyMode;
  connected: boolean;
  roomCode: string | null;
  playerSlot: PlayerSlot | null;
  error: string | null;
  seats: readonly [OnlineSeatView | null, OnlineSeatView | null] | null;
  /** The room the invite link names (join mode). */
  inviteCode: string | null;
}

export function lobbyView({ mode, connected, roomCode, playerSlot, error, seats, inviteCode }: LobbyInput): LobbyView {
  if (error) {
    const friendly = friendlyJoinError(error);
    if (friendly) return { kind: 'error', ...friendly };
    // Not seated yet, so the error is about getting in
    if (playerSlot === null) return { kind: 'error', title: 'Couldn’t start the game', body: error };
  }
  if (!connected) return { kind: 'connecting' };
  if (playerSlot !== null && roomCode) {
    const friend = seats?.[playerSlot === 0 ? 1 : 0] ?? null;
    return { kind: 'waiting', code: roomCode, friendLeft: friend?.status === 'left' };
  }
  if (mode === 'join') return { kind: 'joining', code: inviteCode ?? roomCode ?? '' };
  return { kind: 'creating' };
}
