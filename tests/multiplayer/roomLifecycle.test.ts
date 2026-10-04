import { describe, it, expect } from 'vitest';
import { isRoomAbandoned, PLAYER_RECONNECT_GRACE_MS, canCreateRoom, MAX_ROOMS, MAX_MESSAGE_BYTES } from '../../src/multiplayer/roomLifecycle.ts';

describe('isRoomAbandoned (Cast server room cleanup)', () => {
  const now = 1_000_000;

  it('keeps an empty room while a seat is reserved — a refresh must not destroy an AI game', () => {
    expect(isRoomAbandoned(0, [{ expiresAt: now + 30_000 }], now)).toBe(false);
  });

  it('deletes an empty room once every reservation has expired', () => {
    expect(isRoomAbandoned(0, [{ expiresAt: now - 1 }], now)).toBe(true);
    expect(isRoomAbandoned(0, [], now)).toBe(true);
  });

  it('never deletes a room with someone connected', () => {
    expect(isRoomAbandoned(1, [], now)).toBe(false);
  });

  it('holds seats long enough for a refresh or a locked phone', () => {
    expect(PLAYER_RECONNECT_GRACE_MS).toBeGreaterThanOrEqual(2 * 60_000);
  });
});

describe('server capacity limits (deep-dive 2026-10-04)', () => {
  it('stops creating rooms well before the 9,000 four-digit codes run out (generateRoomCode would loop forever)', () => {
    expect(MAX_ROOMS).toBeLessThan(9000);
    expect(canCreateRoom(MAX_ROOMS - 1)).toBe(true);
    expect(canCreateRoom(MAX_ROOMS)).toBe(false);
  });
  it('caps client message size far below the ws default (100 MB)', () => {
    expect(MAX_MESSAGE_BYTES).toBeLessThanOrEqual(256 * 1024);
  });
});
