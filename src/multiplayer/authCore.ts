// Shared pieces of the auth API: injectable dependencies, session start/lookup,
// the public user shape, and the rate limiters.

import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createSession, deleteSession, getSession } from './authStore.ts';
import type { StoredAuthSession } from './authStore.ts';
import { getSessionCookie, setSessionCookie } from './authHttp.ts';
import { createResendMailer, isEmailConfigured, isProduction } from './mailer.ts';
import type { SendEmail } from './mailer.ts';
import type { FetchLike } from './passwords.ts';
import { RateLimiter } from './rateLimit.ts';
import { isTurnstileConfigured } from './turnstile.ts';
import type { AccountUser } from './userStore.ts';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const VERIFY_EMAIL_TTL_MS = 48 * 60 * 60 * 1000;
export const RESET_PASSWORD_TTL_MS = 30 * 60 * 1000;

const MINUTE = 60 * 1000;

export interface AuthDeps {
  fetch: FetchLike;
  sendEmail: SendEmail;
}

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

export const authDeps: AuthDeps = {
  fetch: defaultFetch,
  sendEmail: createResendMailer(defaultFetch),
};

export const limiters = {
  loginIp: new RateLimiter(30, 15 * MINUTE),
  /** Failed logins per username/email — counted on failure only, cleared on success. */
  loginAccount: new RateLimiter(10, 15 * MINUTE),
  signupIp: new RateLimiter(5, 60 * MINUTE),
  forgotIp: new RateLimiter(5, 60 * MINUTE),
  forgotEmail: new RateLimiter(3, 60 * MINUTE),
  resetIp: new RateLimiter(10, 15 * MINUTE),
  resendVerification: new RateLimiter(3, 60 * MINUTE),
  verifyIp: new RateLimiter(20, 15 * MINUTE),
  passwordChange: new RateLimiter(10, 15 * MINUTE),
  usernameChange: new RateLimiter(20, 60 * MINUTE),
};

export function setAuthDepsForTests(overrides: Partial<AuthDeps>): void {
  Object.assign(authDeps, overrides);
}

export function resetAuthLimitsForTests(): void {
  for (const limiter of Object.values(limiters)) limiter.clear();
}

/**
 * Password sign-up and reset depend on email delivery and the bot check; in
 * production both must be configured or those endpoints answer 503.
 */
export function isPasswordAuthReady(): boolean {
  return !isProduction() || (isEmailConfigured() && isTurnstileConfigured());
}

export function logMissingAuthConfig(): void {
  if (!isProduction()) return;
  const missing = ['RESEND_API_KEY', 'EMAIL_FROM', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']
    .filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.warn(`[auth] Password sign-up is disabled until these are set: ${missing.join(', ')}`);
  }
}

export interface PublicUser {
  id: string;
  username: string | null;
  name: string;
  email: string | null;
  emailVerified: boolean;
  picture: string;
  localProfileId: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  needsUsername: boolean;
  unverifiedExpiresAt: number | null;
}

export function toPublicUser(user: AccountUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.username ?? user.googleName,
    email: user.email,
    emailVerified: user.emailVerified,
    picture: user.picture,
    localProfileId: user.localProfileId,
    hasPassword: user.passwordHash !== null,
    hasGoogle: user.googleSub !== null,
    needsUsername: user.username === null,
    unverifiedExpiresAt: user.unverifiedExpiresAt,
  };
}

export async function getRequestSession(req: IncomingMessage): Promise<StoredAuthSession | null> {
  const sessionId = getSessionCookie(req);
  return sessionId ? getSession(sessionId) : null;
}

/** Signs in with a brand-new session id, dropping whatever session the browser had (no fixation). */
export async function startSession(req: IncomingMessage, res: ServerResponse, userId: string): Promise<string> {
  const previous = getSessionCookie(req);
  if (previous) await deleteSession(previous);
  const sessionId = randomBytes(32).toString('base64url');
  await createSession({ id: sessionId, userId, expiresAt: Date.now() + SESSION_TTL_MS });
  setSessionCookie(req, res, sessionId, SESSION_TTL_MS);
  return sessionId;
}

export function sanitizeLocalProfileId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return null;
  return /^[a-zA-Z0-9._-]+$/.test(trimmed) ? trimmed : null;
}

/** Sends without failing the request: a delivery problem is logged, never surfaced as an auth error. */
export async function sendEmailQuietly(email: Parameters<SendEmail>[0]): Promise<boolean> {
  try {
    await authDeps.sendEmail(email);
    return true;
  } catch (error) {
    console.error('[auth] email delivery failed:', (error as Error).message);
    return false;
  }
}
