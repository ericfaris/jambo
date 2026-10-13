// ============================================================================
// Accounts and single-use auth tokens.
//
// One user can hold several sign-in methods (a password, a Google identity;
// passkeys later). Usernames are case-insensitively unique and double as the
// in-game display name. A password account starts with an unverified email and
// is purged after UNVERIFIED_ACCOUNT_TTL_MS unless verified (Mongo TTL index
// on `unverifiedExpiresAt`, which verification unsets).
//
// Tokens (email verification, password reset) are stored only as SHA-256
// hashes, so a database leak doesn't hand out working links.
// ============================================================================

import { createHash, randomBytes } from 'node:crypto';
import type { Collection } from 'mongodb';
import { getAuthDb, isMongoEnabled } from './authDb.ts';

export const UNVERIFIED_ACCOUNT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AccountUser {
  id: string;
  /** Login handle and display name; null until a Google user picks one. */
  username: string | null;
  /** Normalized (lowercase). Null only when a verified Google sign-in claimed it from an unverified account. */
  email: string | null;
  emailVerified: boolean;
  passwordHash: string | null;
  googleSub: string | null;
  /** Google profile name, kept as the suggestion when choosing a username. */
  googleName: string;
  picture: string;
  localProfileId: string | null;
  createdAt: number;
  /** When an unverified account is purged; null once verified (or for Google sign-ups). */
  unverifiedExpiresAt: number | null;
}

export type UserPatch = Partial<Omit<AccountUser, 'id' | 'createdAt'>>;

export class DuplicateAccountError extends Error {
  constructor(readonly field: 'username' | 'email' | 'googleSub') {
    super(`Duplicate ${field}`);
  }
}

export type AuthTokenPurpose = 'verify_email' | 'reset_password';

export interface AuthTokenRecord {
  purpose: AuthTokenPurpose;
  userId: string;
  /** The address the link was sent to; the token is void if the account's email has changed since. */
  email: string;
  expiresAt: number;
}

interface UserDocument {
  _id: string;
  username: string | null;
  usernameLower: string | null;
  email: string | null;
  emailVerified: boolean;
  passwordHash: string | null;
  googleSub: string | null;
  googleName: string;
  picture: string;
  localProfileId: string | null;
  createdAt: Date;
  unverifiedExpiresAt?: Date;
}

interface TokenDocument {
  _id: string;
  purpose: AuthTokenPurpose;
  userId: string;
  email: string;
  expiresAt: Date;
}

const memoryUsers = new Map<string, AccountUser>();
const memoryTokens = new Map<string, AuthTokenRecord>();
let indexesReady = false;

