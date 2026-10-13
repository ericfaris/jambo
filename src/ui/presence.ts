// ============================================================================
// Friend-game presence — the copy and states behind the presence dot, the
// reconnect banner and the opponent seat's status line. Pure.
//
// The server sends graceMsLeft relative to when it sent ROOM_PLAYERS, so the
// countdown is that minus the time since it arrived (no clock skew).
// ============================================================================

import type { OnlineSeatView } from '../multiplayer/types.ts';

export type PresenceDotState = 'online' | 'away' | 'gone';

/** "4:32" — rounds up, never negative. */
export function formatGrace(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Time left to come back, `elapsedMs` after the seat view arrived. */
export function graceLeft(seat: OnlineSeatView, elapsedMs: number): number | null {
  if (seat.status !== 'reconnecting' || seat.graceMsLeft === null) return null;
  return Math.max(0, seat.graceMsLeft - Math.max(0, elapsedMs));
}

/** Under the friend's name: null while they're here. */
export function opponentPresenceLine(seat: OnlineSeatView, elapsedMs = 0): string | null {
  if (seat.status === 'left') return 'Left the game';
  if (seat.status === 'reconnecting') {
    const left = graceLeft(seat, elapsedMs);
    return left === null ? 'Reconnecting…' : `Reconnecting… ${formatGrace(left)}`;
  }
  return null;
}

export function presenceDotState(seat: OnlineSeatView): PresenceDotState {
  return seat.status === 'connected' ? 'online' : seat.status === 'reconnecting' ? 'away' : 'gone';
}

export const PRESENCE_DOT_LABELS: Record<PresenceDotState, string> = {
  online: 'Online',
  away: 'Reconnecting',
  gone: 'Left the game',
};

/** The banner's line for the friend's seat (null = no banner). */
export function presenceBannerLine(name: string, seat: OnlineSeatView | null, elapsedMs: number): string | null {
  if (!seat || seat.status !== 'reconnecting') return null;
  const left = graceLeft(seat, elapsedMs);
  return left === null ? `${name} disconnected — holding their seat` : `${name} disconnected — holding their seat ${formatGrace(left)}`;
}

/** "is back" shows this long after a friend reconnects. */
export const BACK_NOTICE_MS = 2500;
