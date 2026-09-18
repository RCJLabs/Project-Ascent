import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import type { Mark } from '@/lib/marks';
import { getDb, resetDbForTests } from './db';
import { exportArchive, importAll, readBackupFile } from './exportImport';

/**
 * Every field a record has comes back out (PLAN.md M272).
 *
 * `exportImport.test.ts` round-trips a session carrying three of its thirty
 * fields and checks one of them with `toMatchObject`, which is a **subset**
 * match: it cannot fail when a field is dropped. `partnersSurvive.test.ts`
 * exists because one was, and was noticed by hand. A whole file for one
 * field is what gets written when the general test cannot see the class.
 *
 * So this one seeds every field of every record with a value it can be
 * told apart by, and compares the whole row back — and the fixture is
 * checked against the interface in the source, so a field added next year
 * fails here until it is covered rather than quietly riding along untested.
 *
 * The stakes are the app's own: *"Everything lives on this device and
 * nowhere else. A cleared browser, a lost phone or a reinstalled app takes
 * the lot with it, and there is no account to restore from."* A dropped
 * field is not a wrong sentence on a card, it is history gone.
 */

/** The top-level field names an interface declares, read from the source. */
function fieldsOf(file: string, name: string): string[] {
  const source = readFileSync(file, 'utf8');
  const at = source.indexOf(`export interface ${name}`);
  expect(at, `${name} is declared in ${file}`).toBeGreaterThan(-1);
  const body = source.slice(source.indexOf('{', at) + 1);
  let depth = 1;
  let end = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1;
    else if (body[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  // Nested object literals flattened, so only the outer fields match.
  const flat = body.slice(0, end).replace(/\{[^{}]*\}/g, '{}');
  return [...flat.matchAll(/^ {2}(\w+)\??\s*:/gm)].map((m) => m[1]!);
}

const MARKS: Mark[] = [{ kind: 'line', color: 'red', points: [0.1, 0.2, 0.3, 0.4] }];

/** One of everything, with every field filled in. */
const SESSION = {
  id: '2026-09-09#0',
  date: '2026-09-09',
  programId: 'iron_grip',
  sessionTypeId: 'fp',
  trackId: 'board',
  planned: true,
  completed: true,
  rewarded: true,
  // The session type decides this on the way in — see the test below.
  mode: 'indoor',
  rpe: 7,
  durationMin: 61,
  warmup: true,
  drillId: 'tlg_arc_2x10',
  drillDone: true,
  exercises: [{ name: 'Max Hangs', sets: 4, reps: '7s' }],
  completedExercises: ['Max Hangs'],
  climbs: [{ id: 'c1', grade: 'V4', scale: 'V', count: 2, result: 'send', ropeStyle: 'lead' }],
  fields: { location: 'One Crag', sessionVolume: 12 },
  checkIn: { sleep: 'well', fingers: 'fine' },
  projectAttempts: [{ projectId: 'p1', attempts: 3, highPoint: 'the crux' }],
  restChecklist: { mobility: true },
  notes: 'One note.',
  partners: ['Sam'],
  deload: true,
  imported: 'a-spreadsheet.csv',
  demo: true,
  startedAt: '2026-09-09T18:04:00.000Z',
  endedAt: '2026-09-09T19:05:00.000Z',
  createdAt: '2026-09-09T18:00:00.000Z',
  updatedAt: '2026-09-09T19:06:00.000Z',
};

const PROJECT = {
  id: 'p1',
  name: 'The Nose of It',
  grade: 'V6',
  scale: 'V',
  setting: 'outdoor',
  location: 'One Crag',
  status: 'sent',
  beta: [{ id: 'b1', text: 'heel hook the arête', date: '2026-09-01' }],
  sentDate: '2026-09-08',
  sendAppliedFrom: '2026-09-08',
  demo: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};

const METRIC = {
  metricId: 'max_hang_20mm',
  date: '2026-09-09',
  value: 32.5,
  display: 'kg',
  note: 'half crimp, 20mm',
  demo: true,
};

const MEDIA = {
  id: 'm1',
  ownerId: 'project:p1',
  blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' }),
  type: 'image/webp',
  width: 1600,
  height: 900,
  caption: 'the crux from below',
  marks: MARKS,
  createdAt: '2026-09-09T19:10:00.000Z',
};

/** The keyed stores, whose value is whatever the app put under the key. */
const KEYED = {
  profile: [
    { key: 'active-plan', value: { activeProgramId: 'iron_grip', startDates: { iron_grip: '2026-09-06' } } },
    { key: 'settings', value: { theme: 'dark', textSize: 'large' } },
  ],
  game: [{ key: 'climber', value: { level: 7, xp: 1234, coins: 56 } }],
  programs: [{ id: 'custom-1', name: 'Mine', weeks: 8, sessionTypes: [] }],
  meta: [{ key: 'repaired-modes', value: true }],
};

async function seed(): Promise<void> {
  const db = await getDb();
  await db.put('sessions', SESSION as never);
  await db.put('projects', PROJECT as never);
  await db.put('metrics', METRIC as never);
  await db.put('media', MEDIA as never);
  for (const [store, rows] of Object.entries(KEYED)) {
    for (const row of rows) await db.put(store as 'profile', row as never);
  }
}

/** Export, wipe the device, import. What a restore onto a new phone is. */
async function roundTrip(): Promise<void> {
  const archive = await exportArchive();
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  const backup = readBackupFile(archive.bytes);
  await importAll(backup.file, 'replace', { blobs: backup.blobs });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('the fixture covers the record', () => {
  it.each([
    ['Session', 'src/db/sessions.ts', SESSION],
    ['Project', 'src/db/projects.ts', PROJECT],
    ['MetricEntry', 'src/db/metrics.ts', METRIC],
    ['MediaRecord', 'src/db/schema.ts', MEDIA],
  ])('%s', (name, file, fixture) => {
    const declared = fieldsOf(file, name);
    expect(declared.length, `${name} has fields`).toBeGreaterThan(3);
    const missing = declared.filter((field) => !(field in fixture));
    expect(missing, `${name} fields this fixture does not set`).toEqual([]);
  });
});

describe('a backup carries every field home', () => {
  it('brings a session back whole', async () => {
    await seed();
    await roundTrip();
    const back = await (await getDb()).get('sessions', SESSION.id);
    // The whole row, not a subset of it.
    expect(back).toEqual(SESSION);
  });

  it('brings a project, an assessment and the keyed stores back whole', async () => {
    await seed();
    await roundTrip();
    const db = await getDb();
    expect(await db.get('projects', PROJECT.id)).toEqual(PROJECT);
    expect(await db.get('metrics', [METRIC.metricId, METRIC.date])).toEqual(METRIC);
    for (const [store, rows] of Object.entries(KEYED)) {
      for (const row of rows) {
        const key = 'key' in row ? row.key : row.id;
        expect(await db.get(store as 'profile', key as string), `${store}/${key}`).toEqual(row);
      }
    }
  });

  it('brings a photo back with its bytes, its size and its drawn beta', async () => {
    await seed();
    await roundTrip();
    const back = await (await getDb()).get('media', MEDIA.id);
    expect(back).toBeTruthy();
    const { blob, ...rest } = back!;
    const { blob: seeded, ...expected } = MEDIA;
    expect(rest).toEqual(expected);
    // The bytes themselves, not just a record that says there are some.
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array(await seeded.arrayBuffer()));
    expect(blob.type).toBe(seeded.type);
  });
});

/**
 * The one thing a restore is allowed to rewrite.
 *
 * `importAll` puts every row back as it came except a session, which goes
 * through `withDeclaredMode` — the rule M180 wrote, applied to rows this
 * app did not build. That makes a restore deliberately **not** an identity,
 * and nothing said which field it may touch.
 */
describe('what a restore may change', () => {
  it('repairs the mode a session type declares, and nothing else', async () => {
    const db = await getDb();
    // An outdoor session type, stored claiming to be indoors.
    await db.put('sessions', { ...SESSION, sessionTypeId: 'fp', mode: 'outdoor' } as never);
    await roundTrip();
    const back = (await (await getDb()).get('sessions', SESSION.id)) as Record<string, unknown>;
    const seeded: Record<string, unknown> = { ...SESSION, sessionTypeId: 'fp', mode: 'outdoor' };
    const changed = Object.keys(seeded).filter(
      (field) => JSON.stringify(back[field]) !== JSON.stringify(seeded[field]),
    );
    expect(changed.every((field) => field === 'mode'), `changed: ${changed.join(', ')}`).toBe(true);
  });
});

/**
 * Both halves of the one hand-written list in the restore path.
 *
 * Records go through whole — `getAll` out, `put` in — so a field cannot be
 * lost by forgetting it. A photo does not: the export builds a
 * `MediaExport` field by field and the import builds the record back the
 * same way, so a field added to `MediaRecord` and not to both is a photo
 * that comes home missing something. Both lists cover all nine today; this
 * is what keeps them covering the tenth.
 */
describe('the photo allow-lists', () => {
  const source = readFileSync('src/db/exportImport.ts', 'utf8');
  const chunk = (from: string, to: string) => source.slice(source.indexOf(from), source.indexOf(to));

  it.each([
    ['the export mapping', 'const media: MediaExport[] = [];', 'file.media = media;'],
    ['the import rebuild', 'const decoded = (file.media ?? [])', 'const mediaTx'],
  ])('%s names every field of a photo', (_name, from, to) => {
    const body = chunk(from, to);
    expect(body.length, 'the mapping is still where this expects').toBeGreaterThan(80);
    // `blob` is the bytes, carried as a zip entry rather than a field.
    const declared = fieldsOf('src/db/schema.ts', 'MediaRecord').filter((f) => f !== 'blob');
    const missing = declared.filter((field) => !new RegExp(`\\b${field}\\b`).test(body));
    expect(missing, 'fields the mapping does not mention').toEqual([]);
  });
});
