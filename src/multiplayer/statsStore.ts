import { MongoClient } from 'mongodb';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const DEFAULT_DATA_DIR = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..', '..', '.data');

// Resolved on first use (not at import) so tests can point JAMBO_DATA_DIR at a temp dir
function localDataPath(file: string): string {
  return join(process.env['JAMBO_DATA_DIR'] || DEFAULT_DATA_DIR, file);
}

function loadLocalMap<T>(path: string): Map<string, T[]> {
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, T[]>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function saveLocalMap<T>(path: string, results: Map<string, T[]>): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const obj: Record<string, T[]> = Object.fromEntries(results);
    writeFileSync(path, JSON.stringify(obj, null, 2));
  } catch {
    // silently fail if write not possible
  }
}

/** Absent on legacy rows and solo results; 'online' = a friend game (recorded by the server). */
export type GameResultMode = 'solo' | 'online';
type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface GameResultInput {
  localProfileId: string;
  mode?: GameResultMode;
  /** Required for solo results (the HTTP validator enforces it); absent online. */
  aiDifficulty?: Difficulty;
  /** 0 = this profile won. */
  winner: 0 | 1;
  playerGold: number;
  opponentGold: number;
  turnCount: number;
  rngSeed: number;
  completedAt: number;
  actions?: unknown[];
  /** Online only: the other seat's profile (null = a guest). */
  opponentProfileId?: string | null;
}

/** A game the player abandoned before it finished: local (solo) or online. 'multiplayer' = legacy pass-and-play rows. */
export interface AbandonedGameInput {
  localProfileId: string;
  mode: 'solo' | 'multiplayer' | 'online';
  aiDifficulty?: Difficulty;
  playerGold: number;
  opponentGold: number;
  turnCount: number;
  rngSeed: number;
  abandonedAt: number;
}

export interface UserStatsSummary {
  localProfileId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  averagePlayerGold: number;
  bestPlayerGold: number;
  averageTurns: number;
  lastPlayedAt: number | null;
  gamesAbandoned: number;
}

interface GameResultDocument {
  localProfileId: string;
  mode?: GameResultMode;
  aiDifficulty?: Difficulty;
  opponentProfileId?: string | null;
  winner: 0 | 1;
  playerGold: number;
  opponentGold: number;
  turnCount: number;
  rngSeed: number;
  completedAt: Date;
  createdAt: Date;
}

interface AbandonedGameDocument extends Omit<AbandonedGameInput, 'abandonedAt'> {
  abandonedAt: Date;
  createdAt: Date;
}

let memoryResultsCache: Map<string, GameResultInput[]> | null = null;
let memoryAbandonsCache: Map<string, AbandonedGameInput[]> | null = null;

function memoryResults(): Map<string, GameResultInput[]> {
  memoryResultsCache ??= loadLocalMap<GameResultInput>(localDataPath('stats.json'));
  return memoryResultsCache;
}

function memoryAbandons(): Map<string, AbandonedGameInput[]> {
  memoryAbandonsCache ??= loadLocalMap<AbandonedGameInput>(localDataPath('abandons.json'));
  return memoryAbandonsCache;
}

let mongoClientPromise: Promise<MongoClient> | null = null;
let mongoIndexesReady = false;

function getMongoUri(): string {
  return process.env['MONGODB_URI'] ?? '';
}

