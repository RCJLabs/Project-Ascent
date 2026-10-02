import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBDatabase as FakeIDBDatabase, IDBFactory, IDBObjectStore as FakeIDBObjectStore } from 'fake-indexeddb';
import { APP_VERSION } from '@/version';
import { dbFault, getDb, resetDbForTests } from './db';
import { listSessions, putSession, type Session } from './sessions';

/**
 * The database is handed over before its bookkeeping commits (PLAN.md M361).
 *
 * `open` used to await a write and two reads of `meta` before resolving, so
 * every store's first read at launch queued behind a commit — measured at
 * 180–300ms of every warm launch at a quarter CPU speed, before anything
 * could be read. The bookkeeping is now one transaction, created before the
 * database is handed to anyone and not waited for. These are the three
 * things that has to keep true.
 */

const realTransaction = FakeIDBDatabase.prototype.transaction;
const realPut = FakeIDBObjectStore.prototype.put;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

afterEach(() => {
  FakeIDBDatabase.prototype.transaction = realTransaction;
  FakeIDBObjectStore.prototype.put = realPut;
});

describe('opening the database', () => {
  it('hands it over before the bookkeeping commits', async () => {
    const events: string[] = [];
    let committed: Promise<void> | null = null;
    FakeIDBDatabase.prototype.transaction = function (this: IDBDatabase, names: string | string[], mode?: IDBTransactionMode) {
      const tx = (realTransaction as (...a: unknown[]) => IDBTransaction).call(this, names, mode);
      if (mode === 'readwrite' && String(names) === 'meta' && committed === null) {
        events.push('bookkeeping begun');
        committed = new Promise((resolve) =>
          tx.addEventListener('complete', () => {
            events.push('bookkeeping committed');
            resolve();
          }),
        );
      }
      return tx;
    } as typeof realTransaction;

    await getDb();
    events.push('handed over');
    expect(committed, 'no bookkeeping transaction was begun').not.toBeNull();
    await committed;

    expect(events).toEqual(['bookkeeping begun', 'handed over', 'bookkeeping committed']);
  });

  it('still lets the first read of the versions see them written', async () => {
    // A fresh database, so nothing is there but what this open wrote — and
    // a read of `meta` created after the open must wait for that write.
    // The ordering IndexedDB gives is the whole reason the wait could go.
    const db = await getDb();
    expect((await db.get('meta', 'appVersion'))?.value).toBe(APP_VERSION);
    expect((await db.get('meta', 'createdWith'))?.value).toBe(APP_VERSION);
    expect((await db.get('meta', 'createdAt'))?.value).toEqual(expect.any(String));
  });

  it('says so when the bookkeeping fails, and leaves the database usable', async () => {
    let armed = true;
    FakeIDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: unknown[]) {
      if (armed && this.name === 'meta') {
        armed = false;
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      }
      return (realPut as (...a: unknown[]) => IDBRequest).apply(this, args);
    } as typeof realPut;

    await expect(getDb()).resolves.toBeTruthy();
    await vi.waitFor(() => expect(dbFault()).toBe('no-room'));

    // Before M361 a failed bookkeeping write rejected the open, and with it
    // every read in the app. A full disk is a reason writes fail, not reads.
    await putSession({
      id: '2026-09-01#0',
      date: '2026-09-01',
      planned: false,
      completed: true,
      rewarded: false,
      mode: 'indoor',
      durationMin: 60,
      warmup: true,
      drillDone: false,
      createdAt: '2026-09-01T18:00:00.000Z',
      updatedAt: '2026-09-01T18:00:00.000Z',
    } as Session);
    expect(await listSessions()).toHaveLength(1);
  });
});
