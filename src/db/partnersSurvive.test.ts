import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { loadPrograms } from '@/content/programs';
import { CSV_FILES, SESSION_HEADER } from '@/engine/exportCsv';
import { unzip } from '@/lib/zip';
import { getDb, resetDbForTests } from './db';
import { BACKUP_ENTRY, exportArchive, importAll, parseExportFile } from './exportImport';

/**
 * A partner's name comes back out (PLAN.md M237).
 *
 * The other half of `ui/sharedNames.test.ts`. That one holds the rule that a
 * name never leaves on a share card; this one holds the rule that it *does*
 * leave in a backup and a spreadsheet, because those are the climber's own
 * data going to their own disk and a backup that quietly dropped a field
 * would be a backup that loses history.
 *
 * Both rules follow from the same fact — a card is a picture made to be
 * posted, a backup is a restore — and a change that broke either would look
 * reasonable on its own.
 */

const NAME = 'Zmarglebeth';
const ID = '2026-03-02#0';

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await loadPrograms();
  const db = await getDb();
  await db.put('sessions', {
    id: ID,
    date: '2026-03-02',
    completed: true,
    rpe: 7,
    durationMin: 60,
    mode: 'indoor',
    climbs: [],
    partners: [NAME, 'Jo Ridley'],
  });
});

describe('an archive of a log with a partner on it', () => {
  it('carries the name in the backup, which is what a restore reads', async () => {
    const { bytes } = await exportArchive({ media: false });
    const entry = unzip(bytes).find((e) => e.name === BACKUP_ENTRY)!;
    const file = parseExportFile(new TextDecoder().decode(entry.bytes));
    expect((file.data.sessions?.[0] as { partners?: string[] })?.partners).toEqual([
      NAME,
      'Jo Ridley',
    ]);
  });

  it('puts it back on the session after a restore into an empty install', async () => {
    const { file } = await exportArchive({ media: false });
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await importAll(file, 'replace');
    const restored = (await (await getDb()).get('sessions', ID)) as { partners?: string[] };
    expect(restored.partners).toEqual([NAME, 'Jo Ridley']);
  });

  /**
   * And in the spreadsheet, under its own column — semicolon-separated,
   * because a comma inside a cell is a quoting problem every spreadsheet
   * solves differently and two names is the common case.
   */
  it('gives it a column in the sessions sheet', async () => {
    const { bytes } = await exportArchive({ media: false });
    const csv = new TextDecoder().decode(
      unzip(bytes).find((e) => e.name === CSV_FILES.sessions)!.bytes,
    );
    // CRLF, which is what `toCsv` writes.
    const [header, row] = csv.trim().split(/\r?\n/);
    const columns = header!.split(',');
    expect(columns).toEqual([...SESSION_HEADER]);
    const at = columns.indexOf('With');
    expect(at).toBeGreaterThan(-1);
    expect(row!.split(',')[at]).toBe(`${NAME}; Jo Ridley`);
  });
});