function getMongoDbName(): string {
  const explicit = process.env['MONGODB_DB'];
  if (explicit) {
    return explicit;
  }

  const uri = getMongoUri();
  if (!uri) {
    return 'jambo';
  }

  try {
    const parsed = new URL(uri);
    const dbName = parsed.pathname.replace(/^\//, '').trim();
    return dbName || 'jambo';
  } catch {
    return 'jambo';
  }
}

function isMongoEnabled(): boolean {
  return Boolean(getMongoUri());
}

async function getMongoClient(): Promise<MongoClient> {
  if (!mongoClientPromise) {
    const uri = getMongoUri();
    if (!uri) {
      throw new Error('MONGODB_URI is not configured');
    }
    mongoClientPromise = new MongoClient(uri).connect();
  }
  return mongoClientPromise;
}

async function ensureIndexes(): Promise<void> {
  if (!isMongoEnabled() || mongoIndexesReady) {
    return;
  }

  const client = await getMongoClient();
  const db = client.db(getMongoDbName());
  const collection = db.collection<GameResultDocument>('game_results');

  await collection.createIndex({ localProfileId: 1, completedAt: -1 });
  await collection.createIndex({ localProfileId: 1, completedAt: 1 }, { unique: true });

  const gameLogs = db.collection('game_logs');
  await gameLogs.createIndex({ localProfileId: 1, completedAt: -1 });

  const abandons = db.collection<AbandonedGameDocument>('game_abandons');
  await abandons.createIndex({ localProfileId: 1, abandonedAt: 1 }, { unique: true });

  mongoIndexesReady = true;
}

/** Online results are kept out of the solo record (wins, win rate, levels); legacy rows have no mode. */
function isOnline(result: { mode?: GameResultMode }): boolean {
  return result.mode === 'online';
}

const NOT_ONLINE = { mode: { $ne: 'online' as const } };

function sanitizeSummary(localProfileId: string, results: readonly GameResultInput[], gamesAbandoned = 0): UserStatsSummary {
  if (results.length === 0) {
    return {
      localProfileId,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      averagePlayerGold: 0,
      bestPlayerGold: 0,
      averageTurns: 0,
      lastPlayedAt: null,
      gamesAbandoned,
    };
  }

  const gamesPlayed = results.length;
  const wins = results.filter((result) => result.winner === 0).length;
  const losses = gamesPlayed - wins;
  const totalGold = results.reduce((sum, result) => sum + result.playerGold, 0);
  const totalTurns = results.reduce((sum, result) => sum + result.turnCount, 0);
  const bestPlayerGold = results.reduce((max, result) => Math.max(max, result.playerGold), 0);
  const lastPlayedAt = results.reduce((latest, result) => Math.max(latest, result.completedAt), 0);

  return {
    localProfileId,
    gamesPlayed,
    wins,
    losses,
    winRate: gamesPlayed > 0 ? wins / gamesPlayed : 0,
    averagePlayerGold: totalGold / gamesPlayed,
    bestPlayerGold,
    averageTurns: totalTurns / gamesPlayed,
    lastPlayedAt,
    gamesAbandoned,
  };
}

export async function recordCompletedGame(result: GameResultInput): Promise<void> {
  if (!isMongoEnabled()) {
    const existing = memoryResults().get(result.localProfileId) ?? [];
    if (existing.some((entry) => entry.completedAt === result.completedAt)) {
      return;
    }
    memoryResults().set(result.localProfileId, [...existing, result]);
    saveLocalMap(localDataPath('stats.json'), memoryResults());
    return;
  }

  await ensureIndexes();
  const client = await getMongoClient();
  const db = client.db(getMongoDbName());
  const collection = db.collection<GameResultDocument>('game_results');

  const gameId = randomUUID();
  const now = new Date();

  await collection.updateOne(
    { localProfileId: result.localProfileId, completedAt: new Date(result.completedAt) },
    {
      $setOnInsert: {
        gameId,
        localProfileId: result.localProfileId,
        mode: result.mode ?? 'solo',
        ...(result.aiDifficulty ? { aiDifficulty: result.aiDifficulty } : {}),
        ...(isOnline(result) ? { opponentProfileId: result.opponentProfileId ?? null } : {}),
        winner: result.winner,
        playerGold: result.playerGold,
        opponentGold: result.opponentGold,
        turnCount: result.turnCount,
        rngSeed: result.rngSeed,
        completedAt: new Date(result.completedAt),
        createdAt: now,
      },
    },
    { upsert: true },
  );

  if (result.actions && result.actions.length > 0) {
    const gameLogs = db.collection('game_logs');
    await gameLogs.insertOne({
      gameId,
      localProfileId: result.localProfileId,
      mode: result.mode ?? 'solo',
      rngSeed: result.rngSeed,
      aiDifficulty: result.aiDifficulty,
      winner: result.winner,
      turnCount: result.turnCount,
      actions: result.actions,
      completedAt: new Date(result.completedAt),
      createdAt: now,
    });
  }
}

export async function recordAbandonedGame(game: AbandonedGameInput): Promise<void> {
  if (!isMongoEnabled()) {
    const existing = memoryAbandons().get(game.localProfileId) ?? [];
    if (existing.some((entry) => entry.abandonedAt === game.abandonedAt)) {
      return;
    }
    memoryAbandons().set(game.localProfileId, [...existing, game]);
    saveLocalMap(localDataPath('abandons.json'), memoryAbandons());
    return;
  }

  await ensureIndexes();
  const client = await getMongoClient();
  const collection = client.db(getMongoDbName()).collection<AbandonedGameDocument>('game_abandons');
  await collection.updateOne(
    { localProfileId: game.localProfileId, abandonedAt: new Date(game.abandonedAt) },
    { $setOnInsert: { ...game, abandonedAt: new Date(game.abandonedAt), createdAt: new Date() } },
    { upsert: true },
  );
}

async function countAbandonedGames(localProfileId: string): Promise<number> {
  if (!isMongoEnabled()) {
    return (memoryAbandons().get(localProfileId) ?? []).length;
  }
  await ensureIndexes();
  const client = await getMongoClient();
  return client.db(getMongoDbName()).collection<AbandonedGameDocument>('game_abandons').countDocuments({ localProfileId });
}

export interface DifficultyBreakdown {
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  gamesPlayed: number;
  aiWins: number;
  humanWins: number;
  aiWinRate: number;
  level: number;
}

export async function getDifficultyBreakdown(localProfileId: string): Promise<DifficultyBreakdown[]> {
  const difficulties: Array<'easy' | 'medium' | 'hard' | 'expert'> = ['easy', 'medium', 'hard', 'expert'];

  let results: GameResultInput[];
  if (!isMongoEnabled()) {
    results = (memoryResults().get(localProfileId) ?? []).filter((r) => !isOnline(r));
  } else {
    await ensureIndexes();
    const client = await getMongoClient();
    const db = client.db(getMongoDbName());
    const collection = db.collection<GameResultDocument>('game_results');
    const docs = await collection.find({ localProfileId, ...NOT_ONLINE }).toArray();
    results = docs.map((entry) => ({
      localProfileId: entry.localProfileId,
      aiDifficulty: entry.aiDifficulty,
      winner: entry.winner,
      playerGold: entry.playerGold,
      opponentGold: entry.opponentGold,
      turnCount: entry.turnCount,
      rngSeed: entry.rngSeed,
      completedAt: entry.completedAt.getTime(),
    }));
  }

  return difficulties.map((difficulty) => {
    const games = results.filter((r) => r.aiDifficulty === difficulty);
    const gamesPlayed = games.length;
    const aiWins = games.filter((r) => r.winner === 1).length;
    const humanWins = gamesPlayed - aiWins;
    const aiWinRate = gamesPlayed > 0 ? aiWins / gamesPlayed : 0;
    return {
      difficulty,
      gamesPlayed,
      aiWins,
      humanWins,
      aiWinRate,
      level: Math.round(aiWinRate * 100),
    };
  });
}

export async function getStatsSummary(localProfileId: string): Promise<UserStatsSummary> {
  if (!isMongoEnabled()) {
    const results = (memoryResults().get(localProfileId) ?? []).filter((r) => !isOnline(r));
    return sanitizeSummary(localProfileId, results, await countAbandonedGames(localProfileId));
  }

  await ensureIndexes();
  const client = await getMongoClient();
  const db = client.db(getMongoDbName());
  const collection = db.collection<GameResultDocument>('game_results');

  const results = await collection.find({ localProfileId, ...NOT_ONLINE }).toArray();
  const normalized: GameResultInput[] = results.map((entry) => ({
    localProfileId: entry.localProfileId,
    aiDifficulty: entry.aiDifficulty,
    winner: entry.winner,
    playerGold: entry.playerGold,
    opponentGold: entry.opponentGold,
    turnCount: entry.turnCount,
    rngSeed: entry.rngSeed,
    completedAt: entry.completedAt.getTime(),
  }));

  return sanitizeSummary(localProfileId, normalized, await countAbandonedGames(localProfileId));
}
