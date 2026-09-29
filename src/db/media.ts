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
 *
 * This file is the owners and the sweep, which the stores and the boot run.
 * Reading and writing the photos themselves is `mediaRecords.ts` (PLAN.md
 * M344), loaded with the pages that show or attach one.
 */

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
export function sizeOf(blob: Blob | undefined): number {
  const size = blob?.size;
  return typeof size === 'number' && Number.isFinite(size) ? size : 0;
}