export function newUserId(): string {
  return randomBytes(12).toString('hex');
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function isExpiredUnverified(user: AccountUser, now = Date.now()): boolean {
  return !user.emailVerified && user.unverifiedExpiresAt !== null && user.unverifiedExpiresAt <= now;
}

function toDocument(user: AccountUser): UserDocument {
  const doc: UserDocument = {
    _id: user.id,
    username: user.username,
    usernameLower: user.username?.toLowerCase() ?? null,
    email: user.email,
    emailVerified: user.emailVerified,
    passwordHash: user.passwordHash,
    googleSub: user.googleSub,
    googleName: user.googleName,
    picture: user.picture,
    localProfileId: user.localProfileId,
    createdAt: new Date(user.createdAt),
  };
  if (user.unverifiedExpiresAt !== null) doc.unverifiedExpiresAt = new Date(user.unverifiedExpiresAt);
  return doc;
}

function fromDocument(doc: UserDocument | null): AccountUser | null {
  if (!doc) return null;
  const user: AccountUser = {
    id: doc._id,
    username: doc.username,
    email: doc.email,
    emailVerified: doc.emailVerified,
    passwordHash: doc.passwordHash,
    googleSub: doc.googleSub,
    googleName: doc.googleName,
    picture: doc.picture,
    localProfileId: doc.localProfileId,
    createdAt: doc.createdAt.getTime(),
    unverifiedExpiresAt: doc.unverifiedExpiresAt?.getTime() ?? null,
  };
  // The TTL monitor runs about once a minute; never hand out an account past its deadline.
  return isExpiredUnverified(user) ? null : user;
}

async function users(): Promise<Collection<UserDocument>> {
  const db = await getAuthDb();
  const collection = db.collection<UserDocument>('users');
  if (!indexesReady) {
    const tokens = db.collection<TokenDocument>('auth_tokens');
    const isString = (field: string) => ({ partialFilterExpression: { [field]: { $type: 'string' } } });
    await Promise.all([
      collection.createIndex({ usernameLower: 1 }, { unique: true, ...isString('usernameLower') }),
      collection.createIndex({ email: 1 }, { unique: true, ...isString('email') }),
      collection.createIndex({ googleSub: 1 }, { unique: true, ...isString('googleSub') }),
      collection.createIndex({ unverifiedExpiresAt: 1 }, { expireAfterSeconds: 0 }),
      tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      tokens.createIndex({ userId: 1, purpose: 1 }),
    ]);
    indexesReady = true;
  }
  return collection;
}

async function tokens(): Promise<Collection<TokenDocument>> {
  await users();
  return (await getAuthDb()).collection<TokenDocument>('auth_tokens');
}

/** Maps a Mongo duplicate-key error onto the field that collided. */
function asDuplicate(error: unknown): DuplicateAccountError | null {
  const mongoError = error as { code?: number; keyPattern?: Record<string, unknown> };
  if (mongoError.code !== 11000) return null;
  const key = Object.keys(mongoError.keyPattern ?? {})[0];
  if (key === 'usernameLower') return new DuplicateAccountError('username');
  if (key === 'googleSub') return new DuplicateAccountError('googleSub');
  return new DuplicateAccountError('email');
}

function memoryCollision(candidate: AccountUser): DuplicateAccountError | null {
  const usernameLower = candidate.username?.toLowerCase();
  for (const other of memoryUsers.values()) {
    if (other.id === candidate.id || isExpiredUnverified(other)) continue;
    if (usernameLower && other.username?.toLowerCase() === usernameLower) return new DuplicateAccountError('username');
    if (candidate.email && other.email === candidate.email) return new DuplicateAccountError('email');
    if (candidate.googleSub && other.googleSub === candidate.googleSub) return new DuplicateAccountError('googleSub');
  }
  return null;
}

function memoryFind(predicate: (user: AccountUser) => boolean): AccountUser | null {
  for (const [id, user] of memoryUsers) {
    if (isExpiredUnverified(user)) {
      memoryUsers.delete(id);
      continue;
    }
    if (predicate(user)) return user;
  }
  return null;
}

export async function createUser(user: AccountUser): Promise<void> {
  if (!isMongoEnabled()) {
    const collision = memoryCollision(user);
    if (collision) throw collision;
    memoryUsers.set(user.id, { ...user });
    return;
  }
  try {
    await (await users()).insertOne(toDocument(user));
  } catch (error) {
    throw asDuplicate(error) ?? error;
  }
}

export async function updateUser(id: string, patch: UserPatch): Promise<void> {
  if (!isMongoEnabled()) {
    const existing = memoryUsers.get(id);
    if (!existing) return;
    const next = { ...existing, ...patch };
    const collision = memoryCollision(next);
    if (collision) throw collision;
    memoryUsers.set(id, next);
    return;
  }

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'unverifiedExpiresAt') {
      if (value === null) $unset['unverifiedExpiresAt'] = '';
      else $set['unverifiedExpiresAt'] = new Date(value as number);
      continue;
    }
    $set[key] = value;
    if (key === 'username') $set['usernameLower'] = typeof value === 'string' ? value.toLowerCase() : null;
  }
  const update: Record<string, unknown> = {};
  if (Object.keys($set).length > 0) update['$set'] = $set;
  if (Object.keys($unset).length > 0) update['$unset'] = $unset;
  if (Object.keys(update).length === 0) return;
  try {
    await (await users()).updateOne({ _id: id }, update);
  } catch (error) {
    throw asDuplicate(error) ?? error;
  }
}

