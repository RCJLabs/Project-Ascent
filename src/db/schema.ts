import type { DBSchema } from 'idb';
import type { Mark } from '@/lib/marks';

/**
 * IndexedDB schema (PLAN.md §3). Split stores, never one blob.
 *
 * The database name is a single constant so a future multi-profile/coach
 * mode (open decision, PLAN.md §9.3) can become one database per profile
 * without touching call sites.
 */
export const DB_NAME = 'project-ascent';
export const SCHEMA_VERSION = 2;

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

export interface MetaRecord {
  key: string;
  value: unknown;
}

/** Keyed records in the profile store: 'settings', 'profile', 'goals',
 *  'injuries' each live under their own key. */
export interface ProfileRecord {
  key: string;
  value: unknown;
}

export interface GameRecord {
  key: string;
  value: unknown;
}

/** Placeholder session shape for M0 — the full typed Session lands in M2
 *  (PLAN.md §3). The store contract (keyPath 'id', 'by-date' index) is
 *  final now so M2 is additive. */
export interface SessionRecord {
  id: string; // `${date}#${n}`
  date: string; // YYYY-MM-DD local
  [k: string]: unknown;
}

export interface ProgramRecord {
  id: string;
  [k: string]: unknown;
}

export interface ProjectRecord {
  id: string;
  [k: string]: unknown;
}

export interface MetricRecord {
  metricId: string;
  date: string; // YYYY-MM-DD local
  value: number;
}

export interface MediaRecord {
  id: string;
  /** What this belongs to, e.g. `project:abc123`. Indexed so deleting the
   *  owner can find its blobs rather than leaving them orphaned forever. */
  ownerId: string;
  blob: Blob;
  /** Mime type, kept alongside the blob so a restored record is complete. */
  type: string;
  width: number;
  height: number;
  caption?: string;
  /** Beta drawn on top (PLAN.md M71). Geometry rather than a flattened copy,
   *  so it stays editable and costs bytes instead of a second blob. Absent
   *  when nothing has been drawn — an empty array is a photo that claims to
   *  have been annotated and was not. */
  marks?: Mark[];
  createdAt: string;
}

export interface AscentDB extends DBSchema {
  meta: { key: string; value: MetaRecord };
  sessions: {
    key: string;
    value: SessionRecord;
    indexes: { 'by-date': string };
  };
  profile: { key: string; value: ProfileRecord };
  programs: { key: string; value: ProgramRecord };
  projects: { key: string; value: ProjectRecord };
  metrics: {
    key: [string, string];
    value: MetricRecord;
    indexes: { 'by-metric': string };
  };
  game: { key: string; value: GameRecord };
  media: {
    key: string;
    value: MediaRecord;
    indexes: { 'by-owner': string };
  };
}
