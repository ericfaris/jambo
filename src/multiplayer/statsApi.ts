import type { IncomingMessage, ServerResponse } from 'node:http';
import { getStatsSummary, getDifficultyBreakdown, recordCompletedGame, recordAbandonedGame } from './statsStore.ts';
import { getSession } from './authStore.ts';

interface RecordGameRequest {
  localProfileId: string;
  aiDifficulty: 'easy' | 'medium' | 'hard' | 'expert';
  winner: 0 | 1;
  playerGold: number;
  opponentGold: number;
  turnCount: number;
  rngSeed: number;
  completedAt?: number;
  actions?: unknown[];
}

interface RecordAbandonRequest {
  localProfileId: string;
  mode: 'solo' | 'multiplayer';
  aiDifficulty: 'easy' | 'medium' | 'hard' | 'expert';
  playerGold: number;
  opponentGold: number;
  turnCount: number;
  rngSeed: number;
  abandonedAt?: number;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

export function isValidProfileId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(value);
}

function isDifficulty(value: unknown): value is 'easy' | 'medium' | 'hard' | 'expert' {
  return value === 'easy' || value === 'medium' || value === 'hard' || value === 'expert';
}

function isWinner(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw.length === 0) {
    return {};
  }
  return JSON.parse(raw) as unknown;
}

export function validateRecordRequest(payload: unknown): payload is RecordGameRequest {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  if (!isValidProfileId(candidate.localProfileId)) return false;
  if (!isDifficulty(candidate.aiDifficulty)) return false;
  if (!isWinner(candidate.winner)) return false;
  if (!isNonNegativeInteger(candidate.playerGold)) return false;
  if (!isNonNegativeInteger(candidate.opponentGold)) return false;
  if (!isNonNegativeInteger(candidate.turnCount)) return false;
  if (!isInteger(candidate.rngSeed)) return false;
  if (candidate.completedAt !== undefined && !isNonNegativeInteger(candidate.completedAt)) return false;

  return true;
}

export function validateAbandonRequest(payload: unknown): payload is RecordAbandonRequest {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  if (!isValidProfileId(candidate.localProfileId)) return false;
  if (candidate.mode !== 'solo' && candidate.mode !== 'multiplayer') return false;
  if (!isDifficulty(candidate.aiDifficulty)) return false;
  if (!isNonNegativeInteger(candidate.playerGold)) return false;
  if (!isNonNegativeInteger(candidate.opponentGold)) return false;
  if (!isNonNegativeInteger(candidate.turnCount)) return false;
  if (!isInteger(candidate.rngSeed)) return false;
  if (candidate.abandonedAt !== undefined && !isNonNegativeInteger(candidate.abandonedAt)) return false;

  return true;
}

const COOKIE_NAME = 'jambo_session';

function parseCookies(req: IncomingMessage): Record<string, string> {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return {};
  const parsed: Record<string, string> = {};
  for (const part of rawCookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    parsed[key] = decodeURIComponent(rest.join('='));
  }
  return parsed;
}

/**
 * If the user is authenticated and has a linked profile, use that as the
 * canonical profile ID so stats are consistent across devices.
 */
async function resolveProfileId(req: IncomingMessage, clientProfileId: string): Promise<string> {
  const cookies = parseCookies(req);
  const sessionId = cookies[COOKIE_NAME];
  if (!sessionId) return clientProfileId;

  const session = await getSession(sessionId);
  if (!session) return clientProfileId;

  return session.user.localProfileId ?? clientProfileId;
}

export async function handleStatsApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const method = req.method ?? 'GET';
  const host = req.headers.host ?? 'localhost:3001';
  const requestUrl = new URL(req.url ?? '/', `http://${host}`);

  if (method === 'GET' && requestUrl.pathname === '/api/stats/summary') {
    const clientProfileId = requestUrl.searchParams.get('localProfileId');
    if (!isValidProfileId(clientProfileId)) {
      sendJson(res, 400, { error: 'localProfileId is required and must be alphanumeric with ._- only' });
      return true;
    }

    const profileId = await resolveProfileId(req, clientProfileId);
    const summary = await getStatsSummary(profileId);
    sendJson(res, 200, { summary });
    return true;
  }

  if (method === 'GET' && requestUrl.pathname === '/api/stats/difficulty') {
    const clientProfileId = requestUrl.searchParams.get('localProfileId');
    if (!isValidProfileId(clientProfileId)) {
      sendJson(res, 400, { error: 'localProfileId is required and must be alphanumeric with ._- only' });
      return true;
    }

    const profileId = await resolveProfileId(req, clientProfileId);
    const breakdown = await getDifficultyBreakdown(profileId);
    sendJson(res, 200, { breakdown });
    return true;
  }

  if (method === 'POST' && requestUrl.pathname === '/api/stats/game') {
    const body = await readJsonBody(req);
    if (!validateRecordRequest(body)) {
      sendJson(res, 400, { error: 'Invalid game payload' });
      return true;
    }

    const profileId = await resolveProfileId(req, body.localProfileId);

    await recordCompletedGame({
      localProfileId: profileId,
      aiDifficulty: body.aiDifficulty,
      winner: body.winner,
      playerGold: body.playerGold,
      opponentGold: body.opponentGold,
      turnCount: body.turnCount,
      rngSeed: body.rngSeed,
      completedAt: body.completedAt ?? Date.now(),
      actions: Array.isArray(body.actions) ? body.actions : undefined,
    });

    const summary = await getStatsSummary(profileId);
    sendJson(res, 200, { ok: true, summary });
    return true;
  }

  if (method === 'POST' && requestUrl.pathname === '/api/stats/abandon') {
    const body = await readJsonBody(req);
    if (!validateAbandonRequest(body)) {
      sendJson(res, 400, { error: 'Invalid abandon payload' });
      return true;
    }

    const profileId = await resolveProfileId(req, body.localProfileId);

    await recordAbandonedGame({
      localProfileId: profileId,
      mode: body.mode,
      aiDifficulty: body.aiDifficulty,
      playerGold: body.playerGold,
      opponentGold: body.opponentGold,
      turnCount: body.turnCount,
      rngSeed: body.rngSeed,
      abandonedAt: body.abandonedAt ?? Date.now(),
    });

    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}