export async function getUserById(id: string): Promise<AccountUser | null> {
  if (!isMongoEnabled()) return memoryFind((user) => user.id === id);
  return fromDocument(await (await users()).findOne({ _id: id }));
}

export async function getUserByUsername(username: string): Promise<AccountUser | null> {
  const lowered = username.toLowerCase();
  if (!isMongoEnabled()) return memoryFind((user) => user.username?.toLowerCase() === lowered);
  return fromDocument(await (await users()).findOne({ usernameLower: lowered }));
}

export async function getUserByEmail(email: string): Promise<AccountUser | null> {
  if (!isMongoEnabled()) return memoryFind((user) => user.email === email);
  return fromDocument(await (await users()).findOne({ email }));
}

export async function getUserByGoogleSub(googleSub: string): Promise<AccountUser | null> {
  if (!isMongoEnabled()) return memoryFind((user) => user.googleSub === googleSub);
  return fromDocument(await (await users()).findOne({ googleSub }));
}

/** Issues a fresh single-use token and returns the raw value to put in the link. */
export async function createAuthToken(purpose: AuthTokenPurpose, userId: string, email: string, ttlMs: number): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  const record: AuthTokenRecord = { purpose, userId, email, expiresAt: Date.now() + ttlMs };
  if (!isMongoEnabled()) {
    memoryTokens.set(hashToken(raw), record);
    return raw;
  }
  await (await tokens()).insertOne({ _id: hashToken(raw), ...record, expiresAt: new Date(record.expiresAt) });
  return raw;
}

function liveToken(record: AuthTokenRecord | null, purpose: AuthTokenPurpose): AuthTokenRecord | null {
  if (!record || record.purpose !== purpose || record.expiresAt <= Date.now()) return null;
  return record;
}

function fromTokenDocument(doc: TokenDocument | null): AuthTokenRecord | null {
  if (!doc) return null;
  return { purpose: doc.purpose, userId: doc.userId, email: doc.email, expiresAt: doc.expiresAt.getTime() };
}

/** Looks a token up without spending it (so a rejected new password can be retried). */
export async function peekAuthToken(purpose: AuthTokenPurpose, raw: string): Promise<AuthTokenRecord | null> {
  if (!raw) return null;
  if (!isMongoEnabled()) return liveToken(memoryTokens.get(hashToken(raw)) ?? null, purpose);
  return liveToken(fromTokenDocument(await (await tokens()).findOne({ _id: hashToken(raw) })), purpose);
}

/** Atomically spends a token; only the first caller gets the record back. */
export async function consumeAuthToken(purpose: AuthTokenPurpose, raw: string): Promise<AuthTokenRecord | null> {
  if (!raw) return null;
  const id = hashToken(raw);
  if (!isMongoEnabled()) {
    const record = memoryTokens.get(id) ?? null;
    memoryTokens.delete(id);
    return liveToken(record, purpose);
  }
  return liveToken(fromTokenDocument(await (await tokens()).findOneAndDelete({ _id: id })), purpose);
}

export async function deleteAuthTokensForUser(userId: string, purpose: AuthTokenPurpose): Promise<void> {
  if (!isMongoEnabled()) {
    for (const [id, record] of memoryTokens) {
      if (record.userId === userId && record.purpose === purpose) memoryTokens.delete(id);
    }
    return;
  }
  await (await tokens()).deleteMany({ userId, purpose });
}

export function resetUserStoreForTests(): void {
  memoryUsers.clear();
  memoryTokens.clear();
}
