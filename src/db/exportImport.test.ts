import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from './db';
import {
  BACKUP_ENTRY,
  exportAll,
  exportArchive,
  hasRealData,
  importAll,
  parseExportFile,
  readBackupFile,
  type ExportFile,
} from './exportImport';
import { unzip, zip } from '@/lib/zip';
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
  it('carries photos through the archive and back', async () => {
    await seedPhoto('project:p1', 'the crux');
    const { bytes, file } = await exportArchive();
    expect(file.media).toHaveLength(1);
    expect(file.media![0]!.caption).toBe('the crux');
    // The point of the whole milestone: the picture is a file, not a string.
    expect(file.media![0]!.file).toMatch(/^media\/.+\.webp$/);
    expect(file.media![0]!.data).toBeUndefined();

    // Reading it back the way the import screen does, on a fresh install.
    const backup = readBackupFile(bytes);
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await importAll(backup.file, 'replace', { blobs: backup.blobs });

    const { listMedia } = await import('./media');
    const restored = await listMedia('project:p1');
    expect(restored).toHaveLength(1);
    expect(restored[0]!.caption).toBe('the crux');
    expect(restored[0]!.width).toBe(800);
    expect(restored[0]!.type).toBe('image/webp');
    expect(new Uint8Array(await restored[0]!.blob.arrayBuffer())).toEqual(png);
  });

  it('puts the records in backup.json and the pictures beside it', async () => {
    await seedPhoto('project:p1', 'a');
    await seedPhoto('project:p1', 'b');
    const { bytes } = await exportArchive();
    const names = unzip(bytes).map((e) => e.name);
    expect(names[0]).toBe(BACKUP_ENTRY);
    expect(names.filter((n) => n.startsWith('media/'))).toHaveLength(2);
    // Distinct names, or one photo would overwrite the other.
    expect(new Set(names).size).toBe(names.length);
  });

  // The measurement this milestone exists for: base64 cost a third, and a
  // third of a phone's photo library is the difference between a backup and
  // a crash. Stored bytes go in at their own size.
  it('does not inflate the pictures', async () => {
    const big = new Uint8Array(200_000);
    for (let i = 0; i < big.length; i += 1) big[i] = i % 251;
    const db = await getDb();
    await db.put('media', {
      id: 'm-big',
      ownerId: 'project:p1',
      blob: new Blob([big], { type: 'image/jpeg' }),
      type: 'image/jpeg',
      width: 1600,
      height: 1200,
      createdAt: '2026-03-01T10:00:00.000Z',
    });
    const { bytes } = await exportArchive();
    const records = (await exportArchive({ media: false })).bytes.length;
    expect(bytes.length).toBeLessThan(records + big.length + 500);
  });

  // Two ids that are different records but the same file name once the
  // unsafe characters are gone. One overwriting the other would lose a photo
  // and hand back the wrong one.
  it('keeps two photos apart when their names would collide', async () => {
    const db = await getDb();
    for (const id of ['a/b', 'a?b', 'a b']) {
      await db.put('media', {
        id,
        ownerId: 'project:p1',
        blob: new Blob([png], { type: 'image/webp' }),
        type: 'image/webp',
        width: 8,
        height: 8,
        createdAt: '2026-03-01T10:00:00.000Z',
      });
    }
    const { bytes, file } = await exportArchive();
    const names = unzip(bytes).map((e) => e.name);
    expect(new Set(names).size).toBe(4);
    expect(new Set(file.media!.map((m) => m.file)).size).toBe(3);

    const backup = readBackupFile(bytes);
    expect(backup.photosMissing).toBe(0);
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await importAll(backup.file, 'replace', { blobs: backup.blobs });
    const { listMedia } = await import('./media');
    expect((await listMedia('project:p1')).map((m) => m.id).sort()).toEqual(['a b', 'a/b', 'a?b']);
  });

  it('names a photo after its record without trusting the name', async () => {
    const db = await getDb();
    await db.put('media', {
      id: '../../backup.json',
      ownerId: 'project:p1',
      blob: new Blob([png], { type: 'image/webp' }),
      type: 'image/webp',
      width: 8,
      height: 8,
      createdAt: '2026-03-01T10:00:00.000Z',
    });
    const { bytes } = await exportArchive();
    const names = unzip(bytes).map((e) => e.name);
    expect(names).toEqual([BACKUP_ENTRY, 'media/.._.._backup.json.webp']);
    // And it still comes back, under the id it actually has.
    const backup = readBackupFile(bytes);
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await importAll(backup.file, 'replace', { blobs: backup.blobs });
    const { listMedia } = await import('./media');
    expect((await listMedia('project:p1'))[0]!.id).toBe('../../backup.json');
  });

  // The session card says photos "go into a backup with everything else".
  // A promise printed on a screen is not a check (PLAN.md M30).
  it('carries a session\u2019s photos too, not just a project\u2019s', async () => {
    const db = await getDb();
    await db.put('sessions', { id: '2026-03-01#0', date: '2026-03-01' } as never);
    await seedPhoto('session:2026-03-01#0', 'the board I set');
    const { bytes } = await exportArchive();

    const backup = readBackupFile(bytes);
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await importAll(backup.file, 'replace', { blobs: backup.blobs });

    const { listMedia, sweepOrphanMedia } = await import('./media');
    const restored = await listMedia('session:2026-03-01#0');
    expect(restored).toHaveLength(1);
    expect(restored[0]!.caption).toBe('the board I set');
    // And the session came back with it, so the sweep does not eat them.
    expect(await sweepOrphanMedia()).toBe(0);
    expect(await listMedia('session:2026-03-01#0')).toHaveLength(1);
  });

  it('leaves photos out when asked, without touching anything else', async () => {
    const db = await getDb();
    await db.put('sessions', { id: '2026-03-01#0', date: '2026-03-01' });
    await seedPhoto();
    const { file, bytes } = await exportArchive({ media: false });
    expect(file.media).toBeUndefined();
    expect(file.data.sessions).toHaveLength(1);
    expect(unzip(bytes).map((e) => e.name)).toEqual([BACKUP_ENTRY]);
  });

  // Half a restore is worse than either half.
  it('clears existing photos on a replace that carries none', async () => {
    await seedPhoto('project:p1', 'old');
    const empty = await exportAll();
    await importAll(empty, 'replace');
    const { listMedia } = await import('./media');
    expect(await listMedia('project:p1')).toEqual([]);
  });

  it('keeps existing photos on a merge', async () => {
    await seedPhoto('project:p1', 'kept');
    const empty = await exportAll();
    await importAll(empty, 'merge');
    const { listMedia } = await import('./media');
    expect(await listMedia('project:p1')).toHaveLength(1);
  });
});

