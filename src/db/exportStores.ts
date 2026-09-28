/**
 * What a backup holds (PLAN.md M345).
 *
 * Out of `schema.ts`, which opens the database at boot. The stores a backup
 * carries and the key its safety snapshot sits under are read only by the
 * export, the import and its preview, all on the data page.
 */

/** Stores included in the plain JSON export. `media` holds Blobs, which do
 *  not survive JSON.stringify, so it is exported separately as data URLs —
 *  see exportImport.ts. An offline app whose backup silently omits your
 *  photos is worse than one that has no photos. */
export const EXPORTABLE_STORES = [
  'meta',
  'sessions',
  'profile',
  'programs',
  'projects',
  'metrics',
  'game',
] as const;

export type ExportableStore = (typeof EXPORTABLE_STORES)[number];

/**
 * Reserved `meta` key holding the pre-import restore point (PLAN.md M20).
 *
 * Lives here rather than in snapshot.ts because both the export path and the
 * snapshot itself need it, and having them import from each other makes a
 * cycle out of two modules that only share a string.
 */
export const SNAPSHOT_KEY = '__import-snapshot';
