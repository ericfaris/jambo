import { MongoClient } from 'mongodb';
import type { Db } from 'mongodb';

let mongoClientPromise: Promise<MongoClient> | null = null;

function getMongoUri(): string {
  return process.env['MONGODB_URI'] ?? '';
}

function getMongoDbName(): string {
  const explicit = process.env['MONGODB_DB'];
  if (explicit) {
    return explicit;
  }

  const uri = getMongoUri();
  if (!uri) {
    return 'jambo';
  }

  try {
    const parsed = new URL(uri);
    const dbName = parsed.pathname.replace(/^\//, '').trim();
    return dbName || 'jambo';
  } catch {
    return 'jambo';
  }
}

/** Without MONGODB_URI the auth stores fall back to process memory (dev and tests). */
export function isMongoEnabled(): boolean {
  return Boolean(getMongoUri());
}

export async function getAuthDb(): Promise<Db> {
  if (!mongoClientPromise) {
    const uri = getMongoUri();
    if (!uri) {
      throw new Error('MONGODB_URI is not configured');
    }
    mongoClientPromise = new MongoClient(uri).connect();
  }
  const client = await mongoClientPromise;
  return client.db(getMongoDbName());
}
