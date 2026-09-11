import { getDb } from './db';
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
 * Counts, never contents. `db.count` is an index read; `getAll` on a store
 * of photos would pull every blob into memory to find out how many there
 * are, which is the thing a page about storage health should least do.
 */
export type DbHealth = Pick<DataHealthInput, 'counts' | 'problems' | 'orphans' | 'mediaBytes'>;

export async function readDbHealth(): Promise<DbHealth> {
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
  };
}
