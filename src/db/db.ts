import { openDB, type IDBPDatabase } from 'idb';
import { APP_VERSION } from '@/version';
import { DB_NAME, SCHEMA_VERSION, type AscentDB } from './schema';

/**
 * Migrations run sequentially inside the versionchange transaction:
 * upgrading from v0 (fresh) runs every step; upgrading from vN runs the
 * steps above N. Each step owns exactly one schema version.
 */
type Migration = (db: IDBPDatabase<AscentDB>) => void;

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
};

let dbPromise: Promise<IDBPDatabase<AscentDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<AscentDB>> {
  dbPromise ??= openDB<AscentDB>(DB_NAME, SCHEMA_VERSION, {
    upgrade(db, oldVersion) {
      for (let v = oldVersion + 1; v <= SCHEMA_VERSION; v++) {
        const step = MIGRATIONS[v];
        if (!step) throw new Error(`Missing migration for schema v${v}`);
        step(db);
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
