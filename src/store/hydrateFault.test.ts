import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { dbFault, resetDbForTests } from '@/db/db';

/**
 * A read that failed on a database that opened fine (PLAN.md M151).
 *
 * `getDb` classifies an open that refuses, and for the common failures that
 * is the whole story. This is the other half: the connection is good, the
 * store's read throws anyway — a transaction the browser aborted, a record
 * the shape check rejects — and the store catches it, sets `hydrated: true`
 * and renders an app with nothing in it. That is the lie the catch used to
 * tell, and the reason is what it keeps now.
 */

vi.mock('@/db/sessions', async () => {
  const actual = await vi.importActual<typeof import('@/db/sessions')>('@/db/sessions');
  return {
    ...actual,
    listSessions: () => {
      const error = new Error('the transaction was aborted');
      error.name = 'QuotaExceededError';
      return Promise.reject(error);
    },
  };
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('a store whose read threw', () => {
  it('renders, and says why there is nothing to render', async () => {
    const { useSessions } = await import('@/store/sessions');
    await useSessions.getState().load();
    // Hydrated, because the app has to draw something.
    expect(useSessions.getState().hydrated).toBe(true);
    expect(useSessions.getState().byDate).toEqual({});
    // And not a fresh install: the reason survived the catch.
    expect(dbFault()).toBe('no-room');
  });
});
