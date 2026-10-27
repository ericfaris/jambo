import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { validateAbandonRequest } from '../../src/multiplayer/statsApi.ts';
import { abandonedGamePayload, abandonSavedGame } from '../../src/persistence/userStatsApi.ts';
import { saveLocalGame, loadLocalGame } from '../../src/persistence/savedGame.ts';
import { createTestState } from '../helpers/testHelpers.ts';

function validAbandon(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    localProfileId: 'abc-123_test.user',
    mode: 'solo',
    aiDifficulty: 'hard',
    playerGold: 31,
    opponentGold: 40,
    turnCount: 12,
    rngSeed: 42,
    abandonedAt: 1_760_000_000_000,
    ...overrides,
  };
}

describe('validateAbandonRequest', () => {
  it('accepts a valid solo abandon, with or without abandonedAt', () => {
    expect(validateAbandonRequest(validAbandon())).toBe(true);
    expect(validateAbandonRequest(validAbandon({ abandonedAt: undefined }))).toBe(true);
  });

  it.each([
    ['bad profile id', { localProfileId: 'a b' }],
    ['unknown mode', { mode: 'cast' }],
    ['removed pass-and-play mode', { mode: 'multiplayer' }],
    ['unknown difficulty', { aiDifficulty: 'insane' }],
    ['negative gold', { playerGold: -1 }],
    ['fractional turn', { turnCount: 1.5 }],
    ['non-integer seed', { rngSeed: 'x' }],
    ['negative abandonedAt', { abandonedAt: -5 }],
  ])('rejects %s', (_label, overrides) => {
    expect(validateAbandonRequest(validAbandon(overrides))).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(validateAbandonRequest(null)).toBe(false);
    expect(validateAbandonRequest('x')).toBe(false);
  });
});

describe('abandonedGamePayload', () => {
  it('captures where the game stood, and passes server validation', () => {
    const base = createTestState();
    const state = { ...base, turn: 9, players: [{ ...base.players[0], gold: 33 }, { ...base.players[1], gold: 27 }] as typeof base.players };
    const payload = abandonedGamePayload(state, 'solo', 'expert', 123);
    expect(payload).toEqual({ mode: 'solo', aiDifficulty: 'expert', playerGold: 33, opponentGold: 27, turnCount: 9, rngSeed: state.rngSeed, abandonedAt: 123 });
    expect(validateAbandonRequest({ localProfileId: 'p1', ...payload })).toBe(true);
  });
});

describe('abandonSavedGame (menu abandon, or starting a new game over a save)', () => {
  function memoryStorage() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  }

  it('logs the unfinished save as abandoned, then deletes it', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const storage = memoryStorage();
      saveLocalGame({ mode: 'solo', aiDifficulty: 'hard', state: createTestState(), replayActions: [], taggedActions: [], startingPlayer: 0 }, storage);
      abandonSavedGame(storage);
      expect(loadLocalGame(storage)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/stats/abandon');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toMatchObject({ mode: 'solo', aiDifficulty: 'hard' });
      expect(validateAbandonRequest(body)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('logs nothing when there is no save (e.g. the last game finished)', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    try {
      abandonSavedGame(memoryStorage());
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('statsStore abandon log (local file mode)', () => {
  let dir: string;
  const prevDir = process.env['JAMBO_DATA_DIR'];
  const prevMongo = process.env['MONGODB_URI'];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'jambo-stats-'));
    process.env['JAMBO_DATA_DIR'] = dir;
    delete process.env['MONGODB_URI'];
  });

  afterAll(() => {
    if (prevDir === undefined) delete process.env['JAMBO_DATA_DIR']; else process.env['JAMBO_DATA_DIR'] = prevDir;
    if (prevMongo !== undefined) process.env['MONGODB_URI'] = prevMongo;
    rmSync(dir, { recursive: true, force: true });
  });

  it('counts abandons per profile, idempotently, without touching wins/losses', async () => {
    const store = await import('../../src/multiplayer/statsStore.ts');
    const base = { mode: 'solo' as const, aiDifficulty: 'hard' as const, playerGold: 20, opponentGold: 25, turnCount: 4, rngSeed: 7 };

    await store.recordAbandonedGame({ ...base, localProfileId: 'alice', abandonedAt: 1000 });
    await store.recordAbandonedGame({ ...base, localProfileId: 'alice', abandonedAt: 1000 }); // retry
    await store.recordAbandonedGame({ ...base, localProfileId: 'alice', abandonedAt: 2000 });
    await store.recordAbandonedGame({ ...base, localProfileId: 'bob', abandonedAt: 1000 });

    const alice = await store.getStatsSummary('alice');
    expect(alice.gamesAbandoned).toBe(2);
    expect(alice.gamesPlayed).toBe(0);
    expect(alice.losses).toBe(0);
    expect((await store.getStatsSummary('bob')).gamesAbandoned).toBe(1);
    expect((await store.getStatsSummary('carol')).gamesAbandoned).toBe(0);

    const onDisk = JSON.parse(readFileSync(join(dir, 'abandons.json'), 'utf-8')) as Record<string, unknown[]>;
    expect(onDisk['alice']).toHaveLength(2);
  });
});
