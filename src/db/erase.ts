/**
 * Delete everything (PLAN.md M114).
 *
 * ## Why the app needed this and did not have it
 *
 * Every byte lives on this device, and until now nothing could take any of
 * it off. Import replaces, `wipeDemo` removes what the sample climber wrote,
 * and neither is "start over". The immediate reason is testing — the sample
 * climber is offered only on an empty log (`canLoadDemo` is
 * `!hasRealData()`), so one logged session locks it away for good, and the
 * only way back was to clear site data through the browser, which a
 * standalone or TWA install does not really have.
 *
 * The general reason is better: an offline app that cannot delete your data
 * is an app you cannot hand your phone to someone with, or leave.
 *
 * ## The alternative, and why it was refused
 *
 * The obvious cheaper fix is to loosen the sample-data gate. That is exactly
 * the risk M110 built the gate against: sample data landing in a real log.
 * Deleting is the honest answer to "I want the demo again", and it is the
 * one that is also worth shipping to somebody who is not testing.
 *
 * ## It is real deletion, not a restore point
 *
 * M20's import takes a snapshot first and `UndoImportCard` offers it back,
 * which is right for a replace. It is wrong here. Someone who taps "delete
 * everything" before passing a phone on has not had their data deleted if a
 * complete copy is still sitting in `meta`. So this keeps nothing, and the
 * confirmation in front of it carries the weight instead.
 *
 * ## What it does not touch, and why that is not an omission
 *
 * Theme, palette, text size and sound. M60 split those out of the profile
 * into `localStorage` deliberately — they belong to "the phone in the hand"
 * rather than to the climber, they are never in a backup, and importing
 * someone else's data does not change them. Erasing the climber should not
 * either: a wiped app in the wrong theme is a worse first run, and the
 * setting says nothing about anyone.
 *
 * `sessionStorage` is not touched for a plainer reason: a running timer
 * lives there and dies with the tab.
 */

import { getDb } from './db';

/**
 * Every store, which is deliberately not `EXPORTABLE_STORES`.
 *
 * That list omits `media`, because blobs do not survive `JSON.stringify`
 * and the export handles them separately. Reusing it here would leave every
 * photo in the database after a delete that claimed to remove everything —
 * the single worst thing this function could get wrong, and the reason the
 * list is written out rather than imported.
 */
const ALL_STORES = [
  'meta',
  'sessions',
  'profile',
  'programs',
  'projects',
  'metrics',
  'game',
  'media',
] as const;

/**
 * Bookkeeping, not a record (PLAN.md M170).
 *
 * `meta` is emptied like every other store — it is in the list above and it
 * has to be, or a wipe would leave the app remembering which version created
 * a database that no longer exists. But its rows are the app talking to
 * itself: `appVersion`, `createdAt`, `createdWith`, and the flag that says
 * the one-time `mode` repair has run. Counting them told a climber wiping
 * forty sessions that forty-three records went, and the fourth arrived with
 * M170's flag and made the line wronger.
 */
const NOT_A_RECORD: readonly string[] = ['meta'];

export interface Erased {
  /** Records removed, for the confirmation line. Bookkeeping excluded. */
  records: number;
  /** Photos among them, counted separately because they are what someone
   *  deleting a phone's contents actually pictures. */
  photos: number;
}

export async function eraseEverything(): Promise<Erased> {
  const db = await getDb();
  const tx = db.transaction(ALL_STORES, 'readwrite');
  const counts = await Promise.all(ALL_STORES.map((store) => tx.objectStore(store).count()));
  const photos = counts[ALL_STORES.indexOf('media')] ?? 0;
  await Promise.all([...ALL_STORES.map((store) => tx.objectStore(store).clear()), tx.done]);
  const records = counts.reduce(
    (n, c, i) => (NOT_A_RECORD.includes(ALL_STORES[i]!) ? n : n + c),
    0,
  );
  return { records, photos };
}

/**
 * Every store the database declares is in the list above.
 *
 * Exported for the test rather than kept private: a store added in a future
 * `SCHEMA_VERSION` and not added here would survive a delete silently, and
 * the check that catches it has to be able to ask the database itself.
 */
export async function storeNames(): Promise<string[]> {
  const db = await getDb();
  return [...db.objectStoreNames].sort();
}

export const ERASED_STORES: readonly string[] = ALL_STORES;