/**
 * Every backup written before M53 is a bare JSON file with its photos
 * base64'd inside it, and every one of them is somebody's only copy. The
 * app stopped writing them; it never stops reading them.
 */
describe('a backup from before the archive', () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

  function legacy(media?: unknown[]): Uint8Array {
    const file = {
      app: 'project-ascent',
      schemaVersion: SCHEMA_VERSION,
      appVersion: '0.9.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      data: { sessions: [{ id: '2026-01-01#0', date: '2026-01-01', rpe: 6 }] },
      ...(media ? { media } : {}),
    };
    return new TextEncoder().encode(JSON.stringify(file));
  }

  const inline = {
    id: 'm-old',
    ownerId: 'project:p1',
    type: 'image/webp',
    width: 800,
    height: 600,
    caption: 'from the old format',
    createdAt: '2026-01-01T00:00:00.000Z',
    data: `data:image/webp;base64,${btoa(String.fromCharCode(...png))}`,
  };

  it('reads its records', () => {
    const backup = readBackupFile(legacy());
    expect(backup.file.data.sessions).toHaveLength(1);
    expect(backup.blobs.size).toBe(0);
    expect(backup.photosMissing).toBe(0);
  });

  it('restores its photos, base64 and all', async () => {
    const backup = readBackupFile(legacy([inline]));
    await importAll(backup.file, 'replace', { blobs: backup.blobs });
    const { listMedia } = await import('./media');
    const restored = await listMedia('project:p1');
    expect(restored).toHaveLength(1);
    expect(restored[0]!.caption).toBe('from the old format');
    expect(new Uint8Array(await restored[0]!.blob.arrayBuffer())).toEqual(png);
  });

  it('counts a photo the old file described but did not carry', () => {
    const { data: _data, ...noBytes } = inline;
    const backup = readBackupFile(legacy([inline, noBytes]));
    expect(backup.photosMissing).toBe(1);
    expect(backup.file.media).toHaveLength(1);
  });

  it('still refuses a file that is not a backup at all', () => {
    expect(() => readBackupFile(new TextEncoder().encode('{}'))).toThrow(/not a project ascent/i);
    expect(() => readBackupFile(new TextEncoder().encode('nonsense'))).toThrow(/unreadable/i);
  });
});

describe('an archive that is not right', () => {
  const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
  const file = (media?: unknown[]): ExportFile =>
    ({
      app: 'project-ascent',
      schemaVersion: SCHEMA_VERSION,
      appVersion: '1.0.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      data: { sessions: [] },
      ...(media ? { media } : {}),
    }) as unknown as ExportFile;

  it('refuses an archive with no records in it', () => {
    const bytes = zip([{ name: 'media/m-1.webp', bytes: new Uint8Array([1, 2]) }]);
    expect(() => readBackupFile(bytes)).toThrow(/no backup\.json/i);
  });

  // A photo named in the records but absent from the archive is counted, not
  // guessed at — so the preview a climber reads and the import they confirm
  // are talking about the same photos.
  it('counts photos the archive does not contain', async () => {
    const described = {
      id: 'm-1',
      ownerId: 'project:p1',
      type: 'image/webp',
      width: 8,
      height: 8,
      createdAt: '2026-01-01T00:00:00.000Z',
      file: 'media/m-1.webp',
    };
    const bytes = zip([{ name: BACKUP_ENTRY, bytes: enc(file([described, { ...described, id: 'm-2', file: 'media/gone.webp' }])) }, { name: 'media/m-1.webp', bytes: new Uint8Array([1, 2]) }]);
    const backup = readBackupFile(bytes);
    expect(backup.photosMissing).toBe(1);
    expect(backup.file.media).toHaveLength(1);

    await importAll(backup.file, 'replace', { blobs: backup.blobs });
    const { listMedia } = await import('./media');
    expect(await listMedia('project:p1')).toHaveLength(1);
  });

  it('ignores files in the archive that the records do not name', () => {
    const bytes = zip([
      { name: BACKUP_ENTRY, bytes: enc(file()) },
      { name: 'media/stray.webp', bytes: new Uint8Array([1, 2]) },
      { name: 'notes.txt', bytes: new Uint8Array([3]) },
    ]);
    const backup = readBackupFile(bytes);
    expect(backup.file.media).toBeUndefined();
    expect(backup.photosMissing).toBe(0);
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
