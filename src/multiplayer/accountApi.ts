// ============================================================================
// Username + password accounts: sign-up, sign-in, email verification,
// forgotten-password reset, password change, and choosing a username.
//
// Guidance followed (NIST SP 800-63B-4, OWASP ASVS/cheat sheets):
//   - Argon2id hashes; 15+ character passwords, any Unicode, no composition
//     rules; breached passwords rejected (passwords.ts)
//   - sign-in failures never say which half was wrong, and take the same
//     time whether or not the account exists
//   - throttling per IP and per account instead of permanent lockouts
//   - a fresh session id at every sign-in; a password change or reset signs
//     out every other session
//   - single-use, hashed, short-lived email tokens; reset links are only sent
//     to verified addresses, and the "forgot password" reply is identical
//     whether or not the address has an account
// ============================================================================

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  checkEmailRules,
  checkPasswordRules,
  checkUsernameRules,
  normalizeEmail,
  normalizeUsername,
} from './accountRules.ts';
import {
  authDeps,
  getRequestSession,
  isPasswordAuthReady,
  limiters,
  RESET_PASSWORD_TTL_MS,
  sanitizeLocalProfileId,
  sendEmailQuietly,
  startSession,
  toPublicUser,
  VERIFY_EMAIL_TTL_MS,
} from './authCore.ts';
import {
  getAppBaseUrl,
  getClientIp,
  isSameOriginJsonRequest,
  readJsonObject,
  sendError,
  sendJson,
  sendTooMany,
  stringField,
} from './authHttp.ts';
import { deleteSessionsForUser } from './authStore.ts';
import {
  emailInUseMessage,
  passwordChangedMessage,
  resetPasswordMessage,
  verifyEmailMessage,
} from './emailTemplates.ts';
import { hashPassword, isPasswordBreached, needsRehash, verifyAgainstDummy, verifyPassword } from './passwords.ts';
import { verifyTurnstile } from './turnstile.ts';
import {
  consumeAuthToken,
  createAuthToken,
  createUser,
  deleteAuthTokensForUser,
  DuplicateAccountError,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  newUserId,
  peekAuthToken,
  UNVERIFIED_ACCOUNT_TTL_MS,
  updateUser,
} from './userStore.ts';
import type { AccountUser } from './userStore.ts';

const GENERIC_LOGIN_ERROR = 'Incorrect username/email or password.';
const BREACHED_PASSWORD_ERROR = 'That password has appeared in a data breach. Please choose a different one.';
const UNAVAILABLE_ERROR = 'Creating accounts with a password is temporarily unavailable.';
const TAKEN_USERNAME_ERROR = 'That username is taken.';

function appLink(param: 'verify' | 'reset', token: string): string {
  const url = new URL('/', getAppBaseUrl());
  url.searchParams.set(param, token);
  return url.toString();
}

async function sendVerification(user: AccountUser): Promise<void> {
  if (!user.email || !user.username) return;
  await deleteAuthTokensForUser(user.id, 'verify_email');
  const token = await createAuthToken('verify_email', user.id, user.email, VERIFY_EMAIL_TTL_MS);
  await sendEmailQuietly(verifyEmailMessage(user.email, user.username, appLink('verify', token)));
}

/** Local rules first (cheap, specific), then the breach corpus. */
async function passwordProblem(password: string, user: { username?: string | null; email?: string | null }): Promise<string | null> {
  const local = checkPasswordRules(password, user);
  if (local) return local;
  return (await isPasswordBreached(password, authDeps.fetch)) ? BREACHED_PASSWORD_ERROR : null;
}

async function handleSignup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isPasswordAuthReady()) return sendError(res, 503, UNAVAILABLE_ERROR);
  const ip = getClientIp(req);
  const limit = limiters.signupIp.hit(ip);
  if (!limit.allowed) return sendTooMany(res, limit.retryAfterMs);

  const body = await readJsonObject(req);
  if (!body) return sendError(res, 400, 'Invalid request.');
  if (!(await verifyTurnstile(body['turnstileToken'], ip, authDeps.fetch))) {
    return sendError(res, 400, "We couldn't confirm you're human. Please try again.", 'turnstile');
  }

  const username = normalizeUsername(stringField(body, 'username'));
  const email = normalizeEmail(stringField(body, 'email'));
  const password = stringField(body, 'password');

  const usernameError = checkUsernameRules(username);
  if (usernameError) return sendError(res, 400, usernameError, 'username');
  const emailError = checkEmailRules(email);
  if (emailError) return sendError(res, 400, emailError, 'email');
  const passwordError = await passwordProblem(password, { username, email });
  if (passwordError) return sendError(res, 400, passwordError, 'password');

  if (await getUserByUsername(username)) return sendError(res, 409, TAKEN_USERNAME_ERROR, 'username');

  const existing = await getUserByEmail(email);
  if (existing) {
    // Never auto-merge into an existing account (pre-account-hijacking); tell the address's owner how to get in.
    await sendEmailQuietly(emailInUseMessage(email, {
      username: existing.username,
      hasPassword: existing.passwordHash !== null,
      hasGoogle: existing.googleSub !== null,
    }, getAppBaseUrl()));
    return sendError(res, 409, "That email can't be used for a new account. If it's yours, we've sent sign-in instructions to it.", 'email');
  }

  const user: AccountUser = {
    id: newUserId(),
    username,
    email,
    emailVerified: false,
    passwordHash: await hashPassword(password),
    googleSub: null,
    googleName: '',
    picture: '',
    localProfileId: sanitizeLocalProfileId(body['localProfileId']),
    createdAt: Date.now(),
    unverifiedExpiresAt: Date.now() + UNVERIFIED_ACCOUNT_TTL_MS,
  };
  try {
    await createUser(user);
  } catch (error) {
    if (error instanceof DuplicateAccountError) {
      return error.field === 'username'
        ? sendError(res, 409, TAKEN_USERNAME_ERROR, 'username')
        : sendError(res, 409, "That email can't be used for a new account.", 'email');
    }
    throw error;
  }

  await sendVerification(user);
  await startSession(req, res, user.id);
  sendJson(res, 201, { authenticated: true, user: toPublicUser(user) });
}

