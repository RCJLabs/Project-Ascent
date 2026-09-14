import { APP_VERSION } from '@/version';
import { getDb, readOr } from './db';
import { readingProblems } from './sound';
import { findOrphanMedia, mediaBytes } from './media';
import { SNAPSHOT_KEY } from './schema';
import { HEALTH_STORES, type DataHealthInput, type HealthStore } from '@/engine/dataHealth';

/**
 * The database half of the data-health report (PLAN.md M80).
 *
 * Separate from `engine/dataHealth`, the same way `previewFile` is separate
 * from `previewImport`: the rules are pure and testable, and this is the
 * part that has to open a database.
 *
 * Counts, never contents — with one measured exception.
 *
 * `db.count` is an index read, and every row in the table above comes from
 * one. This file used to say that `getAll` on a store of photos "would pull
 * every blob into memory", and then called `mediaBytes()` three lines later,
 * which does exactly that: a file contradicting itself in its own header.
 *
 * **The contradiction was real and the reason was wrong** (PLAN.md M159).
 * Chromium hands back Blob *handles*, not bytes: 150 photos totalling 44MB
 * summed in 3.3ms, against 0.5ms to read the keys alone. The cost scales
 * with the number of records rather than their size — 2,000 photos took
 * 57ms, where reading only their keys took 24ms — so the blobs account for
 * about half of it and the rest is deserialising 2,000 records at all.
 *
 * That is the whole case for an index on a stored `bytes` field, and it does
 * not pay: a schema migration and a backfill, plus a field that has to be
 * kept true by every write, to save ~34ms on a page the climber opened on
 * purpose, at a photo count few libraries will reach. `findOrphanMedia` keys
 * its cursor because it usually deletes none of them and would otherwise
 * read all of them for nothing; `mediaBytes` needs every size there is, and
 * there is no cheaper way to ask.
 */
export type DbHealth = Pick<DataHealthInput, 'counts' | 'problems' | 'orphans' | 'mediaBytes'> & {
  /** The version that created this database, and the one reading it now. */
  versions: { createdWith: string | null; running: string };
};

export async function readDbHealth(): Promise<DbHealth> {
  // `/data` reads this at mount as `void readDbHealth().then(setDb)`, so a
  // database that refuses used to reject into nothing (PLAN.md M158). The
  // empty report is the honest answer — no counts, because none could be
  // taken — and `DbFaultBanner` above it says why.
  return await readOr(readDbHealthUncaught, {
    counts: {},
    problems: readingProblems(),
    orphans: { count: 0, bytes: 0 },
    mediaBytes: 0,
    versions: { createdWith: null, running: APP_VERSION },
  });
}

async function readDbHealthUncaught(): Promise<DbHealth> {
  const db = await getDb();
  const counts: Partial<Record<HealthStore, number>> = {};
  for (const store of HEALTH_STORES) {
    counts[store] = await db.count(store);
  }

  // The import restore point is the app's own, not the climber's, and it is
  // one record that would otherwise make "App bookkeeping" read as growing.
  if ((counts.meta ?? 0) > 0 && (await db.get('meta', SNAPSHOT_KEY)) !== undefined) {
    counts.meta = (counts.meta ?? 1) - 1;
  }

  const orphans = await findOrphanMedia();
  return {
    counts,
    problems: readingProblems(),
    orphans: { count: orphans.ids.length, bytes: orphans.bytes },
    mediaBytes: await mediaBytes(),
    versions: {
      createdWith: ((await db.get('meta', 'createdWith'))?.value as string | undefined) ?? null,
      running: APP_VERSION,
    },
  };
}
