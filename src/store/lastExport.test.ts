import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { dbFault, getDb, resetDbForTests } from '@/db/db';
import { daysBetween } from '@/engine/dates';

/**
 * "NaN days since your last backup" (PLAN.md M159).
 *
 * M148's browser check printed that against a hand-seeded profile whose
 * `lastExportAt` was an ISO timestamp. The app only ever writes `today()`,
 * so nothing it does on its own reaches this — but a restored backup is
 * whatever was in the file, and `hydrateProfile` took the key unchecked two
 * lines under a sibling that filters `dismissedCards` for type.
 *
 * The coach then does `daysBetween(lastExportAt, today)` and prints the
 * number, so a malformed key became a sentence a climber could read.
 */

const KEY = 'active-plan';

async function hydrateWith(lastExportAt: unknown): Promise<string | null> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  const db = await getDb();
  await db.put('profile', { key: KEY, value: { lastExportAt } });
  const { useProfile, hydrateProfile } = await import('./profile');
  await hydrateProfile();
  return useProfile.getState().lastExportAt;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('a backup date out of a file', () => {
  it('keeps a real day key', async () => {
    expect(await hydrateWith('2026-03-09')).toBe('2026-03-09');
  });

  it.each([
    ['an ISO timestamp', '2026-03-09T11:04:00.000Z'],
    ['an unpadded key', '2026-3-9'],
    ['an overflowed date', '2026-13-45'],
    ['prose', 'never'],
    ['the empty string', ''],
    ['a number', 1_772_000_000_000],
    ['an object', { when: '2026-03-09' }],
    ['null', null],
    // The one that makes the `typeof` half of the guard load-bearing rather
    // than a formality for the type checker. `isDateKey` coerces its
    // argument for the shape regex and then calls `.split` on it, so an
    // array of one key passes the regex and **throws** — which M151's catch
    // would turn into a whole profile hydrating empty behind a "cannot open
    // storage" banner, over a malformed date field. The battery found it by
    // dropping the `typeof` check and watching every other row still agree.
    // (An object with a `toString` would do the same, but a function cannot
    // be structured-cloned into IndexedDB, so it can never get this far.)
    ['a one-element array', ['2026-03-09']],
  ])('drops %s', async (_label, value) => {
    expect(await hydrateWith(value)).toBeNull();
  });

  /**
   * The failure as the climber met it, so the guard is tied to the symptom
   * rather than to the shape of the input.
   */
  it('is what stood between a bad key and "NaN days"', () => {
    expect(Number.isNaN(daysBetween('2026-03-09T11:04:00.000Z', '2026-03-20'))).toBe(true);
    expect(daysBetween('2026-03-09', '2026-03-20')).toBe(11);
  });

  it('leaves a profile that never exported saying never, not zero', async () => {
    expect(await hydrateWith(undefined)).toBeNull();
  });

  it('hydrates the rest of the profile rather than failing on the bad key', async () => {
    // The point of dropping it quietly: one unusable field in a restored
    // backup must not cost the climber the profile it sat in.
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    const db = await getDb();
    await db.put('profile', {
      key: KEY,
      value: { lastExportAt: ['2026-03-09'], equipment: ['wall', 'hangboard'] },
    });
    const { useProfile, hydrateProfile } = await import('./profile');
    await hydrateProfile();
    expect(useProfile.getState().lastExportAt).toBeNull();
    expect(useProfile.getState().equipment).toEqual(['wall', 'hangboard']);
    expect(useProfile.getState().hydrated).toBe(true);
    expect(dbFault()).toBeNull();
  });
});
