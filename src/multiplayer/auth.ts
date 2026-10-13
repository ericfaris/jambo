import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeEmail } from './accountRules.ts';
import { handleAccountApi } from './accountApi.ts';
import { authDeps, getRequestSession, sanitizeLocalProfileId, startSession, toPublicUser } from './authCore.ts';
import {
  clearSessionCookie,
  getAppBaseUrl,
  getSessionCookie,
  isSameOriginJsonRequest,
  redirect,
  sendJson,
} from './authHttp.ts';
import { deleteSession, getLinkedProfileId } from './authStore.ts';
import {
  createUser,
  DuplicateAccountError,
  getUserByEmail,
  getUserByGoogleSub,
  getUserById,
  newUserId,
  updateUser,
} from './userStore.ts';
import type { AccountUser } from './userStore.ts';

interface OAuthFlowState {
  codeVerifier: string;
  localProfileId: string | null;
  returnTo: string;
  /** Set when a signed-in user is adding Google to their existing account. */
  linkUserId: string | null;
  createdAt: number;
}

interface GoogleTokenResponse {
  id_token?: string;
}

interface GoogleTokenInfoResponse {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
}

const oauthStates = new Map<string, OAuthFlowState>();

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getGoogleOAuthConfig() {
  return {
    clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
    clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
    redirectUri: process.env['GOOGLE_REDIRECT_URI'] ?? 'http://localhost:5173/api/auth/google/callback',
    appBaseUrl: getAppBaseUrl(),
  };
}

function cleanupExpiredOAuthStates(): void {
  const now = Date.now();
  for (const [state, value] of oauthStates.entries()) {
    if (now - value.createdAt > OAUTH_STATE_TTL_MS) {
      oauthStates.delete(state);
    }
  }
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createCodeVerifier(): string {
  return base64UrlEncode(randomBytes(64));
}

function createCodeChallenge(codeVerifier: string): string {
  const digest = createHash('sha256').update(codeVerifier).digest();
  return base64UrlEncode(digest);
}

function sanitizeReturnTo(value: string | null, appBaseUrl: string): string {
  try {
    const base = new URL(appBaseUrl);
    const resolved = new URL(value ?? '/', base);
    if (resolved.origin !== base.origin) {
      return base.toString();
    }
    return resolved.toString();
  } catch {
    return appBaseUrl;
  }
}

function appendQuery(urlString: string, key: string, value: string): string {
  const url = new URL(urlString);
  url.searchParams.set(key, value);
  return url.toString();
}

async function exchangeCodeForIdToken(code: string, codeVerifier: string): Promise<string> {
  const config = getGoogleOAuthConfig();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier,
  });

  const tokenResponse = await authDeps.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to exchange OAuth code for token');
  }

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenData.id_token) {
    throw new Error('Google token response missing id_token');
  }

  return tokenData.id_token;
}

async function getGoogleUserFromIdToken(idToken: string): Promise<GoogleTokenInfoResponse> {
  const url = new URL('https://oauth2.googleapis.com/tokeninfo');
  url.searchParams.set('id_token', idToken);
  const response = await authDeps.fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to validate id_token with Google');
  }
  return (await response.json()) as GoogleTokenInfoResponse;
}

type GoogleOutcome = { userId: string; status: 'success' } | { userId: null; status: string };

interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

/** Adds a Google identity to the signed-in account that started the flow. */
async function linkGoogle(linkUserId: string, google: GoogleIdentity): Promise<GoogleOutcome> {
  const target = await getUserById(linkUserId);
  if (!target) return { userId: null, status: 'failed' };
  const owner = await getUserByGoogleSub(google.sub);
  if (owner && owner.id !== target.id) return { userId: null, status: 'google_in_use' };

  const patch: Partial<AccountUser> = { googleSub: google.sub, googleName: google.name };
  if (!target.picture) patch.picture = google.picture;
  // Google has verified this address, so it confirms a matching unverified one.
  if (!target.emailVerified && target.email === google.email) {
    patch.emailVerified = true;
    patch.unverifiedExpiresAt = null;
  }
  try {
    await updateUser(target.id, patch);
  } catch (error) {
    if (error instanceof DuplicateAccountError) return { userId: null, status: 'google_in_use' };
    throw error;
  }
  return { userId: target.id, status: 'success' };
}

/** Signs in with Google, creating the account on first use. */
async function signInWithGoogle(google: GoogleIdentity, flowProfileId: string | null): Promise<GoogleOutcome> {
  const known = await getUserByGoogleSub(google.sub);
  if (known) {
    if (known.googleName !== google.name || (!known.picture && google.picture)) {
      await updateUser(known.id, { googleName: google.name, picture: known.picture || google.picture });
    }
    return { userId: known.id, status: 'success' };
  }

  const holder = await getUserByEmail(google.email);
  if (holder) {
    // A verified account already owns this address: never merge silently.
    if (holder.emailVerified) return { userId: null, status: 'email_in_use' };
    // An unverified claim loses to Google's verified one (it can now never verify, and is purged on schedule).
    await updateUser(holder.id, { email: null });
  }

  const user: AccountUser = {
    id: newUserId(),
    username: null,
    email: google.email,
    emailVerified: true,
    passwordHash: null,
    googleSub: google.sub,
    googleName: google.name,
    picture: google.picture,
    localProfileId: (await getLinkedProfileId(google.sub)) ?? flowProfileId,
    createdAt: Date.now(),
    unverifiedExpiresAt: null,
  };
  try {
    await createUser(user);
  } catch (error) {
    if (!(error instanceof DuplicateAccountError)) throw error;
    const raced = await getUserByGoogleSub(google.sub);
    if (raced) return { userId: raced.id, status: 'success' };
    return { userId: null, status: 'email_in_use' };
  }
  return { userId: user.id, status: 'success' };
}

