import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import {
  ARGON2_PARAMS,
  hashPassword,
  isPasswordBreached,
  needsRehash,
  parsePasswordHash,
  verifyAgainstDummy,
  verifyPassword,
} from '../../src/multiplayer/passwords.ts';
import type { FetchLike } from '../../src/multiplayer/passwords.ts';
import { RateLimiter } from '../../src/multiplayer/rateLimit.ts';

describe('Argon2id password hashing', () => {
  it('stores a PHC string with at least the OWASP baseline parameters', async () => {
    const stored = await hashPassword('four ripe mangoes at dawn');
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/);
    expect(ARGON2_PARAMS.memory).toBeGreaterThanOrEqual(19456);
    expect(parsePasswordHash(stored)?.hash.length).toBe(32);
  });

  it('verifies the right password and rejects others', async () => {
    const stored = await hashPassword('four ripe mangoes at dawn');
    expect(await verifyPassword('four ripe mangoes at dawn', stored)).toBe(true);
    expect(await verifyPassword('four ripe mangoes at dusk', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same passphrase here')).not.toBe(await hashPassword('same passphrase here'));
  });

  it('matches Unicode-equivalent spellings (NFKC)', async () => {
    const stored = await hashPassword('café au lait on the river');
    expect(await verifyPassword('café au lait on the river', stored)).toBe(true);
  });

  it('rejects malformed or hostile stored hashes without throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', '$argon2id$v=19$m=99999999,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA')).toBe(false);
    expect(parsePasswordHash('$argon2i$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA')).toBeNull();
  });

  it('flags weaker parameters for a rehash at next sign-in', async () => {
    expect(needsRehash(await hashPassword('a perfectly good passphrase'))).toBe(false);
    expect(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaGhhc2hoYXNoaGFzaGhhc2g')).toBe(true);
    expect(needsRehash('garbage')).toBe(true);
  });

  it('dummy verification always fails', async () => {
    expect(await verifyAgainstDummy('whatever')).toBe(false);
  });
});

describe('isPasswordBreached (HIBP k-anonymity)', () => {
  const password = 'correct horse battery staple';
  const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();

  function fakeRange(body: string, ok = true): { fetch: FetchLike; calls: string[] } {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      return { ok, status: ok ? 200 : 503, text: async () => body, json: async () => ({}) };
    };
    return { fetch, calls };
  }

  it('sends only the 5-char hash prefix, with padding requested', async () => {
    const seen: Array<Record<string, string> | undefined> = [];
    const fetch: FetchLike = async (url, init) => {
      seen.push(init?.headers);
      expect(url).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
      return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
    };
    await isPasswordBreached(password, fetch);
    expect(seen[0]?.['Add-Padding']).toBe('true');
  });

  it('detects a listed suffix', async () => {
    const { fetch } = fakeRange(`0000000000000000000000000000000000A:3\r\n${sha1.slice(5)}:12345\r\n`);
    expect(await isPasswordBreached(password, fetch)).toBe(true);
  });

  it('ignores padding rows (count 0) and other suffixes', async () => {
    const { fetch } = fakeRange(`${sha1.slice(5)}:0\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:9`);
    expect(await isPasswordBreached(password, fetch)).toBe(false);
  });

  it('fails open when the API is down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await isPasswordBreached(password, fakeRange('', false).fetch)).toBe(false);
    expect(await isPasswordBreached(password, async () => { throw new Error('offline'); })).toBe(false);
    warn.mockRestore();
  });
});

describe('RateLimiter', () => {
  it('allows up to the limit per window, then reports the wait', () => {
    let now = 0;
    const limiter = new RateLimiter(3, 1000, () => now);
    expect(limiter.hit('ip').allowed).toBe(true);
    expect(limiter.hit('ip').allowed).toBe(true);
    expect(limiter.hit('ip').allowed).toBe(true);
    const blocked = limiter.hit('ip');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(1000);
    expect(limiter.check('ip').allowed).toBe(false);
    expect(limiter.hit('other').allowed).toBe(true);
    now = 1000;
    expect(limiter.hit('ip').allowed).toBe(true);
  });

  it('check() does not count, reset() clears', () => {
    const limiter = new RateLimiter(1, 1000, () => 0);
    expect(limiter.check('k').allowed).toBe(true);
    expect(limiter.check('k').allowed).toBe(true);
    limiter.hit('k');
    expect(limiter.check('k').allowed).toBe(false);
    limiter.reset('k');
    expect(limiter.check('k').allowed).toBe(true);
  });
});
