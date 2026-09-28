/**
 * The photos themselves: listed, added, changed, removed and sized
 * (PLAN.md §9, M30, M92).
 *
 * Out of `media.ts` (PLAN.md M344), which keeps the owner keys and the
 * sweep the stores and the boot need. Everything here is read by the pages
 * that show or attach a photo, and by Settings, all of them lazy.
 */

import type { MediaRecord } from './schema';
import { getDb, readOr } from './db';
import { sizeOf } from './media';

/** Per owner. Storage is finite and this app has no cloud behind it. */
export const MAX_PER_OWNER = 8;

export async function listMedia(ownerId: string): Promise<MediaRecord[]> {
  return await readOr(() => listMediaUncaught(ownerId), []);
}

async function listMediaUncaught(ownerId: string): Promise<MediaRecord[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('media', 'by-owner', ownerId);
  // Oldest first, and the id breaks a tie. `createdAt` has millisecond
  // resolution, so two photos added in the same tick compared equal and the
  // old comparator answered 1 either way — an order that could differ
  // between two reads of the same list.
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * Distinct and increasing, even inside one millisecond.
 *
 * `createdAt` is what the list is ordered by, and the clock has millisecond
 * resolution — two photos added in the same tick compared equal and came
 * back in whichever order the sort happened to produce. A climber picking
 * files one at a time never hits it; a loop hits it every time. At most a
 * few milliseconds ahead of the real clock, and only while adding.
 */
let lastStamp = 0;
function stamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

export async function addMedia(record: Omit<MediaRecord, 'id' | 'createdAt'>): Promise<MediaRecord> {
  const db = await getDb();
  const full: MediaRecord = {
    ...record,
    id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: stamp(),
  };
  await db.put('media', full);
  return full;
}

export async function updateMedia(record: MediaRecord): Promise<void> {
  const db = await getDb();
  await db.put('media', record);
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('media', id);
}

/**
 * Which owners hold photos, and which photos they hold (PLAN.md M92).
 *
 * A key cursor, for the reason spelled out in `findOrphanMedia`: the values
 * here are blobs, and reading them to find out who owns them would pull
 * every photo in the database into memory. The retrospectives need to know
 * *which* entries have pictures before they know which pictures to load,
 * and that question is answerable from the index alone.
 *
 * Ids come back in index order, which is by owner and then by primary key.
 * Not `createdAt` order — that lives in the record — so a caller that needs
 * the climber's own ordering reads the records for the handful it is about
 * to show.
 */
export async function mediaOwners(): Promise<Map<string, string[]>> {
  return await readOr(mediaOwnersUncaught, new Map());
}

async function mediaOwnersUncaught(): Promise<Map<string, string[]>> {
  const db = await getDb();
  const out = new Map<string, string[]>();
  const scan = db.transaction('media', 'readonly');
  let cursor = await scan.store.index('by-owner').openKeyCursor();
  while (cursor) {
    const owner = String(cursor.key);
    const ids = out.get(owner);
    if (ids) ids.push(String(cursor.primaryKey));
    else out.set(owner, [String(cursor.primaryKey)]);
    cursor = await cursor.continue();
  }
  await scan.done;
  return out;
}

/** The records named, in the climber's own order. Missing ids are skipped. */
export async function mediaByIds(ids: readonly string[]): Promise<MediaRecord[]> {
  // Thumbnails fetch these in an effect as the list scrolls, so on a
  // refusing database this was one rejection per strip (PLAN.md M158). No
  // photos is what a strip shows when it cannot read any.
  return await readOr(async () => {
    const db = await getDb();
    const rows = await Promise.all(ids.map((id) => db.get('media', id)));
    return rows.filter((r): r is MediaRecord => r !== undefined);
  }, []);
}

/**
 * Total bytes held, so the UI can be honest about what it is costing.
 *
 * Zero on a database that will not open: Settings reads this at mount and
 * did not catch it (PLAN.md M158).
 *
 * `getAll` rather than a key cursor, deliberately — see the header of
 * `db/health.ts` for the measurement that settles it. Every size is wanted
 * here, unlike `findOrphanMedia` above, which usually wants none of them.
 */
export async function mediaBytes(): Promise<number> {
  return await readOr(async () => {
    const db = await getDb();
    const rows = await db.getAll('media');
    return rows.reduce((sum, r) => sum + sizeOf(r.blob), 0);
  }, 0);
}
