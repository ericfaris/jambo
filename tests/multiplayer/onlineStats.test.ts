import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { GameResultInput } from '../../src/multiplayer/statsStore.ts';

// Stats never touch Mongo or .data/ in tests: point the store at a temp dir
// before it is first used (it resolves the path lazily).
const dir = mkdtempSync(join(tmpdir(), 'jambo-online-stats-'));
const prevDir = process.env['JAMBO_DATA_DIR'];
const prevMongo = process.env['MONGODB_URI'];

beforeAll(() => {
  process.env['JAMBO_DATA_DIR'] = dir;
  delete process.env['MONGODB_URI'];
});
afterAll(() => {
  if (prevDir === undefined) delete process.env['JAMBO_DATA_DIR']; else process.env['JAMBO_DATA_DIR'] = prevDir;
  if (prevMongo !== undefined) process.env['MONGODB_URI'] = prevMongo;
  rmSync(dir, { recursive: true, force: true });
});

const solo = (over: Partial<GameResultInput>): GameResultInput => ({
  localProfileId: 'p-online', aiDifficulty: 'hard', winner: 0, playerGold: 61, opponentGold: 40,
  turnCount: 30, rngSeed: 1, completedAt: 1_000, ...over,
});

describe('online results stay out of the solo record', () => {
  it('summary and difficulty breakdown equal the solo games alone', async () => {
    const store = await import('../../src/multiplayer/statsStore.ts');
    await store.recordCompletedGame(solo({ completedAt: 1_000, winner: 0, playerGold: 61 }));
    await store.recordCompletedGame(solo({ completedAt: 2_000, winner: 1, playerGold: 35, aiDifficulty: 'easy' }));
    const soloSummary = await store.getStatsSummary('p-online');
    const soloBreakdown = await store.getDifficultyBreakdown('p-online');

    await store.recordCompletedGame({
      localProfileId: 'p-online', mode: 'online', winner: 0, playerGold: 90, opponentGold: 12,
      turnCount: 10, rngSeed: 7, completedAt: 3_000, opponentProfileId: null,
    });
    expect(await store.getStatsSummary('p-online')).toEqual(soloSummary);
    expect(await store.getDifficultyBreakdown('p-online')).toEqual(soloBreakdown);
    expect(soloSummary).toMatchObject({ gamesPlayed: 2, wins: 1, losses: 1, bestPlayerGold: 61 });
  });

  it('an online abandon counts toward gamesAbandoned', async () => {
    const store = await import('../../src/multiplayer/statsStore.ts');
    const before = (await store.getStatsSummary('p-online')).gamesAbandoned;
    await store.recordAbandonedGame({
      localProfileId: 'p-online', mode: 'online', playerGold: 20, opponentGold: 25, turnCount: 6, rngSeed: 9, abandonedAt: 4_000,
    });
    expect((await store.getStatsSummary('p-online')).gamesAbandoned).toBe(before + 1);
  });

  it('legacy rows without a mode count as solo', async () => {
    // A stats file written before modes existed, read by a fresh store instance
    const legacyDir = mkdtempSync(join(tmpdir(), 'jambo-legacy-stats-'));
    writeFileSync(join(legacyDir, 'stats.json'), JSON.stringify({
      legacy: [{ localProfileId: 'legacy', aiDifficulty: 'medium', winner: 0, playerGold: 60, opponentGold: 50, turnCount: 20, rngSeed: 3, completedAt: 5 }],
    }));
    const { vi } = await import('vitest');
    vi.resetModules();
    process.env['JAMBO_DATA_DIR'] = legacyDir;
    try {
      const fresh = await import('../../src/multiplayer/statsStore.ts');
      expect((await fresh.getStatsSummary('legacy')).gamesPlayed).toBe(1);
      expect((await fresh.getDifficultyBreakdown('legacy')).find((d) => d.difficulty === 'medium')?.gamesPlayed).toBe(1);
    } finally {
      process.env['JAMBO_DATA_DIR'] = dir;
      rmSync(legacyDir, { recursive: true, force: true });
    }
  });
});

describe('the HTTP API cannot forge an online result', () => {
  it('validateRecordRequest rejects any non-solo mode', async () => {
    const { validateRecordRequest } = await import('../../src/multiplayer/statsApi.ts');
    const body = { localProfileId: 'p1', aiDifficulty: 'easy', winner: 0, playerGold: 60, opponentGold: 10, turnCount: 9, rngSeed: 1 };
    expect(validateRecordRequest(body)).toBe(true);
    expect(validateRecordRequest({ ...body, mode: 'solo' })).toBe(true);
    expect(validateRecordRequest({ ...body, mode: 'online' })).toBe(false);
    const { aiDifficulty: _drop, ...noDifficulty } = body;
    expect(validateRecordRequest({ ...noDifficulty, mode: 'online' })).toBe(false);
  });
  it('validateAbandonRequest rejects an online abandon', async () => {
    const { validateAbandonRequest } = await import('../../src/multiplayer/statsApi.ts');
    expect(validateAbandonRequest({ localProfileId: 'p1', mode: 'online', aiDifficulty: 'easy', playerGold: 1, opponentGold: 1, turnCount: 1, rngSeed: 1 })).toBe(false);
  });
});