async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ipLimit = limiters.loginIp.hit(getClientIp(req));
  if (!ipLimit.allowed) return sendTooMany(res, ipLimit.retryAfterMs);

  const body = await readJsonObject(req);
  if (!body) return sendError(res, 400, 'Invalid request.');
  const identifier = stringField(body, 'identifier').trim();
  const password = stringField(body, 'password');
  if (!identifier || !password || identifier.length > 254 || password.length > 1024) {
    return sendError(res, 401, GENERIC_LOGIN_ERROR);
  }

  const accountKey = identifier.toLowerCase();
  const accountLimit = limiters.loginAccount.check(accountKey);
  if (!accountLimit.allowed) return sendTooMany(res, accountLimit.retryAfterMs);

  const user = identifier.includes('@')
    ? await getUserByEmail(normalizeEmail(identifier))
    : await getUserByUsername(identifier);
  const ok = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : await verifyAgainstDummy(password);
  if (!ok || !user) {
    limiters.loginAccount.hit(accountKey);
    return sendError(res, 401, GENERIC_LOGIN_ERROR);
  }
  limiters.loginAccount.reset(accountKey);

  const patch: Partial<AccountUser> = {};
  if (user.passwordHash && needsRehash(user.passwordHash)) patch.passwordHash = await hashPassword(password);
  const localProfileId = sanitizeLocalProfileId(body['localProfileId']);
  if (!user.localProfileId && localProfileId) patch.localProfileId = localProfileId;
  if (Object.keys(patch).length > 0) await updateUser(user.id, patch);

  await startSession(req, res, user.id);
  sendJson(res, 200, { authenticated: true, user: toPublicUser({ ...user, ...patch }) });
}

async function handleVerifyEmail(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const limit = limiters.verifyIp.hit(getClientIp(req));
  if (!limit.allowed) return sendTooMany(res, limit.retryAfterMs);
  const body = await readJsonObject(req);
  const token = body ? stringField(body, 'token') : '';
  const record = await consumeAuthToken('verify_email', token);
  const user = record ? await getUserById(record.userId) : null;
  if (!record || !user || user.email !== record.email) {
    return sendError(res, 400, 'That confirmation link is invalid or has expired.');
  }
  await updateUser(user.id, { emailVerified: true, unverifiedExpiresAt: null });
  sendJson(res, 200, { ok: true });
}

async function handleResendVerification(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = await getRequestSession(req);
  if (!session) return sendError(res, 401, 'Sign in first.');
  if (session.user.emailVerified) return sendJson(res, 200, { ok: true, alreadyVerified: true });
  const limit = limiters.resendVerification.hit(session.user.id);
  if (!limit.allowed) return sendTooMany(res, limit.retryAfterMs);
  await sendVerification(session.user);
  sendJson(res, 200, { ok: true });
}

async function handleForgotPassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isPasswordAuthReady()) return sendError(res, 503, 'Password reset is temporarily unavailable.');
  const ip = getClientIp(req);
  const limit = limiters.forgotIp.hit(ip);
  if (!limit.allowed) return sendTooMany(res, limit.retryAfterMs);

  const body = await readJsonObject(req);
  if (!body) return sendError(res, 400, 'Invalid request.');
  if (!(await verifyTurnstile(body['turnstileToken'], ip, authDeps.fetch))) {
    return sendError(res, 400, "We couldn't confirm you're human. Please try again.", 'turnstile');
  }
  const email = normalizeEmail(stringField(body, 'email'));
  const emailError = checkEmailRules(email);
  if (emailError) return sendError(res, 400, emailError, 'email');

  // Same reply, sent before any lookup, whether or not the address has an account.
  sendJson(res, 200, { ok: true });

  if (!limiters.forgotEmail.hit(email).allowed) return;
  const user = await getUserByEmail(email);
  // Unverified addresses never get reset links: a mistyped address must not become a way in.
  if (!user || !user.emailVerified) return;
  await deleteAuthTokensForUser(user.id, 'reset_password');
  const token = await createAuthToken('reset_password', user.id, email, RESET_PASSWORD_TTL_MS);
  await sendEmailQuietly(resetPasswordMessage(email, user.username, appLink('reset', token)));
}

