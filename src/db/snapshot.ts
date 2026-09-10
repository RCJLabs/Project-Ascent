import { getDb } from './db';
import { exportAll, importAll, type ExportFile } from './exportImport';
import { SNAPSHOT_KEY } from './schema';

/**
 * A restore point, taken automatically before an import (PLAN.md M20).
 *
 * Import is the one action in the app that can destroy a year of logs, and
 * until now it was a single tap with no way back. This takes the whole
 * database first, so "undo" is a real offer rather than an apology.
 *
 * Kept in `meta` under a reserved key rather than in a store of its own,
 * because a new store means a schema bump, and the export format shares that
 * version number — every older copy of the app would start rejecting new
 * backups over a change that does not affect the format at all. The key is
 * excluded from export and ignored on import instead, so a snapshot never
 * ends up inside a backup, and a backup can never overwrite your snapshot.
 *
 * The key itself lives in schema.ts — the export path needs it too, and
 * importing it from here would make a cycle.
 */
export { SNAPSHOT_KEY };

interface Snapshot {
  takenAt: string;
  /** What the import was, so the offer can name it. */
  replacedWith: string;
  file: ExportFile;
}

/**
 * Photos are left out on purpose.
 *
 * A snapshot with media would double the largest thing in the database at
 * the exact moment a climber is doing something risky, and M19 exists
 * because running out of room is a real failure. `exportAll` carries records
 * only, which is exactly what this wants. Logs, projects, assessments and
 * settings all come back; photos do not, and the UI says so rather than
 * finding out later.
 */
export async function takeSnapshot(replacedWith: string): Promise<void> {
  const file = await exportAll();
  const db = await getDb();
  const snapshot: Snapshot = { takenAt: new Date().toISOString(), replacedWith, file };
  await db.put('meta', { key: SNAPSHOT_KEY, value: snapshot });
}

export async function readSnapshot(): Promise<{ takenAt: string; replacedWith: string } | null> {
  const db = await getDb();
  const record = await db.get('meta', SNAPSHOT_KEY);
  const snapshot = record?.value as Snapshot | undefined;
  if (!snapshot || typeof snapshot.takenAt !== 'string' || !snapshot.file) return null;
  return { takenAt: snapshot.takenAt, replacedWith: snapshot.replacedWith };
}

/**
 * Put the database back as it was, and drop the snapshot.
 *
 * A replace, not a merge: the point is to undo, and merging the old state
 * over the imported one would leave both, which is neither.
 */
export async function restoreSnapshot(): Promise<boolean> {
  const db = await getDb();
  const record = await db.get('meta', SNAPSHOT_KEY);
  const snapshot = record?.value as Snapshot | undefined;
  if (!snapshot?.file) return false;
  // Records only. A snapshot holds no photos, and a replace that reads that
  // as "this file says there are none" deleted every photo on the device —
  // including, after a *merge* import, photos that were never at risk
  // (PLAN.md M54). Photos an undone import brought in are orphans once their
  // owners go, which is the boot sweep's job and nobody else's.
  await importAll(snapshot.file, 'replace', { photos: 'keep' });
  await clearSnapshot();
  return true;
}

export async function clearSnapshot(): Promise<void> {
  const db = await getDb();
  await db.delete('meta', SNAPSHOT_KEY);
}
