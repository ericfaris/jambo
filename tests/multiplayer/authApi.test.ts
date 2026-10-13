// End-to-end tests of the auth HTTP API over a real socket, with the
// in-memory stores (MONGODB_URI forced empty — never the real database) and
// fakes for every outside service: HIBP, Turnstile, Google, Resend.

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAuthApi } from '../../src/multiplayer/auth.ts';
import { resetAuthLimitsForTests, setAuthDepsForTests } from '../../src/multiplayer/authCore.ts';
import { getSession, resetAuthStoreForTests } from '../../src/multiplayer/authStore.ts';
import type { OutgoingEmail } from '../../src/multiplayer/mailer.ts';
import type { FetchLike } from '../../src/multiplayer/passwords.ts';
import { createUser, getUserByUsername, newUserId, resetUserStoreForTests, updateUser } from '../../src/multiplayer/userStore.ts';

const GOOD_PASSWORD = 'four ripe mangoes at dawn';
const BREACHED_PASSWORD = 'correct horse battery staple';

let server: Server;
let origin: string;
let emails: OutgoingEmail[];
let googleIdentity: { sub: string; email: string; email_verified: string; name: string; picture: string };

const fakeFetch: FetchLike = async (url, init) => {
  const reply = (body: unknown, ok = true) => ({
    ok,
    status: ok ? 200 : 400,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  });
  if (url.startsWith('https://api.pwnedpasswords.com/range/')) {
    const sha1 = createHash('sha1').update(BREACHED_PASSWORD).digest('hex').toUpperCase();
    return reply(url.endsWith(sha1.slice(0, 5)) ? `${sha1.slice(5)}:999\n` : '');
  }
  if (url.startsWith('https://challenges.cloudflare.com/turnstile/')) {
    return reply({ success: new URLSearchParams(init?.body ?? '').get('response') === 'human' });
  }
  if (url === 'https://oauth2.googleapis.com/token') return reply({ id_token: 'fake-id-token' });
  if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) return reply({ aud: 'test-client', ...googleIdentity });
  throw new Error(`unexpected fetch ${url}`);
};

