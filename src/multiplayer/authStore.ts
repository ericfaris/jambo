// ============================================================================
// Sign-in sessions. A session row points at a user (userStore.ts); the cookie
// carries only the random session id.
//
// Sessions created before accounts existed embedded a Google profile instead
// of a userId. getSession() migrates those in place: it finds or creates the
// account for that Google identity (carrying over its linked local profile)
// and rewrites the row, so nobody is signed out by the upgrade.
// ============================================================================

import type { Collection } from 'mongodb';
import { getAuthDb, isMongoEnabled } from './authDb.ts';
import { createUser, DuplicateAccountError, getUserByGoogleSub, getUserById, newUserId } from './userStore.ts';
import type { AccountUser } from './userStore.ts';

/** The pre-accounts session payload (Google only). */
interface LegacySessionUser {
  googleSub: string;
  email: string;
  name: string;
  picture: string;
  localProfileId: string | null;
}

export interface StoredAuthSession {
  id: string;
  user: AccountUser;
  expiresAt: number;
}

interface SessionRecord {
  id: string;
  userId: string | null;
  legacyUser: LegacySessionUser | null;
  expiresAt: number;
}

interface SessionDocument {
  _id: string;
  userId?: string;
  user?: LegacySessionUser;
  expiresAt: Date;
  createdAt: Date;
}

interface GoogleLinkDocument {
  _id: string;
  localProfileId: string;
  updatedAt: Date;
}

const memorySessions = new Map<string, SessionRecord>();
const memoryGoogleLinks = new Map<string, string>();
let indexesReady = false;

async function sessions(): Promise<Collection<SessionDocument>> {
  const db = await getAuthDb();
  const collection = db.collection<SessionDocument>('oauth_sessions');
  if (!indexesReady) {
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await collection.createIndex({ userId: 1 });
    await db.collection<GoogleLinkDocument>('oauth_google_links').createIndex({ updatedAt: 1 });
    indexesReady = true;
  }
  return collection;
}

export async function createSession(session: { id: string; userId: string; expiresAt: number }): Promise<void> {
  if (!isMongoEnabled()) {
    memorySessions.set(session.id, { id: session.id, userId: session.userId, legacyUser: null, expiresAt: session.expiresAt });
    return;
  }
  await (await sessions()).insertOne({
    _id: session.id,
    userId: session.userId,
    expiresAt: new Date(session.expiresAt),
    createdAt: new Date(),
  });
}

async function getSessionRecord(sessionId: string): Promise<SessionRecord | null> {
  if (!isMongoEnabled()) {
    const record = memorySessions.get(sessionId);
    if (!record || record.expiresAt <= Date.now()) {
      memorySessions.delete(sessionId);
      return null;
    }
    return record;
  }

  const collection = await sessions();
  const doc = await collection.findOne({ _id: sessionId });
  if (!doc) return null;
  if (doc.expiresAt.getTime() <= Date.now()) {
    await collection.deleteOne({ _id: sessionId });
    return null;
  }
  return { id: doc._id, userId: doc.userId ?? null, legacyUser: doc.user ?? null, expiresAt: doc.expiresAt.getTime() };
}

async function setSessionUser(sessionId: string, userId: string): Promise<void> {
  if (!isMongoEnabled()) {
    const record = memorySessions.get(sessionId);
    if (record) memorySessions.set(sessionId, { ...record, userId, legacyUser: null });
    return;
  }
  await (await sessions()).updateOne({ _id: sessionId }, { $set: { userId }, $unset: { user: '' } });
}

/** Finds or creates the account for a pre-accounts Google session. */
async function migrateLegacySession(record: SessionRecord, legacy: LegacySessionUser): Promise<AccountUser | null> {
  let user = await getUserByGoogleSub(legacy.googleSub);
  if (!user) {
    user = {
      id: newUserId(),
      username: null,
      email: legacy.email.trim().toLowerCase() || null,
      emailVerified: true,
      passwordHash: null,
      googleSub: legacy.googleSub,
      googleName: legacy.name,
      picture: legacy.picture,
      localProfileId: (await getLinkedProfileId(legacy.googleSub)) ?? legacy.localProfileId,
      createdAt: Date.now(),
      unverifiedExpiresAt: null,
    };
    try {
      await createUser(user);
    } catch (error) {
      if (!(error instanceof DuplicateAccountError)) throw error;
      // Lost a race with another tab, or the email is taken: re-read, else make them sign in again.
      user = await getUserByGoogleSub(legacy.googleSub);
      if (!user) {
        await deleteSession(record.id);
        return null;
      }
    }
  }
  await setSessionUser(record.id, user.id);
  return user;
}

export async function getSession(sessionId: string): Promise<StoredAuthSession | null> {
  const record = await getSessionRecord(sessionId);
  if (!record) return null;

  let user: AccountUser | null = null;
  if (record.userId) {
    user = await getUserById(record.userId);
  } else if (record.legacyUser) {
    user = await migrateLegacySession(record, record.legacyUser);
  }
  if (!user) {
    // The account is gone (e.g. an unverified account was purged).
    await deleteSession(sessionId);
    return null;
  }
  return { id: record.id, user, expiresAt: record.expiresAt };
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!isMongoEnabled()) {
    memorySessions.delete(sessionId);
    return;
  }
  await (await sessions()).deleteOne({ _id: sessionId });
}

/** Signs a user out everywhere (optionally keeping one session), e.g. after a password change. */
export async function deleteSessionsForUser(userId: string, exceptSessionId: string | null = null): Promise<void> {
  if (!isMongoEnabled()) {
    for (const [id, record] of memorySessions) {
      if (record.userId === userId && id !== exceptSessionId) memorySessions.delete(id);
    }
    return;
  }
  const filter: Record<string, unknown> = { userId };
  if (exceptSessionId) filter['_id'] = { $ne: exceptSessionId };
  await (await sessions()).deleteMany(filter);
}

/** Pre-accounts Google → local profile links, read when an account is first created for a Google identity. */
export async function getLinkedProfileId(googleSub: string): Promise<string | null> {
  if (!isMongoEnabled()) {
    return memoryGoogleLinks.get(googleSub) ?? null;
  }
  await sessions();
  const db = await getAuthDb();
  const link = await db.collection<GoogleLinkDocument>('oauth_google_links').findOne({ _id: googleSub });
  return link?.localProfileId ?? null;
}

export function resetAuthStoreForTests(legacy: { sessions?: Array<{ id: string; user: LegacySessionUser; expiresAt: number }>; googleLinks?: Array<[string, string]> } = {}): void {
  memorySessions.clear();
  memoryGoogleLinks.clear();
  for (const session of legacy.sessions ?? []) {
    memorySessions.set(session.id, { id: session.id, userId: null, legacyUser: session.user, expiresAt: session.expiresAt });
  }
  for (const [sub, profileId] of legacy.googleLinks ?? []) memoryGoogleLinks.set(sub, profileId);
}
