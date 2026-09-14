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

/**
 * Why the database cannot be read, when it cannot (PLAN.md M151).
 *
 * §10 calls data loss the existential risk. This is the failure next to it
 * and in some ways worse: **having the data and being shown nothing.** Every
 * way the database can refuse used to arrive at the same screen — an app
 * with no sessions in it, indistinguishable from a fresh install, because
 * eight stores catch their read and set `hydrated: true` with nothing in
 * hand.
 *
 * - `blocked` — two tabs, two schema versions. One holds the old version
 *   open and the other cannot upgrade past it.
 * - `newer-schema` — this device's data was written by a later build. The
 *   log is intact and this version must not touch it. `exportImport.ts`
 *   has refused a newer *backup* with a sentence since it was written; the
 *   database itself had no such path.
 * - `no-room` — the device is full. Reads work; writes do not.
 * - `unavailable` — the browser will not open storage at all. Private
 *   windows and blocked site data are the usual reasons.
 */
export type DbFault = 'blocked' | 'newer-schema' | 'no-room' | 'unavailable';

let dbPromise: Promise<IDBPDatabase<AscentDB>> | null = null;
let fault: DbFault | null = null;
const watchers = new Set<() => void>();

function setFault(next: DbFault | null): void {
  if (fault === next) return;
  fault = next;
  for (const watcher of watchers) watcher();
}

/** What the database is currently refusing to do, or null when it is fine. */
export function dbFault(): DbFault | null {
  return fault;
}

/** Subscribe to that, for a screen that has to say so. */
export function watchDbFault(onChange: () => void): () => void {
  watchers.add(onChange);
  return () => {
    watchers.delete(onChange);
  };
}

/**
 * What an error out of IndexedDB actually means.
 *
 * By `name`, not by message: the text differs per browser and is not a
 * contract, while `VersionError` and `QuotaExceededError` are named in the
 * spec. Anything unrecognised is `unavailable` rather than a guess — the
 * climber is told the storage cannot be opened, which is true of every case
 * that reaches here.
 */
export function faultOf(error: unknown): DbFault {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'VersionError') return 'newer-schema';
  if (name === 'QuotaExceededError') return 'no-room';
  return 'unavailable';
}

/** Record why a read or a write failed, from a catch that would swallow it. */
export function reportDbError(error: unknown): void {
  setFault(faultOf(error));
}

/**
 * A read whose answer, when the database will not open, is "nothing"
 * (PLAN.md M158).
 *
 * The stores own their catches — eight of them call `reportDbError` and
 * hydrate empty (M151). A handful of reads have no store above them: they
 * live in `db/` and a component calls them straight, in an effect, as
 * `void read().then(setState)`. `void` satisfies the linter and handles
 * nothing, so on a database that refuses each of those is a rejected promise
 * with no one listening — six of them, found by walking the app under a real
 * `VersionError` rather than by reading the code.
 *
 * Wrapping the *reads* rather than the call sites, for the reason M151 gave
 * for not wrapping twenty-nine writes: a fix applied caller by caller is
 * churn with a missed site at the end of it. And the knowledge belongs here
 * — a count over a database that will not open is not an exception a banner
 * is missing, it is zero, and `DbFaultBanner` is already saying why.
 *
 * Not for writes, and not for anything a climber asked for by name. An
 * import that fails has to say so on the button that started it; this is for
 * the reads a screen does on its own behalf, whose failure the climber did
 * not ask about and cannot act on.
 */
export async function readOr<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    reportDbError(error);
    return fallback;
  }
}

/**
 * The three ways an open ends without an error to catch.
 *
 * Exported because none of them can be *provoked* from a test — a blocked
 * upgrade needs two connections on two schema versions, and a terminated
 * one needs the browser to drop the connection underneath you. Written
 * inline they were three branches nothing could reach, and the battery said
 * so: both survived every mutation. Named here, they are ordinary functions
 * with ordinary tests, and `open` below is the one line that wires them to
 * the events.
 */