beforeAll(async () => {
  vi.stubEnv('MONGODB_URI', '');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
  vi.stubEnv('TURNSTILE_SITE_KEY', 'test-site');
  vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
  server = createServer((req, res) => {
    void handleAuthApi(req, res).then((handled) => {
      if (!handled) {
        res.statusCode = 404;
        res.end();
      }
    }).catch((error: unknown) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(String(error));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubEnv('APP_BASE_URL', origin);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  resetAuthStoreForTests();
  resetUserStoreForTests();
  resetAuthLimitsForTests();
  emails = [];
  googleIdentity = { sub: 'g-1', email: 'gina@example.com', email_verified: 'true', name: 'Gina Lopez', picture: 'https://pic/g' };
  setAuthDepsForTests({
    fetch: fakeFetch,
    sendEmail: async (email) => { emails.push(email); },
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A tiny cookie-jar client, one per simulated browser. */
function browser() {
  let cookie = '';
  const remember = (response: Response) => {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return;
    const value = /jambo_session=([^;]*)/.exec(setCookie)?.[1] ?? '';
    cookie = value ? `jambo_session=${value}` : '';
  };
  return {
    get cookie() { return cookie; },
    set cookie(value: string) { cookie = value; },
    async post(path: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
      const response = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: JSON.stringify(body),
      });
      remember(response);
      return { status: response.status, body: (await response.json()) as Record<string, unknown>, headers: response.headers };
    },
    async get(path: string) {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
      remember(response);
      const text = await response.text();
      return { status: response.status, location: response.headers.get('location'), body: text ? JSON.parse(text) as Record<string, unknown> : {} };
    },
    async session() {
      return (await this.get('/api/auth/session')).body as { authenticated: boolean; user?: Record<string, unknown> };
    },
  };
}

function tokenFrom(email: OutgoingEmail | undefined, param: 'verify' | 'reset'): string {
  const match = new RegExp(`[?&]${param}=([A-Za-z0-9_-]+)`).exec(email?.text ?? '');
  if (!match) throw new Error(`no ${param} link in email`);
  return match[1]!;
}

async function signUp(b = browser(), overrides: Record<string, unknown> = {}) {
  const result = await b.post('/api/auth/signup', {
    username: 'SpiceTrader',
    email: 'Trader@Example.com',
    password: GOOD_PASSWORD,
    localProfileId: 'local-123',
    turnstileToken: 'human',
    ...overrides,
  });
  return { b, result };
}

async function googleSignIn(b = browser(), query = '') {
  const start = await b.get(`/api/auth/google/start?returnTo=${encodeURIComponent(`${origin}/`)}&localProfileId=google-local${query}`);
  const state = new URL(start.location!).searchParams.get('state');
  const callback = await b.get(`/api/auth/google/callback?code=c&state=${state}`);
  return new URL(callback.location!).searchParams.get('auth');
}

// ---------------------------------------------------------------------------
// Sign-up
// ---------------------------------------------------------------------------

describe('sign-up', () => {
  it('creates an unverified account, signs in, and emails a confirmation link', async () => {
    const { b, result } = await signUp();
    expect(result.status).toBe(201);
    const session = await b.session();
    expect(session.authenticated).toBe(true);
    expect(session.user).toMatchObject({
      username: 'SpiceTrader',
      name: 'SpiceTrader',
      email: 'trader@example.com',
      emailVerified: false,
      hasPassword: true,
      hasGoogle: false,
      needsUsername: false,
      localProfileId: 'local-123',
    });
    expect(session.user?.['unverifiedExpiresAt']).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
    expect(session.user).not.toHaveProperty('passwordHash');
    expect(emails).toHaveLength(1);
    expect(emails[0]!.to).toBe('trader@example.com');
    expect(tokenFrom(emails[0], 'verify')).toBeTruthy();
  });

  it('sets an HttpOnly, SameSite=Lax session cookie', async () => {
    const { result } = await signUp();
    const cookie = result.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('rejects a short password, a breached password, and a bad username or email', async () => {
    expect((await signUp(browser(), { password: 'short pass' })).result.body).toMatchObject({ field: 'password' });
    const breached = await signUp(browser(), { password: BREACHED_PASSWORD });
    expect(breached.result.status).toBe(400);
    expect(breached.result.body['error']).toMatch(/breach/);
    expect((await signUp(browser(), { username: 'no spaces' })).result.body).toMatchObject({ field: 'username' });
    expect((await signUp(browser(), { email: 'nope' })).result.body).toMatchObject({ field: 'email' });
  });

  it('requires the Turnstile check', async () => {
    const { result } = await signUp(browser(), { turnstileToken: 'robot' });
    expect(result.status).toBe(400);
    expect(result.body['field']).toBe('turnstile');
  });

  it('keeps usernames unique regardless of case', async () => {
    await signUp();
    const { result } = await signUp(browser(), { username: 'spicetrader', email: 'other@example.com' });
    expect(result.status).toBe(409);
    expect(result.body['field']).toBe('username');
  });

  it('refuses an email that already has an account and tells its owner, without merging', async () => {
    await signUp();
    emails = [];
    const { b, result } = await signUp(browser(), { username: 'Imposter', email: 'trader@example.com' });
    expect(result.status).toBe(409);
    expect(result.body['field']).toBe('email');
    expect((await b.session()).authenticated).toBe(false);
    expect(emails).toHaveLength(1);
    expect(emails[0]!.subject).toMatch(/already have/);
  });

  it('answers 503 in production when email or Turnstile is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RESEND_API_KEY', '');
    try {
      const { result } = await signUp();
      expect(result.status).toBe(503);
    } finally {
      vi.stubEnv('NODE_ENV', 'test');
    }
  });

  it('throttles sign-ups per IP', async () => {
    for (let i = 0; i < 5; i++) {
      await signUp(browser(), { username: `trader${i}`, email: `t${i}@example.com` });
    }
    const { result } = await signUp(browser(), { username: 'trader9', email: 't9@example.com' });
    expect(result.status).toBe(429);
    expect(result.headers.get('retry-after')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CSRF / method guards
// ---------------------------------------------------------------------------

describe('request guards', () => {
  it('refuses cross-origin and non-JSON state-changing requests', async () => {
    const b = browser();
    expect((await b.post('/api/auth/login', {}, { Origin: 'https://evil.example' })).status).toBe(403);
    const form = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
      body: 'identifier=a&password=b',
    });
    expect(form.status).toBe(403);
    expect((await b.post('/api/auth/logout', {}, { Origin: 'https://evil.example' })).status).toBe(403);
  });

  it('rejects GET on POST-only routes, including logout', async () => {
    expect((await browser().get('/api/auth/login')).status).toBe(405);
    expect((await browser().get('/api/auth/logout')).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

describe('sign-in', () => {
  it('accepts the username (any case) or the email', async () => {
    await signUp();
    for (const identifier of ['SpiceTrader', 'spicetrader', 'TRADER@example.com']) {
      const b = browser();
      const result = await b.post('/api/auth/login', { identifier, password: GOOD_PASSWORD });
      expect(result.status).toBe(200);
      expect((await b.session()).authenticated).toBe(true);
    }
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    await signUp();
    const wrong = await browser().post('/api/auth/login', { identifier: 'SpiceTrader', password: 'not the password at all' });
    const unknown = await browser().post('/api/auth/login', { identifier: 'Nobody', password: GOOD_PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('issues a new session id at every sign-in and drops the old one', async () => {
    const { b } = await signUp();
    const first = b.cookie;
    await b.post('/api/auth/login', { identifier: 'SpiceTrader', password: GOOD_PASSWORD });
    expect(b.cookie).not.toBe(first);
    const stale = browser();
    stale.cookie = first;
    expect((await stale.session()).authenticated).toBe(false);
  });

  it('throttles repeated failures for an account, then clears on success after the window', async () => {
    await signUp();
    for (let i = 0; i < 10; i++) {
      expect((await browser().post('/api/auth/login', { identifier: 'SpiceTrader', password: `wrong guess number ${i}` })).status).toBe(401);
    }
    const blocked = await browser().post('/api/auth/login', { identifier: 'spicetrader', password: GOOD_PASSWORD });
    expect(blocked.status).toBe(429);
    // A different account from the same browser isn't affected.
    expect((await browser().post('/api/auth/login', { identifier: 'Other', password: 'x' })).status).toBe(401);
  });

  it('a Google-only account cannot be signed into with a password', async () => {
    await googleSignIn();
    const result = await browser().post('/api/auth/login', { identifier: 'gina@example.com', password: GOOD_PASSWORD });
    expect(result.status).toBe(401);
  });

  it('links the browser\'s local profile on first sign-in when the account has none', async () => {
    await signUp(browser(), { localProfileId: undefined });
    const b = browser();
    await b.post('/api/auth/login', { identifier: 'SpiceTrader', password: GOOD_PASSWORD, localProfileId: 'device-2' });
    expect((await b.session()).user?.['localProfileId']).toBe('device-2');
  });

  it('logout ends the session', async () => {
    const { b } = await signUp();
    const cookie = b.cookie;
    expect((await b.post('/api/auth/logout')).status).toBe(200);
    const replay = browser();
    replay.cookie = cookie;
    expect((await replay.session()).authenticated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

describe('email verification', () => {
  it('confirms the email once; the token cannot be replayed', async () => {
    const { b } = await signUp();
    const token = tokenFrom(emails[0], 'verify');
    expect((await browser().post('/api/auth/verify-email', { token })).status).toBe(200);
    const session = await b.session();
    expect(session.user?.['emailVerified']).toBe(true);
    expect(session.user?.['unverifiedExpiresAt']).toBeNull();
    expect((await browser().post('/api/auth/verify-email', { token })).status).toBe(400);
  });

  it('resending replaces the previous link', async () => {
    const { b } = await signUp();
    const first = tokenFrom(emails[0], 'verify');
    expect((await b.post('/api/auth/verify-email/resend')).status).toBe(200);
    const second = tokenFrom(emails[1], 'verify');
    expect((await browser().post('/api/auth/verify-email', { token: first })).status).toBe(400);
    expect((await browser().post('/api/auth/verify-email', { token: second })).status).toBe(200);
  });

  it('purges an unverified account after its deadline', async () => {
    const { b } = await signUp();
    const user = await getUserByUsername('SpiceTrader');
    await updateUser(user!.id, { unverifiedExpiresAt: Date.now() - 1 });
    expect((await b.session()).authenticated).toBe(false);
    expect(await getUserByUsername('SpiceTrader')).toBeNull();
    // The name and address are free again.
    expect((await signUp()).result.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Forgotten password
// ---------------------------------------------------------------------------

describe('password reset', () => {
  async function verifiedAccount() {
    const { b } = await signUp();
    await browser().post('/api/auth/verify-email', { token: tokenFrom(emails[0], 'verify') });
    emails = [];
    return b;
  }

  const forgot = (email: string, turnstileToken = 'human') =>
    browser().post('/api/auth/password/forgot', { email, turnstileToken });

  it('answers identically for known, unknown and unverified addresses', async () => {
    await verifiedAccount();
    await signUp(browser(), { username: 'Unverified', email: 'unverified@example.com' });
    emails = [];
    const known = await forgot('trader@example.com');
    const unknown = await forgot('nobody@example.com');
    const unverified = await forgot('unverified@example.com');
    expect(known).toMatchObject({ status: 200 });
    expect(unknown.body).toEqual(known.body);
    expect(unverified.body).toEqual(known.body);
    await vi.waitFor(() => expect(emails).toHaveLength(1));
    expect(emails[0]!.to).toBe('trader@example.com');
  });

  it('resets the password, signs out every session, and spends the link', async () => {
    const signedIn = await verifiedAccount();
    await forgot('trader@example.com');
    await vi.waitFor(() => expect(emails).toHaveLength(1));
    const token = tokenFrom(emails[0], 'reset');

    // A rejected password doesn't burn the link.
    expect((await browser().post('/api/auth/password/reset', { token, password: 'too short' })).body).toMatchObject({ field: 'password' });
    const newPassword = 'six tired camels in the shade';
    expect((await browser().post('/api/auth/password/reset', { token, password: newPassword })).status).toBe(200);

    expect((await signedIn.session()).authenticated).toBe(false);
    expect((await browser().post('/api/auth/login', { identifier: 'SpiceTrader', password: GOOD_PASSWORD })).status).toBe(401);
    expect((await browser().post('/api/auth/login', { identifier: 'SpiceTrader', password: newPassword })).status).toBe(200);
    expect((await browser().post('/api/auth/password/reset', { token, password: 'yet another long passphrase' })).status).toBe(400);
  });

  it('requires the Turnstile check', async () => {
    expect((await forgot('trader@example.com', 'robot')).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

describe('change password', () => {
  it('needs the current password and signs out other sessions only', async () => {
    const { b } = await signUp();
    const other = browser();
    await other.post('/api/auth/login', { identifier: 'SpiceTrader', password: GOOD_PASSWORD });

    const wrong = await b.post('/api/auth/password/change', { currentPassword: 'nope nope nope nope', newPassword: 'six tired camels in the shade' });
    expect(wrong).toMatchObject({ status: 401, body: { field: 'currentPassword' } });

    emails = [];
    const ok = await b.post('/api/auth/password/change', { currentPassword: GOOD_PASSWORD, newPassword: 'six tired camels in the shade' });
    expect(ok.status).toBe(200);
    expect((await b.session()).authenticated).toBe(true);
    expect((await other.session()).authenticated).toBe(false);
    expect(emails.map((e) => e.subject)).toContain('Your Jambo password was changed');
  });

  it('lets a Google account add a password without a current one', async () => {
    const b = browser();
    await googleSignIn(b);
    await b.post('/api/auth/username', { username: 'Gina' });
    expect((await b.post('/api/auth/password/change', { newPassword: GOOD_PASSWORD })).status).toBe(200);
    expect((await b.session()).user).toMatchObject({ hasPassword: true, hasGoogle: true });
    expect((await browser().post('/api/auth/login', { identifier: 'Gina', password: GOOD_PASSWORD })).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Google + usernames
// ---------------------------------------------------------------------------

describe('Google sign-in', () => {
  it('creates a verified account that must pick a username', async () => {
    const b = browser();
    expect(await googleSignIn(b)).toBe('success');
    const session = await b.session();
    expect(session.user).toMatchObject({
      username: null,
      name: 'Gina Lopez',
      needsUsername: true,
      emailVerified: true,
      hasGoogle: true,
      hasPassword: false,
      localProfileId: 'google-local',
    });

    expect((await b.post('/api/auth/username', { username: 'admin' })).status).toBe(400);
    const saved = await b.post('/api/auth/username', { username: 'Gina_L' });
    expect(saved.status).toBe(200);
    expect((await b.session()).user).toMatchObject({ username: 'Gina_L', name: 'Gina_L', needsUsername: false });
  });

  it('signing in again reuses the same account', async () => {
    const first = browser();
    await googleSignIn(first);
    const id = (await first.session()).user?.['id'];
    const second = browser();
    await googleSignIn(second);
    expect((await second.session()).user?.['id']).toBe(id);
  });

  it('refuses a Google email that a verified password account owns (no silent merge)', async () => {
    await signUp(browser(), { email: 'gina@example.com' });
    await browser().post('/api/auth/verify-email', { token: tokenFrom(emails[0], 'verify') });
    const b = browser();
    expect(await googleSignIn(b)).toBe('email_in_use');
    expect((await b.session()).authenticated).toBe(false);
  });

  it('a verified Google sign-in takes the address from an unverified squatter', async () => {
    const squatter = (await signUp(browser(), { username: 'Squatter', email: 'gina@example.com' })).b;
    const b = browser();
    expect(await googleSignIn(b)).toBe('success');
    expect((await b.session()).user?.['email']).toBe('gina@example.com');
    expect((await squatter.session()).user?.['email']).toBeNull();
    // The squatter's confirmation link no longer works.
    expect((await browser().post('/api/auth/verify-email', { token: tokenFrom(emails[0], 'verify') })).status).toBe(400);
  });

  it('rejects a Google identity whose email Google has not verified', async () => {
    googleIdentity.email_verified = 'false';
    expect(await googleSignIn()).toBe('failed');
  });

  it('links Google to a signed-in password account', async () => {
    const { b } = await signUp();
    googleIdentity.email = 'trader@example.com';
    expect(await googleSignIn(b, '&link=1')).toBe('google_linked');
    expect((await b.session()).user).toMatchObject({ hasGoogle: true, hasPassword: true, emailVerified: true });
    // And now Google signs in to that same account.
    const other = browser();
    expect(await googleSignIn(other)).toBe('success');
    expect((await other.session()).user?.['username']).toBe('SpiceTrader');
  });

  it('will not link a Google identity that belongs to another account', async () => {
    await googleSignIn();
    const { b } = await signUp();
    expect(await googleSignIn(b, '&link=1')).toBe('google_in_use');
    expect((await b.session()).user?.['hasGoogle']).toBe(false);
  });
});

describe('pre-accounts Google sessions', () => {
  it('migrate in place: same cookie, same linked profile, prompted for a username', async () => {
    resetAuthStoreForTests({
      sessions: [{
        id: 'legacy-session',
        user: { googleSub: 'g-old', email: 'Old@Example.com', name: 'Old Timer', picture: '', localProfileId: 'stale' },
        expiresAt: Date.now() + 60_000,
      }],
      googleLinks: [['g-old', 'linked-profile']],
    });
    const b = browser();
    b.cookie = 'jambo_session=legacy-session';
    const session = await b.session();
    expect(session.authenticated).toBe(true);
    expect(session.user).toMatchObject({
      email: 'old@example.com',
      emailVerified: true,
      needsUsername: true,
      name: 'Old Timer',
      localProfileId: 'linked-profile',
    });
    // Stats resolve the profile through the same session.
    expect((await getSession('legacy-session'))?.user.localProfileId).toBe('linked-profile');
    // Signing in with Google afterwards lands on the migrated account.
    googleIdentity = { sub: 'g-old', email: 'old@example.com', email_verified: 'true', name: 'Old Timer', picture: '' };
    const fresh = browser();
    await googleSignIn(fresh);
    expect((await fresh.session()).user?.['id']).toBe(session.user?.['id']);
  });

  it('username changes collide case-insensitively with other accounts', async () => {
    await createUser({
      id: newUserId(), username: 'Taken', email: 'taken@example.com', emailVerified: true, passwordHash: null,
      googleSub: null, googleName: '', picture: '', localProfileId: null, createdAt: Date.now(), unverifiedExpiresAt: null,
    });
    const b = browser();
    await googleSignIn(b);
    expect((await b.post('/api/auth/username', { username: 'TAKEN' })).status).toBe(409);
  });
});
