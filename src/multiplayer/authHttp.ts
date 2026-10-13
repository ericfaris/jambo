// HTTP plumbing for the auth API: cookies, JSON bodies, client IP and the
// same-origin check that stands in for CSRF tokens on state-changing calls.

import type { IncomingMessage, ServerResponse } from 'node:http';

export const SESSION_COOKIE_NAME = 'jambo_session';
const MAX_JSON_BODY_BYTES = 16 * 1024;

export function getAppBaseUrl(): string {
  return process.env['APP_BASE_URL'] || 'http://localhost:5173';
}

export function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

export function sendError(res: ServerResponse, statusCode: number, error: string, field?: string): void {
  sendJson(res, statusCode, field ? { error, field } : { error });
}

export function sendTooMany(res: ServerResponse, retryAfterMs: number): void {
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  sendError(res, 429, 'Too many attempts. Please wait a few minutes and try again.');
}

export function redirect(res: ServerResponse, location: string): void {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const rawCookie = req.headers.cookie;
  if (!rawCookie) return {};
  const parsed: Record<string, string> = {};
  for (const part of rawCookie.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    try {
      parsed[key] = decodeURIComponent(rest.join('='));
    } catch {
      // Ignore a malformed cookie rather than failing the request.
    }
  }
  return parsed;
}

export function getSessionCookie(req: IncomingMessage): string | null {
  return parseCookies(req)[SESSION_COOKIE_NAME] || null;
}

function isSecureRequest(req: IncomingMessage): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string' && forwardedProto.toLowerCase() === 'https') {
    return true;
  }
  const socket = req.socket as { encrypted?: boolean };
  return Boolean(socket.encrypted);
}

function writeSessionCookie(req: IncomingMessage, res: ServerResponse, value: string, maxAgeSeconds: number): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function setSessionCookie(req: IncomingMessage, res: ServerResponse, sessionId: string, ttlMs: number): void {
  writeSessionCookie(req, res, sessionId, Math.floor(ttlMs / 1000));
}

export function clearSessionCookie(req: IncomingMessage, res: ServerResponse): void {
  writeSessionCookie(req, res, '', 0);
}

/**
 * The visitor's IP. The container is reachable only through the Cloudflare
 * Tunnel (bound to 127.0.0.1), so Cloudflare's header is trustworthy here.
 */
export function getClientIp(req: IncomingMessage): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp) return cfIp.trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * State-changing auth calls must come from our own pages: a JSON body (which
 * a cross-site form can't send without a CORS preflight) from an allowed
 * Origin. Together with SameSite=Lax cookies this closes CSRF.
 */
export function isSameOriginJsonRequest(req: IncomingMessage): boolean {
  const contentType = (req.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) return false;

  const origin = req.headers.origin;
  if (!origin) {
    return req.headers['sec-fetch-site'] === 'same-origin';
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(getAppBaseUrl()).origin);
  } catch {
    // Misconfigured APP_BASE_URL — fall through to the Host-based origin.
  }
  const host = req.headers.host;
  if (host) {
    allowed.add(`${isSecureRequest(req) ? 'https' : 'http'}://${host}`);
  }
  return allowed.has(origin);
}

/** Reads a small JSON object body; null when it's missing, oversized or not an object. */
export async function readJsonObject(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : '';
}