export const OPEN_EVENTS = {
  /**
   * Another tab is holding an older version open, so this one's upgrade
   * cannot start. The promise does not settle and does not reject — it
   * simply waits, which is why nothing downstream ever ran and the app sat
   * on its loading state with no explanation.
   */
  blocked(): void {
    setFault('blocked');
  },
  /**
   * The other side of the same fact: this tab holds the old version and
   * something newer wants to upgrade. Letting go is the only way either
   * tab makes progress, and a tab that has let go must not quietly reopen
   * at its own older version — that would block the new one right back. So
   * the connection closes, the cache clears, and the banner asks for the
   * reload that is genuinely needed.
   */
  blocking(connection: unknown): void {
    (connection as { close?: () => void } | null)?.close?.();
    dbPromise = null;
    setFault('blocked');
  },
  terminated(): void {
    dbPromise = null;
    setFault('unavailable');
  },
};

/**
 * `async`, and that is not a formality: `openDB` calls `indexedDB.open`
 * in its own body, so a browser that refuses outright — a locked profile,
 * a private window with storage switched off — **throws synchronously**.
 * A plain function would have thrown past the `.catch` below, leaving
 * `dbPromise` unset and the fault unrecorded, which is the one case this
 * whole module exists for. An async function turns it into a rejection.
 */
async function open(): Promise<IDBPDatabase<AscentDB>> {
  return openDB<AscentDB>(DB_NAME, SCHEMA_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      for (let v = oldVersion + 1; v <= SCHEMA_VERSION; v++) {
        const step = MIGRATIONS[v];
        if (!step) throw new Error(`Missing migration for schema v${v}`);
        step(db, tx);
      }
    },
    blocked: OPEN_EVENTS.blocked,
    blocking: (_current, _blocked, event) => OPEN_EVENTS.blocking(event.target),
    terminated: OPEN_EVENTS.terminated,
  }).then(async (db) => {
    // `appVersion` is what opened it last; `createdWith` is what made it.
    //
    // Only the second can ever differ from the version running, and until
    // M159 only the first existed — written on *every* open, so it was the
    // current version by construction and could not answer the one question
    // it looked like it answered. M154 recorded the symptom (*"a stale
    // install's stored version is indistinguishable from a current one"*)
    // without noticing that the write was the reason.
    await db.put('meta', { key: 'appVersion', value: APP_VERSION });
    const created = await db.get('meta', 'createdAt');
    if (!created) {
      await db.put('meta', { key: 'createdAt', value: new Date().toISOString() });
    }
    // Write-once, like `createdAt` above and for the same reason: a fact
    // about this database's origin, not about this session.
    const createdWith = await db.get('meta', 'createdWith');
    if (!createdWith) {
      await db.put('meta', { key: 'createdWith', value: APP_VERSION });
    }
    setFault(null);
    return db;
  });
}

export function getDb(): Promise<IDBPDatabase<AscentDB>> {
  dbPromise ??= open().catch((error: unknown) => {
    // **A rejection is never memoised.** `dbPromise ??=` kept the failed
    // promise, so one transient refusal at boot — a locked profile, a
    // browser mid-restart — poisoned every read and write for the life of
    // the tab, with no retry and no way back short of a reload.
    dbPromise = null;
    setFault(faultOf(error));
    throw error;
  });
  return dbPromise;
}

/**
 * A write that failed with nobody listening (PLAN.md M151).
 *
 * Forty-eight places open the database and twenty-nine of them write; a
 * full disk rejects the transaction and most of those have no catch, so
 * the climber taps *Mark complete* and nothing happens. Wrapping all of
 * them is churn with a missed one at the end of it — and an unhandled
 * rejection is exactly the signal being described. Only `QuotaExceeded`
 * is claimed here, because that is the only one this can attribute to the
 * database with certainty.
 */
export function watchForFullDisk(target: { addEventListener: Window['addEventListener'] }): void {
  target.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = (event as PromiseRejectionEvent).reason;
    if (faultOf(reason) === 'no-room') setFault('no-room');
  });
}

/** Test hook: forget the cached connection so a fresh DB can be opened. */
export function resetDbForTests(): void {
  dbPromise = null;
  fault = null;
}
