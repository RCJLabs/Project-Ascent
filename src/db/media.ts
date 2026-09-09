/**
 * Photo storage (PLAN.md §9, media-on-projects).
 *
 * Blobs live in their own store keyed by id and indexed by owner, so a
 * deleted project can take its pictures with it instead of leaving them to
 * occupy the quota forever.
 */

import type { MediaRecord } from './schema';
import { getDb } from './db';

/** Owner keys are namespaced so the index is unambiguous across types. */
export function projectOwner(projectId: string): string {
  return `project:${projectId}`;
}

/** Per owner. Storage is finite and this app has no cloud behind it. */
export const MAX_PER_OWNER = 8;

export async function listMedia(ownerId: string): Promise<MediaRecord[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('media', 'by-owner', ownerId);
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function addMedia(record: Omit<MediaRecord, 'id' | 'createdAt'>): Promise<MediaRecord> {
  const db = await getDb();
  const full: MediaRecord = {
    ...record,
    id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
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

/** Total bytes held, so the UI can be honest about what it is costing. */
export async function mediaBytes(): Promise<number> {
  const db = await getDb();
  const rows = await db.getAll('media');
  return rows.reduce((sum, r) => sum + r.blob.size, 0);
}