async function handleResetPassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const limit = limiters.resetIp.hit(getClientIp(req));
  if (!limit.allowed) return sendTooMany(res, limit.retryAfterMs);
  const body = await readJsonObject(req);
  if (!body) return sendError(res, 400, 'Invalid request.');
  const token = stringField(body, 'token');
  const password = stringField(body, 'password');

  const invalidLink = 'That reset link is invalid or has expired. Request a new one.';
  const pending = await peekAuthToken('reset_password', token);
  const user = pending ? await getUserById(pending.userId) : null;
  if (!pending || !user || user.email !== pending.email) return sendError(res, 400, invalidLink, 'token');

  const passwordError = await passwordProblem(password, user);
  if (passwordError) return sendError(res, 400, passwordError, 'password');

  // Spend the token only now, so a rejected password can be retried with the same link.
  if (!(await consumeAuthToken('reset_password', token))) return sendError(res, 400, invalidLink, 'token');
  await updateUser(user.id, { passwordHash: await hashPassword(password) });
  await deleteAuthTokensForUser(user.id, 'reset_password');
  await deleteSessionsForUser(user.id);
  limiters.loginAccount.reset(user.username?.toLowerCase() ?? '');
  if (user.email) limiters.loginAccount.reset(user.email);
  // No automatic sign-in after a reset (OWASP): they sign in with the new password.
  sendJson(res, 200, { ok: true });
}

async function handleChangePassword(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = await getRequestSession(req);
  if (!session) return sendError(res, 401, 'Sign in first.');
  const limit = limiters.passwordChange.hit(session.user.id);
  if (!limit.allowed) return sendTooMany(res, limit.retryAfterMs);

  const body = await readJsonObject(req);
  if (!body) return sendError(res, 400, 'Invalid request.');
  const user = session.user;
  if (user.passwordHash) {
    const current = stringField(body, 'currentPassword');
    if (!current || current.length > 1024 || !(await verifyPassword(current, user.passwordHash))) {
      return sendError(res, 401, 'Your current password is incorrect.', 'currentPassword');
    }
  } else if (!user.emailVerified) {
    return sendError(res, 403, 'Confirm your email before adding a password.');
  }
  const password = stringField(body, 'newPassword');
  const passwordError = await passwordProblem(password, user);
  if (passwordError) return sendError(res, 400, passwordError, 'newPassword');

  await updateUser(user.id, { passwordHash: await hashPassword(password) });
  await deleteSessionsForUser(user.id);
  await startSession(req, res, user.id);
  if (user.passwordHash && user.email) await sendEmailQuietly(passwordChangedMessage(user.email, user.username));
  sendJson(res, 200, { ok: true });
}

async function handleSetUsername(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const session = await getRequestSession(req);
  if (!session) return sendError(res, 401, 'Sign in first.');
  const limit = limiters.usernameChange.hit(session.user.id);
  if (!limit.allowed) return sendTooMany(res, limit.retryAfterMs);

  const body = await readJsonObject(req);
  if (!body) return sendError(res, 400, 'Invalid request.');
  const username = normalizeUsername(stringField(body, 'username'));
  const usernameError = checkUsernameRules(username);
  if (usernameError) return sendError(res, 400, usernameError, 'username');

  const owner = await getUserByUsername(username);
  if (owner && owner.id !== session.user.id) return sendError(res, 409, TAKEN_USERNAME_ERROR, 'username');
  try {
    await updateUser(session.user.id, { username });
  } catch (error) {
    if (error instanceof DuplicateAccountError) return sendError(res, 409, TAKEN_USERNAME_ERROR, 'username');
    throw error;
  }
  sendJson(res, 200, { authenticated: true, user: toPublicUser({ ...session.user, username }) });
}

const ROUTES: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
  '/api/auth/signup': handleSignup,
  '/api/auth/login': handleLogin,
  '/api/auth/verify-email': handleVerifyEmail,
  '/api/auth/verify-email/resend': handleResendVerification,
  '/api/auth/password/forgot': handleForgotPassword,
  '/api/auth/password/reset': handleResetPassword,
  '/api/auth/password/change': handleChangePassword,
  '/api/auth/username': handleSetUsername,
};

/** Handles the password-account routes; false when the path isn't one of them. */
export async function handleAccountApi(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
  const route = ROUTES[pathname];
  if (!route) return false;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendError(res, 405, 'Method not allowed');
    return true;
  }
  if (!isSameOriginJsonRequest(req)) {
    sendError(res, 403, 'Cross-origin request refused.');
    return true;
  }
  await route(req, res);
  return true;
}
