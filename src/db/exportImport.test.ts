import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from './db';
import { exportAll, hasRealData, importAll, parseExportFile } from './exportImport';
import { SCHEMA_VERSION } from './schema';

beforeEach(() => {
  // Fresh database per test.
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('storage round-trip', () => {
  it('creates the schema and reports no real data when empty', async () => {
    const db = await getDb();
    expect([...db.objectStoreNames].sort()).toEqual(
      ['game', 'media', 'meta', 'metrics', 'profile', 'programs', 'projects', 'sessions'].sort(),
    );
    expect(await hasRealData()).toBe(false);
  });

  it('round-trips data through export and import (replace)', async () => {
    const db = await getDb();
    await db.put('sessions', { id: '2026-09-09#0', date: '2026-09-09', rpe: 7 });
    await db.put('metrics', { metricId: 'max_hang_20mm', date: '2026-09-09', value: 32 });
    await db.put('profile', { key: 'settings', value: { theme: 'dark' } });
    expect(await hasRealData()).toBe(true);

    const file = await exportAll();
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(file.data.sessions).toHaveLength(1);

    // Simulate a fresh install, then import the backup.
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    expect(await hasRealData()).toBe(false);

    await importAll(file, 'replace');
    const db2 = await getDb();
    expect(await db2.get('sessions', '2026-09-09#0')).toMatchObject({ rpe: 7 });
    expect(await db2.get('metrics', ['max_hang_20mm', '2026-09-09'])).toMatchObject({ value: 32 });
    expect(await db2.get('profile', 'settings')).toMatchObject({ value: { theme: 'dark' } });
  });

  it('merge keeps existing records not present in the backup', async () => {
    const db = await getDb();
    await db.put('sessions', { id: '2026-09-01#0', date: '2026-09-01' });
    const file = await exportAll();

    await db.put('sessions', { id: '2026-09-02#0', date: '2026-09-02' });
    await importAll(file, 'merge');
    expect(await db.count('sessions')).toBe(2);

    await importAll(file, 'replace');
    expect(await db.count('sessions')).toBe(1);
  });

  it('rejects foreign and future-schema files', () => {
    expect(() => parseExportFile('not json')).toThrow(/unreadable/i);
    expect(() => parseExportFile(JSON.stringify({ app: 'other' }))).toThrow(/not a project ascent/i);
    expect(() =>
      parseExportFile(
        JSON.stringify({ app: 'project-ascent', schemaVersion: SCHEMA_VERSION + 1, data: {} }),
      ),
    ).toThrow(/newer app version/i);
  });
});
