import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  OPEN_EVENTS,
  dbFault,
  faultOf,
  getDb,
  reportDbError,
  resetDbForTests,
  watchDbFault,
  watchForFullDisk,
} from './db';

/**
 * Telling *no data* from *cannot read the data* (PLAN.md M151).
 *
 * Every refusal used to arrive at one appearance: an app with nothing in
 * it, indistinguishable from a fresh install.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

/** An error as IndexedDB actually raises it: named, with a message nobody
 *  should be parsing. */
const named = (name: string): Error => {
  const error = new Error('the browser said something browser-shaped');
  error.name = name;
  return error;
};

describe('what an error out of the database means', () => {
  it('reads a newer schema off the name the spec gives it', () => {
    expect(faultOf(named('VersionError'))).toBe('newer-schema');
  });

  it('reads a full disk the same way', () => {
    expect(faultOf(named('QuotaExceededError'))).toBe('no-room');
  });

  it('calls anything it does not recognise unavailable rather than guessing', () => {
    expect(faultOf(named('InvalidStateError'))).toBe('unavailable');
    expect(faultOf(new Error('nope'))).toBe('unavailable');
    expect(faultOf('a string')).toBe('unavailable');
    expect(faultOf(undefined)).toBe('unavailable');
  });

  it('does not read the message, which is not a contract', () => {
    const misleading = new Error('QuotaExceededError: out of room');
    expect(faultOf(misleading)).toBe('unavailable');
  });
});

describe('the fault, where a screen can see it', () => {
  it('is null when nothing has gone wrong', async () => {
    await getDb();
    expect(dbFault()).toBeNull();
  });

  it('tells a watcher when it changes, and only then', () => {
    const seen = vi.fn();
    const stop = watchDbFault(seen);
    reportDbError(named('VersionError'));
    expect(seen).toHaveBeenCalledTimes(1);
    reportDbError(named('VersionError'));
    expect(seen).toHaveBeenCalledTimes(1);
    reportDbError(named('QuotaExceededError'));
    expect(seen).toHaveBeenCalledTimes(2);
    stop();
    reportDbError(named('InvalidStateError'));
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('clears once the database opens', async () => {
    reportDbError(named('InvalidStateError'));
    expect(dbFault()).toBe('unavailable');
    await getDb();
    expect(dbFault()).toBeNull();
  });
});

/**
 * `dbPromise ??= openDB(...)` kept the *failed* promise, so one refusal at
 * boot poisoned every read and write for the life of the tab.
 */
describe('a refusal that is not forever', () => {
  it('retries the next time something asks', async () => {
    const real = globalThis.indexedDB;
    let calls = 0;
    globalThis.indexedDB = {
      ...real,
      open: (...args: unknown[]) => {
        calls += 1;
        if (calls === 1) throw named('InvalidStateError');
        return (real.open as (...a: never[]) => IDBOpenDBRequest)(...(args as never[]));
      },
    } as unknown as IDBFactory;

    await expect(getDb()).rejects.toBeTruthy();
    expect(dbFault()).toBe('unavailable');

    // The same stub, which refuses once and then behaves — so the retry is
    // counted rather than hidden behind a swapped-back global.
    await expect(getDb()).resolves.toBeTruthy();
    expect(dbFault()).toBeNull();
    expect(calls).toBe(2);
    globalThis.indexedDB = real;
  });

  it('keeps a connection that worked', async () => {
    const first = await getDb();
    expect(await getDb()).toBe(first);
  });
});

describe('a write that failed with nobody listening', () => {
  /** A stand-in for `window`, so the listener can be fired on demand. */
  function target() {
    let fire: ((event: unknown) => void) | null = null;
    watchForFullDisk({
      addEventListener: ((_type: string, fn: (e: unknown) => void) => {
        fire = fn;
      }) as never,
    });
    return (reason: unknown) => fire?.({ reason });
  }

  it('reports a full disk it had no catch for', () => {
    const reject = target();
    reject(named('QuotaExceededError'));
    expect(dbFault()).toBe('no-room');
  });

  it('claims nothing else, because it cannot know', () => {
    const reject = target();
    reject(named('TypeError'));
    reject(new Error('a failed fetch, say'));
    expect(dbFault()).toBeNull();
  });
});

/**
 * The three ways an open ends without an error to catch.
 *
 * None can be provoked here — a blocked upgrade wants two connections on
 * two schema versions and a terminated one wants the browser to drop the
 * connection underneath you. Written inline they were branches nothing
 * could reach, and both survived the battery; named, they are functions.
 */
describe('an open that ends without throwing', () => {
  it('says which tab is in the way rather than saying nothing', () => {
    OPEN_EVENTS.blocked();
    expect(dbFault()).toBe('blocked');
  });

  it('lets go when something newer wants to upgrade', () => {
    const close = vi.fn();
    OPEN_EVENTS.blocking({ close });
    expect(close).toHaveBeenCalledTimes(1);
    expect(dbFault()).toBe('blocked');
  });

  it('survives an event with no connection on it', () => {
    expect(() => OPEN_EVENTS.blocking(null)).not.toThrow();
    expect(dbFault()).toBe('blocked');
  });

  it('does not quietly reopen at its own older version', async () => {
    const first = await getDb();
    OPEN_EVENTS.blocking({ close: () => {} });
    // The cache is cleared, so the next ask is a fresh open rather than the
    // connection this tab was told to give up.
    expect(await getDb()).not.toBe(first);
  });

  it('reports a connection the browser dropped', async () => {
    await getDb();
    OPEN_EVENTS.terminated();
    expect(dbFault()).toBe('unavailable');
  });
});

describe('a store that could not read', () => {
  it('keeps the reason instead of reporting an empty app', async () => {
    const { useSessions } = await import('@/store/sessions');
    const real = globalThis.indexedDB;
    globalThis.indexedDB = {
      ...real,
      open: () => {
        throw named('VersionError');
      },
    } as unknown as IDBFactory;
    resetDbForTests();

    await useSessions.getState().load();
    // Hydrated, because the app still has to render — and the reason is on
    // the record, so the shell can say why the log is empty.
    expect(useSessions.getState().hydrated).toBe(true);
    expect(dbFault()).toBe('newer-schema');
    globalThis.indexedDB = real;
  });
});
