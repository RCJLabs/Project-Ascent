import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from './db';
import { exportAll, importAll, parseExportFile } from './exportImport';
import { SNAPSHOT_KEY } from './schema';
import { clearSnapshot, readSnapshot, restoreSnapshot, takeSnapshot } from './snapshot';

/**
 * Undo has to be real, not a claim (PLAN.md M20).
 *
 * These run against fake-indexeddb, so they exercise the same code paths a
 * device does — a snapshot that only works in principle is worth nothing to
 * a climber who has just replaced a year of logs.
 */

const session = (date: string) => ({
  id: `${date}#0`,
  date,
  completed: true,
  climbs: [],
});

async function seed(dates: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('sessions', 'readwrite');
  for (const date of dates) await tx.store.put(session(date));
  await tx.done;
}

async function sessionDates(): Promise<string[]> {
  const db = await getDb();
  return (await db.getAll('sessions')).map((s) => s.date).sort();
}

beforeEach(() => {
  // A fresh database per test: resetDbForTests only forgets the cached
  // connection, so without this the data from the previous test is still
  // there and every count is wrong.
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('taking a snapshot', () => {
  it('remembers what was there', async () => {
    await seed(['2026-01-01', '2026-01-03']);
    await takeSnapshot('a backup from 2026-06-01');

    const snapshot = await readSnapshot();
    expect(snapshot?.replacedWith).toBe('a backup from 2026-06-01');
    expect(snapshot?.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('reports nothing when none was taken', async () => {
    expect(await readSnapshot()).toBeNull();
  });
});

describe('undoing an import', () => {
  it('puts back what a replace removed', async () => {
    await seed(['2026-01-01', '2026-01-03', '2026-01-05']);
    await takeSnapshot('someone else’s backup');

    const incoming = await exportAll({ media: false });
    incoming.data.sessions = [session('2020-09-09')];
    await importAll(incoming, 'replace');
    expect(await sessionDates()).toEqual(['2020-09-09']);

    expect(await restoreSnapshot()).toBe(true);
    expect(await sessionDates()).toEqual(['2026-01-01', '2026-01-03', '2026-01-05']);
  });

  it('removes what the import added', async () => {
    // A merge that brought in someone else's sessions has to be undoable
    // too, not just a replace.
    await seed(['2026-01-01']);
    await takeSnapshot('a merge');

    const incoming = await exportAll({ media: false });
    incoming.data.sessions = [session('2019-01-01'), session('2019-01-02')];
    await importAll(incoming, 'merge');
    expect(await sessionDates()).toHaveLength(3);

    await restoreSnapshot();
    expect(await sessionDates()).toEqual(['2026-01-01']);
  });

  it('is offered once', async () => {
    // Restoring twice would undo an undo, which is not what the button says.
    await seed(['2026-01-01']);
    await takeSnapshot('x');
    expect(await restoreSnapshot()).toBe(true);
    expect(await readSnapshot()).toBeNull();
    expect(await restoreSnapshot()).toBe(false);
  });

  it('survives the import it is protecting against', async () => {
    // The snapshot lives in `meta`, which a replace clears. If the import
    // took the snapshot with it, undo would be gone exactly when needed.
    await seed(['2026-01-01', '2026-01-03']);
    const db = await getDb();
    await db.put('meta', { key: 'something-else', value: 1 });
    await takeSnapshot('a replace');

    const incoming = await exportAll({ media: false });
    incoming.data.sessions = [];
    incoming.data.meta = [];
    await importAll(incoming, 'replace');

    expect(await db.get('meta', 'something-else')).toBeUndefined();
    expect(await readSnapshot()).not.toBeNull();
    expect(await restoreSnapshot()).toBe(true);
    expect(await sessionDates()).toEqual(['2026-01-01', '2026-01-03']);
  });

  it('cannot be overwritten by the file being imported', async () => {
    // Otherwise a backup could hand a climber someone else's undo history,
    // or a crafted one could destroy their way back.
    await seed(['2026-01-01']);
    await takeSnapshot('mine');

    const incoming = await exportAll({ media: false });
    incoming.data.meta = [{ key: SNAPSHOT_KEY, value: { takenAt: 'forged', file: null } }];
    await importAll(incoming, 'merge');

    expect((await readSnapshot())?.replacedWith).toBe('mine');
  });

  it('can be thrown away', async () => {
    await seed(['2026-01-01']);
    await takeSnapshot('x');
    await clearSnapshot();
    expect(await readSnapshot()).toBeNull();
  });
});

describe('a snapshot never reaches a backup', () => {
  it('is left out of an export', async () => {
    await seed(['2026-01-01']);
    await takeSnapshot('x');

    const file = await exportAll({ media: false });
    const keys = (file.data.meta as { key: string }[]).map((r) => r.key);
    expect(keys).not.toContain(SNAPSHOT_KEY);
  });

  it('survives a round trip through the file format', async () => {
    await seed(['2026-01-01']);
    await takeSnapshot('x');
    const text = JSON.stringify(await exportAll({ media: false }));
    const parsed = parseExportFile(text);
    expect((parsed.data.meta as { key: string }[]).map((r) => r.key)).not.toContain(SNAPSHOT_KEY);
  });
});
