// ============================================================================
// Who is sitting in a friend-game seat — resolved once per WebSocket from the
// session cookie on the upgrade request. Clients only ever see the display
// name, an https avatar and whether the seat is signed in; never an email,
// account id or profile id. Kept pure (the lookup is injected) so it's
// testable without the server.
// ============================================================================

import { isValidProfileId, canonicalProfileId } from './statsApi.ts';

export interface SessionIdentity {
  signedIn: boolean;
  name: string;
  avatarUrl: string | null;
  /**
   * Maps this device's profile id to the stats profile the account records
   * under — via the stats API's own `canonicalProfileId`, so friend games land
   * in the same record as everything else. Server-side only; null for guests.
   */
  profileFor: ((clientProfileId: string) => string) | null;
}

/** What a session lookup returns — only the fields a seat needs. */
export interface SessionLookupResult {
  user: { name?: string | null; picture?: string | null; localProfileId?: string | null };
}

type SessionWithProfile = Parameters<typeof canonicalProfileId>[0];

export const GUEST_NAME = 'Guest';
/** Usernames are at most 20 characters; a Google name fallback can run longer. */
export const MAX_DISPLAY_NAME_LENGTH = 24;
const SESSION_COOKIE = 'jambo_session';

export const GUEST_IDENTITY: SessionIdentity = { signedIn: false, name: GUEST_NAME, avatarUrl: null, profileFor: null };

export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key !== SESSION_COOKIE) continue;
    const raw = rest.join('=');
    let value = raw;
    try { value = decodeURIComponent(raw); } catch { /* keep it raw */ }
    return value.length > 0 ? value : null;
  }
  return null;
}

/** The account's display name, tidied for a seat label: one line, no control characters, capped. */
export function displayName(fullName: string | undefined | null): string {
  if (typeof fullName !== 'string') return GUEST_NAME;
  // eslint-disable-next-line no-control-regex
  const clean = fullName.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return GUEST_NAME;
  const chars = Array.from(clean);
  return chars.length <= MAX_DISPLAY_NAME_LENGTH ? clean : `${chars.slice(0, MAX_DISPLAY_NAME_LENGTH - 1).join('').trimEnd()}…`;
}

export function safeAvatarUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > 2048) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export async function resolveSessionIdentity(
  cookieHeader: string | undefined,
  lookup: (sessionId: string) => Promise<SessionLookupResult | null>,
): Promise<SessionIdentity> {
  const sessionId = parseSessionCookie(cookieHeader);
  if (!sessionId) return GUEST_IDENTITY;
  try {
    const session = await lookup(sessionId);
    if (!session) return GUEST_IDENTITY;
    const statsSession: SessionWithProfile = session;
    return {
      signedIn: true,
      name: displayName(session.user.name),
      avatarUrl: safeAvatarUrl(session.user.picture),
      profileFor: (clientProfileId) => canonicalProfileId(statsSession, clientProfileId),
    };
  } catch {
    return GUEST_IDENTITY;
  }
}

/**
 * The stats profile a seat's results and abandons are recorded under — the
 * same canonical id the stats API resolves. Guests get none: only signed-in
 * players are recorded.
 */
export function seatProfileId(identity: SessionIdentity, clientProfileId: unknown): string | null {
  if (!identity.signedIn || !identity.profileFor) return null;
  // A signed-in tab always sends its device profile; without one there's
  // nothing to fall back to unless the account has a linked profile.
  const resolved = identity.profileFor(isValidProfileId(clientProfileId) ? clientProfileId : '');
  return isValidProfileId(resolved) ? resolved : null;
}
