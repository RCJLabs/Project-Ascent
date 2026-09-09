import { openDB, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import { APP_VERSION } from '@/version';
import { DB_NAME, SCHEMA_VERSION, type AscentDB } from './schema';

/**
 * Migrations run sequentially inside the versionchange transaction:
 * upgrading from v0 (fresh) runs every step; upgrading from vN runs the
 * steps above N. Each step owns exactly one schema version.
 */
type Migration = (db: IDBPDatabase<AscentDB>, tx: IDBPTransaction<AscentDB, StoreNames<AscentDB>[], 'versionchange'>) => void;

const MIGRATIONS: Record<number, Migration> = {
  1: (db) => {
    db.createObjectStore('meta', { keyPath: 'key' });
    const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('by-date', 'date');
    db.createObjectStore('profile', { keyPath: 'key' });
    db.createObjectStore('programs', { keyPath: 'id' });
    db.createObjectStore('projects', { keyPath: 'id' });
    const metrics = db.createObjectStore('metrics', { keyPath: ['metricId', 'date'] });
    metrics.createIndex('by-metric', 'metricId');
    db.createObjectStore('game', { keyPath: 'key' });
    db.createObjectStore('media', { keyPath: 'id' });
  },

  // Media gained an owner so a deleted project can take its photos with it.
  // The store was created in v1 and never written to, so there is nothing to
  // backfill — but the step still has to exist, or an install sitting on v1
  // would open a database without the index and fail on first query.
  2: (_db, tx) => {
    const media = tx.objectStore('media');
    if (!media.indexNames.contains('by-owner')) media.createIndex('by-owner', 'ownerId');
  },
};

let dbPromise: Promise<IDBPDatabase<AscentDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<AscentDB>> {
  dbPromise ??= openDB<AscentDB>(DB_NAME, SCHEMA_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      for (let v = oldVersion + 1; v <= SCHEMA_VERSION; v++) {
        const step = MIGRATIONS[v];
        if (!step) throw new Error(`Missing migration for schema v${v}`);
        step(db, tx);
      }
    },
  }).then(async (db) => {
    await db.put('meta', { key: 'appVersion', value: APP_VERSION });
    const created = await db.get('meta', 'createdAt');
    if (!created) {
      await db.put('meta', { key: 'createdAt', value: new Date().toISOString() });
    }
    return db;
  });
  return dbPromise;
}

/** Test hook: forget the cached connection so a fresh DB can be opened. */
export function resetDbForTests(): void {
  dbPromise = null;
}
