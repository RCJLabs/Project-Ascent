import { getDb } from './db';
import type { ExportFile } from './exportImport';
import { EXPORTABLE_STORES, SNAPSHOT_KEY, type ExportableStore } from './schema';

/**
 * What an import is about to do, before it does it (PLAN.md M20).
 *
 * Import used to be a single tap with two words of warning and no way back.
 * This computes the consequence per store, in records, from the keys on both
 * sides — counts alone cannot tell "412 sessions, all new" from "412
 * sessions, 380 of which overwrite what you have".
 *
 * Pure, and keyed on strings, so the whole thing is testable without a
 * database.
 */

/** Where each store keeps its primary key. `metrics` is a compound key. */
const KEY_PATH: Record<ExportableStore, string | [string, string]> = {
  meta: 'key',
  sessions: 'id',
  profile: 'key',
  programs: 'id',
  projects: 'id',
  metrics: ['metricId', 'date'],
  game: 'key',
};

/**
 * A record's key as a string.
 *
 * Returns null for a record with no usable key rather than inventing one:
 * such a record cannot be compared, and counting it as "new" would report an
 * import as safer than it is.
 */
export function keyOf(store: ExportableStore, record: unknown): string | null {
  if (typeof record !== 'object' || record === null) return null;
  const row = record as Record<string, unknown>;
  const path = KEY_PATH[store];
  if (Array.isArray(path)) {
    const parts = path.map((p) => row[p]);
    if (parts.some((v) => typeof v !== 'string' && typeof v !== 'number')) return null;
    return parts.join(' ');
  }
  const value = row[path];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

export interface StorePreview {
  store: ExportableStore;
  /** Records in the backup file. */
  incoming: number;
  /** Records on this device now. */
  existing: number;
  /** In the file, not here — arrive under either mode. */
  added: number;
  /** In both — the file's copy wins under either mode. */
  overwritten: number;
  /** Here, not in the file. Merge keeps these; replace deletes them. */
  onlyHere: number;
  /** Records in the file that carry no usable key. */
  unreadable: number;
}

export interface ImportPreview {
  stores: StorePreview[];
  media: { incoming: number; existing: number; fileHasMedia: boolean };
  /** Everything replace would delete that the backup does not contain. */
  lostByReplace: number;
  /** Records that would arrive, either way. */
  arriving: number;
  /** Records in the file the app could not key. */
  unreadable: number;
}

export interface PreviewInput {
  /** Records from the parsed file, per store. */
  incoming: Partial<Record<ExportableStore, unknown[]>>;
  /** Keys already in the database, per store. */
  existing: Partial<Record<ExportableStore, string[]>>;
  media?: { incoming: number; existing: number; fileHasMedia: boolean };
}

export function previewImport(input: PreviewInput): ImportPreview {
  const stores: StorePreview[] = [];

  for (const store of EXPORTABLE_STORES) {
    const incoming = input.incoming[store] ?? [];
    const here = new Set(input.existing[store] ?? []);

    let added = 0;
    let overwritten = 0;
    let unreadable = 0;
    const seen = new Set<string>();

    for (const record of incoming) {
      const key = keyOf(store, record);
      if (key === null) {
        unreadable += 1;
        continue;
      }
      // A file listing the same key twice writes it twice and ends with one
      // record, so it counts once here too.
      if (seen.has(key)) continue;
      seen.add(key);
      if (here.has(key)) overwritten += 1;
      else added += 1;
    }

    stores.push({
      store,
      incoming: incoming.length,
      existing: here.size,
      added,
      overwritten,
      onlyHere: here.size - overwritten,
      unreadable,
    });
  }

  const media = input.media ?? { incoming: 0, existing: 0, fileHasMedia: false };
  // A replace with no photos in the file clears them — the backup is the
  // statement of record — so they are part of what replace costs.
  const mediaLost = media.fileHasMedia ? 0 : media.existing;

  return {
    stores,
    media,
    lostByReplace: stores.reduce((n, s) => n + s.onlyHere, 0) + mediaLost,
    arriving: stores.reduce((n, s) => n + s.added + s.overwritten, 0),
    unreadable: stores.reduce((n, s) => n + s.unreadable, 0),
  };
}

/** What to call each store in front of a climber. */
export const STORE_LABEL: Record<ExportableStore, string> = {
  sessions: 'Sessions',
  projects: 'Projects',
  metrics: 'Assessment results',
  programs: 'Your programs',
  profile: 'Settings and profile',
  game: 'Climber progress',
  meta: 'App bookkeeping',
};

/** The rows a climber should read, in the order they would care about. */
export function visibleRows(preview: ImportPreview): StorePreview[] {
  const order: ExportableStore[] = [
    'sessions',
    'projects',
    'metrics',
    'programs',
    'game',
    'profile',
    'meta',
  ];
  return order
    .map((store) => preview.stores.find((s) => s.store === store))
    .filter((s): s is StorePreview => s !== undefined && (s.incoming > 0 || s.existing > 0));
}

/**
 * The same preview, filled in from the database on this device.
 *
 * Keys only — reading every record to count them would load the whole log
 * into memory to answer a question about its size.
 */
export async function previewFile(file: ExportFile): Promise<ImportPreview> {
  const db = await getDb();
  const existing: Partial<Record<ExportableStore, string[]>> = {};
  for (const store of EXPORTABLE_STORES) {
    const keys = await db.getAllKeys(store);
    existing[store] = keys
      // `metrics` has a compound key, which arrives as an array.
      .map((k) => (Array.isArray(k) ? k.join(' ') : String(k)))
      // The snapshot is not part of anyone's data and is never imported.
      .filter((k) => k !== SNAPSHOT_KEY);
  }
  return previewImport({
    incoming: file.data ?? {},
    existing,
    media: {
      incoming: file.media?.length ?? 0,
      existing: await db.count('media'),
      fileHasMedia: file.media !== undefined,
    },
  });
}
