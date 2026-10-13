import { describe, it, expect } from 'vitest';
import { seatViews, onlineGameResults, onlineAbandon, randomFirstPlayer } from '../../src/multiplayer/friendRoom.ts';
import type { SeatIdentity } from '../../src/multiplayer/friendRoom.ts';
import { validateRecordRequest, validateAbandonRequest } from '../../src/multiplayer/statsApi.ts';
import { createInitialState } from '../../src/engine/GameState.ts';
import type { GameState } from '../../src/engine/types.ts';
import type { PlayerSlot } from '../../src/multiplayer/types.ts';

const sam: SeatIdentity = { name: 'sam_trader', avatarUrl: 'https://a.example/s.png', signedIn: true, profileId: 'prof-sam' };
const kim: SeatIdentity = { name: 'kim', avatarUrl: null, signedIn: true, profileId: 'prof-kim' };
const guest: SeatIdentity = { name: 'Guest', avatarUrl: null, signedIn: false, profileId: null };

function finished(gold: [number, number], endgame: { triggerPlayer: 0 | 1; finalTurnPlayer: 0 | 1 }): GameState {
  const s = createInitialState(5);
  return {
    ...s,
    phase: 'GAME_OVER',
    turn: 31,
    endgame: { ...endgame, isFinalTurn: false },
    players: [{ ...s.players[0], gold: gold[0] }, { ...s.players[1], gold: gold[1] }],
  };
}

describe('seatViews', () => {
  const now = 10_000;
  const none = new Set<PlayerSlot>();
  it('shows each status, never a profile id', () => {
    const views = seatViews({ identities: [sam, guest], connected: new Set<PlayerSlot>([0]), reservations: [{ slot: 1, expiresAt: now + 4_321.6 }], left: none, now });
    expect(views[0]).toEqual({ name: 'sam_trader', avatarUrl: 'https://a.example/s.png', signedIn: true, status: 'connected', graceMsLeft: null });
    expect(views[1]).toEqual({ name: 'Guest', avatarUrl: null, signedIn: false, status: 'reconnecting', graceMsLeft: 4_322 });
    expect(JSON.stringify(views)).not.toContain('prof-');
  });
  it('an empty seat is null', () => {
    expect(seatViews({ identities: [sam, null], connected: new Set<PlayerSlot>([0]), reservations: [], left: none, now })[1]).toBeNull();
  });
  it('an expired reservation reads as left, and graceMsLeft is never negative', () => {
    const v = seatViews({ identities: [sam, kim], connected: new Set<PlayerSlot>([0]), reservations: [{ slot: 1, expiresAt: now - 5 }], left: none, now });
    expect(v[1]?.status).toBe('left');
    const edge = seatViews({ identities: [sam, kim], connected: none, reservations: [{ slot: 0, expiresAt: now + 0.2 }], left: none, now });
    expect(edge[0]?.graceMsLeft).toBeGreaterThanOrEqual(0);
  });
  it('left beats a lingering reservation and a connection', () => {
    const v = seatViews({ identities: [sam, kim], connected: new Set<PlayerSlot>([1]), reservations: [{ slot: 1, expiresAt: now + 9_000 }], left: new Set<PlayerSlot>([1]), now });
    expect(v[1]?.status).toBe('left');
  });
});

describe('onlineGameResults', () => {
  it('host wins: one row per signed-in seat, from each seat\'s side', () => {
    const rows = onlineGameResults(finished([64, 50], { triggerPlayer: 0, finalTurnPlayer: 1 }), [sam, kim], 99, []);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ localProfileId: 'prof-sam', mode: 'online', winner: 0, playerGold: 64, opponentGold: 50, opponentProfileId: 'prof-kim', turnCount: 31, completedAt: 99 });
    expect(rows[1]).toMatchObject({ localProfileId: 'prof-kim', mode: 'online', winner: 1, playerGold: 50, opponentGold: 64, opponentProfileId: 'prof-sam' });
    expect(rows[0]!.aiDifficulty).toBeUndefined();
  });
  it('guest wins', () => {
    const rows = onlineGameResults(finished([40, 66], { triggerPlayer: 1, finalTurnPlayer: 0 }), [sam, kim], 1, []);
    expect(rows.map((r) => [r.localProfileId, r.winner])).toEqual([['prof-sam', 1], ['prof-kim', 0]]);
  });
  it('a tie goes to the final-turn player', () => {
    const rows = onlineGameResults(finished([61, 61], { triggerPlayer: 0, finalTurnPlayer: 1 }), [sam, kim], 1, []);
    expect(rows.find((r) => r.localProfileId === 'prof-kim')?.winner).toBe(0);
    expect(rows.find((r) => r.localProfileId === 'prof-sam')?.winner).toBe(1);
  });
  it('a guest opponent: only the signed-in seat is recorded, against a null opponent', () => {
    const rows = onlineGameResults(finished([64, 50], { triggerPlayer: 0, finalTurnPlayer: 1 }), [guest, kim], 1, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ localProfileId: 'prof-kim', winner: 1, opponentProfileId: null });
  });
  it('two guests: nothing', () => {
    expect(onlineGameResults(finished([64, 50], { triggerPlayer: 0, finalTurnPlayer: 1 }), [guest, guest], 1, [])).toEqual([]);
  });
  it('self-play (both seats one profile): nothing', () => {
    expect(onlineGameResults(finished([64, 50], { triggerPlayer: 0, finalTurnPlayer: 1 }), [sam, { ...sam, name: 'other tab' }], 1, [])).toEqual([]);
  });
  it('a game in progress: nothing', () => {
    expect(onlineGameResults(createInitialState(1), [sam, kim], 1, [])).toEqual([]);
  });
});

describe('onlineAbandon', () => {
  const live = { ...createInitialState(3), turn: 7 };
  it("records a signed-in leaver's abandon from their side", () => {
    const leaverGold = { ...live, players: [{ ...live.players[0], gold: 12 }, { ...live.players[1], gold: 30 }] as GameState['players'] };
    expect(onlineAbandon(leaverGold, 1, kim, 500)).toEqual({
      localProfileId: 'prof-kim', mode: 'online', playerGold: 30, opponentGold: 12, turnCount: 7, rngSeed: leaverGold.rngSeed, abandonedAt: 500,
    });
  });
  it('is null in the lobby, after GAME_OVER, or for a guest', () => {
    expect(onlineAbandon(null, 0, sam, 1)).toBeNull();
    expect(onlineAbandon(finished([64, 50], { triggerPlayer: 0, finalTurnPlayer: 1 }), 0, sam, 1)).toBeNull();
    expect(onlineAbandon(live, 0, guest, 1)).toBeNull();
    expect(onlineAbandon(live, 0, null, 1)).toBeNull();
  });
  it('the HTTP endpoints still reject what the server records (no forging)', () => {
    const result = onlineGameResults(finished([64, 50], { triggerPlayer: 0, finalTurnPlayer: 1 }), [sam, kim], 1, [])[0];
    expect(validateRecordRequest(result)).toBe(false);
    expect(validateAbandonRequest(onlineAbandon(live, 0, sam, 1))).toBe(false);
  });
});

describe('randomFirstPlayer', () => {
  it('can pick either seat', () => {
    expect(randomFirstPlayer(() => 0.1)).toBe(0);
    expect(randomFirstPlayer(() => 0.9)).toBe(1);
  });
});
