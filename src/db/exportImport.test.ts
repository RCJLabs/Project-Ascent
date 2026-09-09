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

describe('photos', () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const blob = () => new Blob([png], { type: 'image/webp' });

  async function seedPhoto(ownerId = 'project:p1', caption?: string) {
    const db = await getDb();
    const record = {
      id: `m-${ownerId}-${caption ?? 'x'}`,
      ownerId,
      blob: blob(),
      type: 'image/webp',
      width: 800,
      height: 600,
      ...(caption ? { caption } : {}),
      createdAt: '2026-03-01T10:00:00.000Z',
    };
    await db.put('media', record);
    return record;
  }

  it('counts a photo as real data worth warning about', async () => {
    expect(await hasRealData()).toBe(false);
    await seedPhoto();
    expect(await hasRealData()).toBe(true);
  });

  it('finds photos by owner and not by anyone else', async () => {
    await seedPhoto('project:p1', 'crux');
    await seedPhoto('project:p2', 'line');
    const { listMedia } = await import('./media');
    expect(await listMedia('project:p1')).toHaveLength(1);
    expect((await listMedia('project:p1'))[0]!.caption).toBe('crux');
    expect(await listMedia('project:nope')).toEqual([]);
  });

  it('deletes an owner’s photos together', async () => {
    await seedPhoto('project:p1', 'a');
    await seedPhoto('project:p1', 'b');
    await seedPhoto('project:p2', 'c');
    const { deleteMediaFor, listMedia } = await import('./media');
    expect(await deleteMediaFor('project:p1')).toBe(2);
    expect(await listMedia('project:p1')).toEqual([]);
    expect(await listMedia('project:p2')).toHaveLength(1);
  });

  // A backup that silently drops your photos is a backup that lies.
  it('carries photos through export and back', async () => {
    await seedPhoto('project:p1', 'the crux');
    const file = await exportAll();
    expect(file.media).toHaveLength(1);
    expect(file.media![0]!.data).toMatch(/^data:image\/webp;base64,/);
    expect(file.media![0]!.caption).toBe('the crux');

    // A round-trip through JSON is what a real backup goes through.
    const reloaded = parseExportFile(JSON.stringify(file));
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await importAll(reloaded, 'replace');

    const { listMedia } = await import('./media');
    const restored = await listMedia('project:p1');
    expect(restored).toHaveLength(1);
    expect(restored[0]!.caption).toBe('the crux');
    expect(restored[0]!.width).toBe(800);
    expect(await restored[0]!.blob.arrayBuffer()).toEqual(png.buffer);
  });

  it('leaves photos out when asked, without touching anything else', async () => {
    const db = await getDb();
    await db.put('sessions', { id: '2026-03-01#0', date: '2026-03-01' });
    await seedPhoto();
    const file = await exportAll({ media: false });
    expect(file.media).toBeUndefined();
    expect(file.data.sessions).toHaveLength(1);
  });

  // Half a restore is worse than either half.
  it('clears existing photos on a replace that carries none', async () => {
    await seedPhoto('project:p1', 'old');
    const empty = await exportAll({ media: false });
    await importAll(empty, 'replace');
    const { listMedia } = await import('./media');
    expect(await listMedia('project:p1')).toEqual([]);
  });

  it('keeps existing photos on a merge', async () => {
    await seedPhoto('project:p1', 'kept');
    const empty = await exportAll({ media: false });
    await importAll(empty, 'merge');
    const { listMedia } = await import('./media');
    expect(await listMedia('project:p1')).toHaveLength(1);
  });
});

describe('the v1 to v2 upgrade', () => {
  // The first migration this framework has ever run. An install sitting on
  // v1 opens a database whose media store has no by-owner index, and every
  // photo query would throw.
  it('adds the by-owner index to an existing v1 database', async () => {
    const { openDB } = await import('idb');
    // Build v1 exactly as the original migration did.
    const v1 = await openDB('project-ascent', 1, {
      upgrade(db) {
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
    });
    await v1.put('sessions', { id: '2026-03-01#0', date: '2026-03-01' } as never);
    expect([...v1.transaction('media').store.indexNames]).toEqual([]);
    v1.close();

    // Opening through the app's own path must upgrade it in place.
    resetDbForTests();
    const db = await getDb();
    expect(db.version).toBe(SCHEMA_VERSION);
    expect([...db.transaction('media').store.indexNames]).toEqual(['by-owner']);
    // And the data that was already there survives.
    expect(await db.get('sessions', '2026-03-01#0')).toBeDefined();
  });
});
