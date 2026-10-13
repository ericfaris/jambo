// ============================================================================
// Password hashing (Argon2id via Node's built-in crypto.argon2) and the
// breached-password check (Have I Been Pwned range API, k-anonymity).
//
// Hashes are stored as PHC strings — $argon2id$v=19$m=…,t=…,p=…$salt$hash —
// so parameters can be raised later: verifyPassword() reads them from the
// stored string and needsRehash() flags old ones for an upgrade at next login.
// ============================================================================

import { argon2, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { normalizePassword } from './accountRules.ts';

/** OWASP Password Storage Cheat Sheet's Argon2id baseline (19 MiB, 2 passes, 1 lane). */
export const ARGON2_PARAMS = { memory: 19456, passes: 2, parallelism: 1 } as const;
const SALT_BYTES = 16;
const TAG_BYTES = 32;
const ARGON2_VERSION = 19;

interface ParsedHash {
  memory: number;
  passes: number;
  parallelism: number;
  salt: Buffer;
  hash: Buffer;
}

function deriveKey(password: string, salt: Buffer, params: { memory: number; passes: number; parallelism: number }, tagLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', {
      message: Buffer.from(normalizePassword(password), 'utf8'),
      nonce: salt,
      parallelism: params.parallelism,
      tagLength,
      memory: params.memory,
      passes: params.passes,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function b64(buffer: Buffer): string {
  return buffer.toString('base64').replace(/=+$/, '');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, ARGON2_PARAMS, TAG_BYTES);
  const { memory, passes, parallelism } = ARGON2_PARAMS;
  return `$argon2id$v=${ARGON2_VERSION}$m=${memory},t=${passes},p=${parallelism}$${b64(salt)}$${b64(key)}`;
}

export function parsePasswordHash(stored: string): ParsedHash | null {
  const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(stored);
  if (!match) return null;
  const [, m, t, p, salt, hash] = match;
  const parsed: ParsedHash = {
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
    salt: Buffer.from(salt!, 'base64'),
    hash: Buffer.from(hash!, 'base64'),
  };
  // Refuse absurd parameters from a corrupted row rather than burning the CPU on them.
  if (parsed.memory < 1024 || parsed.memory > 1 << 20 || parsed.passes < 1 || parsed.passes > 10
    || parsed.parallelism < 1 || parsed.parallelism > 16 || parsed.salt.length < 8 || parsed.hash.length < 16) {
    return null;
  }
  return parsed;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (!parsed) return false;
  const key = await deriveKey(password, parsed.salt, parsed, parsed.hash.length);
  return timingSafeEqual(key, parsed.hash);
}

export function needsRehash(stored: string): boolean {
  const parsed = parsePasswordHash(stored);
  if (!parsed) return true;
  return parsed.memory < ARGON2_PARAMS.memory
    || parsed.passes < ARGON2_PARAMS.passes
    || parsed.hash.length < TAG_BYTES;
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Burns the same hashing time as a real check, for a login against an account
 * that doesn't exist (or has no password), so response time doesn't reveal it.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHashPromise ??= hashPassword(randomBytes(24).toString('hex'));
  await verifyPassword(password, await dummyHashPromise);
  return false;
}

export type FetchLike = (input: string, init?: { headers?: Record<string, string>; method?: string; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

/**
 * True when the password appears in Have I Been Pwned's breach corpus. Only the
 * first 5 hex chars of its SHA-1 leave the server (k-anonymity), and the
 * Add-Padding header hides the response size. Fails open (returns false) when
 * the API can't be reached — a breach-list outage shouldn't block sign-ups.
 */
export async function isPasswordBreached(password: string, fetchImpl: FetchLike): Promise<boolean> {
  const sha1 = createHash('sha1').update(normalizePassword(password), 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'jambo-auth' },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      console.warn(`[auth] breached-password check unavailable (HTTP ${response.status}); allowing`);
      return false;
    }
    const body = await response.text();
    for (const line of body.split('\n')) {
      const [candidate, count] = line.trim().split(':');
      // Padding rows carry a count of 0.
      if (candidate === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch (error) {
    console.warn('[auth] breached-password check failed; allowing:', (error as Error).message);
    return false;
  }
}
