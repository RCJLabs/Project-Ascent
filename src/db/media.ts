/**
 * Photo storage (PLAN.md §9, and M30 for sessions).
 *
 * Blobs live in their own store keyed by owner, so a deleted owner can take
 * its pictures with it instead of leaving them to occupy the quota forever.
 *
 * **Owner keys are namespaced and the namespace is load-bearing.** The sweep
 * below deletes a blob whose owner has gone, and it can only do that for
 * kinds it knows how to look up — anything else is left alone rather than
 * guessed at.
 *
 * **A session's id is not stable.** It encodes the date (`2026-09-01#0`), so
 * re-dating a session is a write and a delete, and merging one into another
 * destroys the second id outright. Both operations have to carry the photos
 * across or they are stranded on an owner that no longer exists — which is
 * why `moveMediaOwner` exists and why it is not optional.
 */

import type { MediaRecord } from './schema';
import { getDb } from './db';

/** Owner keys are namespaced so the index is unambiguous across types. */
export function projectOwner(projectId: string): string {
  return `project:${projectId}`;
}

export function sessionOwner(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * The kinds the sweep can verify, and the store each one lives in.
 *
 * A namespace missing from here is never swept. That is deliberate: an
 * unknown prefix means this module cannot tell a live owner from a dead one,
 * and deleting a climber's photos on a guess is not a trade worth making for
 * a few kilobytes.
 */
const OWNER_STORES = { project: 'projects', session: 'sessions' } as const;

/** Per owner. Storage is finite and this app has no cloud behind it. */
export const MAX_PER_OWNER = 8;

export async function listMedia(ownerId: string): Promise<MediaRecord[]> {
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

/** Everything belonging to an owner, for when the owner goes. */
export async function deleteMediaFor(ownerId: string): Promise<number> {
  const db = await getDb();
  const keys = await db.getAllKeysFromIndex('media', 'by-owner', ownerId);
  const tx = db.transaction('media', 'readwrite');
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
  return keys.length;
}

/**
 * Re-point everything an owner holds. Returns how many moved.
 *
 * Used when a session is re-dated or merged away: the record is gone from
 * under the photos and nothing else would ever reunite them.
 *
 * The per-owner cap is deliberately *not* enforced here. A merge of two
 * full sessions leaves ten photos on one, which is untidy and costs nothing
 * — while dropping two of them to satisfy a limit would be this function
 * quietly destroying a climber's pictures to tidy up after itself. The card
 * already refuses to add past the cap, so an over-full owner simply stops
 * growing.
 */
export async function moveMediaOwner(from: string, to: string): Promise<number> {
  if (from === to) return 0;
  const db = await getDb();
  const rows = await db.getAllFromIndex('media', 'by-owner', from);
  if (rows.length === 0) return 0;
  const tx = db.transaction('media', 'readwrite');
  for (const row of rows) await tx.store.put({ ...row, ownerId: to });
  await tx.done;
  return rows.length;
}

/**
 * Photos whose owner is gone, and what they cost — without deleting them.
 *
 * Split out of the sweep for M80: the data page has to be able to say what
 * is there before offering to tidy it, and the sweep's own count was being
 * discarded by its only caller.
 *
 * Deleting an owner does **not** delete its photos, because deleting is
 * undoable (PLAN.md M20) and an undo that brings a project back without its
 * pictures is data loss dressed up as a safety net. So the blobs outlive the
 * record for a while and this collects them later, when there is no longer
 * an undo that could want them.
 */
export async function findOrphanMedia(): Promise<{ ids: string[]; bytes: number }> {
  const db = await getDb();
  const live = new Set<string>();
  for (const [kind, store] of Object.entries(OWNER_STORES)) {
    for (const key of await db.getAllKeys(store)) live.add(`${kind}:${String(key)}`);
  }

  // A key cursor over `by-owner`, not `getAll`. The values here are photos:
  // reading them to find out who owns them would pull every blob in the
  // database into memory to decide which handful to delete.
  const ids: string[] = [];
  const scan = db.transaction('media', 'readonly');
  let cursor = await scan.store.index('by-owner').openKeyCursor();
  while (cursor) {
    const owner = String(cursor.key);
    const kind = owner.slice(0, owner.indexOf(':'));
    if (kind in OWNER_STORES && !live.has(owner)) ids.push(String(cursor.primaryKey));
    cursor = await cursor.continue();
  }
  await scan.done;

  // Only the doomed ones are read for their size — usually none, and never
  // more than a handful, so the reason for the key cursor above still holds.
  let bytes = 0;
  for (const id of ids) bytes += sizeOf((await db.get('media', id))?.blob);
  return { ids, bytes };
}

export async function sweepOrphanMedia(): Promise<number> {
  const db = await getDb();
  const { ids } = await findOrphanMedia();
  if (ids.length === 0) return 0;

  const tx = db.transaction('media', 'readwrite');
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
  return ids.length;
}

/**
 * A blob's size, or zero.
 *
 * `Blob.size` is a number in every browser, and *not* in every record: an
 * old import can hold something that is not a blob at all, and one of those
 * turned the whole total into `NaN` — which reached the settings page as
 * "NaN KB" (found by M80's page showing the same number). One bad photo
 * should cost its own size, not the count.
 */
function sizeOf(blob: Blob | undefined): number {
  const size = blob?.size;
  return typeof size === 'number' && Number.isFinite(size) ? size : 0;
}

/** Total bytes held, so the UI can be honest about what it is costing. */
export async function mediaBytes(): Promise<number> {
  const db = await getDb();
  const rows = await db.getAll('media');
  return rows.reduce((sum, r) => sum + sizeOf(r.blob), 0);
}
