// ============================================================================
// Room lifecycle rules for the Cast server — kept pure so they're testable
// (server.ts starts listening on import).
// ============================================================================

/**
 * How long a disconnected player's seat is held for them. Long enough for a
 * page refresh, a dropped Wi-Fi connection, or a phone that locked mid-game.
 */
export const PLAYER_RECONNECT_GRACE_MS = 5 * 60_000;

/** Rooms with no activity at all are closed after this long. */
export const ROOM_IDLE_TIMEOUT_MS = 60 * 60_000;

/**
 * A room can be deleted only when nobody is connected AND no seat is still
 * reserved for a player who might reconnect. (Deleting on "nobody connected"
 * alone destroyed every AI game on a single refresh — the human is the only
 * WebSocket connection; the TV uses a separate stream.)
 */
export function isRoomAbandoned(
  connectionCount: number,
  reservations: readonly { expiresAt: number }[],
  now: number,
): boolean {
  return connectionCount === 0 && !reservations.some((r) => r.expiresAt > now);
}

/**
 * Room codes are 4 digits (9,000 possible) and generateRoomCode() retries
 * until it finds a free one — so without a cap, 9,000 live rooms would make
 * it loop forever and freeze the whole server. Refuse new rooms well before.
 */
export const MAX_ROOMS = 2000;

export function canCreateRoom(liveRooms: number): boolean {
  return liveRooms < MAX_ROOMS;
}

/** Largest client message accepted (real ones are well under 2 KB). */
export const MAX_MESSAGE_BYTES = 64 * 1024;