export async function handleAuthApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const method = req.method ?? 'GET';
  const host = req.headers.host ?? 'localhost:3001';
  const requestUrl = new URL(req.url ?? '/', `http://${host}`);

  if (!requestUrl.pathname.startsWith('/api/auth/')) {
    return false;
  }

  cleanupExpiredOAuthStates();

  if (method === 'GET' && requestUrl.pathname === '/api/auth/google/start') {
    const config = getGoogleOAuthConfig();
    if (!config.clientId || !config.clientSecret) {
      sendJson(res, 500, {
        error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      });
      return true;
    }

    const returnTo = sanitizeReturnTo(requestUrl.searchParams.get('returnTo'), config.appBaseUrl);
    let linkUserId: string | null = null;
    if (requestUrl.searchParams.get('link') === '1') {
      const session = await getRequestSession(req);
      if (!session) {
        redirect(res, appendQuery(returnTo, 'auth', 'failed'));
        return true;
      }
      linkUserId = session.user.id;
    }

    const state = base64UrlEncode(randomBytes(24));
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);

    oauthStates.set(state, {
      codeVerifier,
      localProfileId: sanitizeLocalProfileId(requestUrl.searchParams.get('localProfileId')),
      returnTo,
      linkUserId,
      createdAt: Date.now(),
    });

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('prompt', 'select_account');

    redirect(res, authUrl.toString());
    return true;
  }

  if (method === 'GET' && requestUrl.pathname === '/api/auth/google/callback') {
    const config = getGoogleOAuthConfig();
    const authError = requestUrl.searchParams.get('error');
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');

    if (authError) {
      const fallback = sanitizeReturnTo('/', config.appBaseUrl);
      redirect(res, appendQuery(fallback, 'auth', 'error'));
      return true;
    }

    if (!code || !state) {
      const fallback = sanitizeReturnTo('/', config.appBaseUrl);
      redirect(res, appendQuery(fallback, 'auth', 'invalid_callback'));
      return true;
    }

    const flowState = oauthStates.get(state);
    oauthStates.delete(state);
    if (!flowState) {
      const fallback = sanitizeReturnTo('/', config.appBaseUrl);
      redirect(res, appendQuery(fallback, 'auth', 'state_expired'));
      return true;
    }

    try {
      const idToken = await exchangeCodeForIdToken(code, flowState.codeVerifier);
      const tokenInfo = await getGoogleUserFromIdToken(idToken);
      const emailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';

      if (tokenInfo.aud !== config.clientId || !tokenInfo.sub || !tokenInfo.email || !emailVerified) {
        throw new Error('Invalid token audience or required claim missing');
      }

      const google: GoogleIdentity = {
        sub: tokenInfo.sub,
        email: normalizeEmail(tokenInfo.email),
        name: tokenInfo.name ?? '',
        picture: tokenInfo.picture ?? '',
      };

      if (flowState.linkUserId) {
        const outcome = await linkGoogle(flowState.linkUserId, google);
        redirect(res, appendQuery(flowState.returnTo, 'auth', outcome.status === 'success' ? 'google_linked' : outcome.status));
        return true;
      }

      const outcome = await signInWithGoogle(google, flowState.localProfileId);
      if (outcome.userId) {
        await startSession(req, res, outcome.userId);
      }
      redirect(res, appendQuery(flowState.returnTo, 'auth', outcome.status));
      return true;
    } catch {
      redirect(res, appendQuery(flowState.returnTo, 'auth', 'failed'));
      return true;
    }
  }

  if (method === 'GET' && requestUrl.pathname === '/api/auth/session') {
    const session = await getRequestSession(req);
    if (!session) {
      sendJson(res, 200, { authenticated: false });
      return true;
    }
    sendJson(res, 200, {
      authenticated: true,
      user: toPublicUser(session.user),
      expiresAt: session.expiresAt,
    });
    return true;
  }

  if (method === 'POST' && requestUrl.pathname === '/api/auth/logout') {
    if (!isSameOriginJsonRequest(req)) {
      sendJson(res, 403, { error: 'Cross-origin request refused.' });
      return true;
    }
    const sessionId = getSessionCookie(req);
    if (sessionId) {
      await deleteSession(sessionId);
    }
    clearSessionCookie(req, res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  return handleAccountApi(req, res, requestUrl.pathname);
}
