import { APP_VERSION } from '@/version';
import { getDb } from './db';
import { EXPORTABLE_STORES, SCHEMA_VERSION, type ExportableStore } from './schema';

/** A photo, flattened to something JSON can carry. */
export interface MediaExport {
  id: string;
  ownerId: string;
  type: string;
  width: number;
  height: number;
  caption?: string;
  createdAt: string;
  /** Base64 data URL. Roughly a third larger than the blob it came from. */
  data: string;
}

export interface ExportFile {
  app: 'project-ascent';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: Record<ExportableStore, unknown[]>;
  /** Absent when the climber chose to leave photos out. */
  media?: MediaExport[];
}

/**
 * Everything, optionally including photos.
 *
 * Blobs do not survive JSON.stringify, so media is carried separately as
 * data URLs. It is opt-out rather than absent: a backup that silently drops
 * your photos is a backup that lies. It is opt-out rather than mandatory
 * because base64 inflates a picture by a third, and a climber with a long
 * project history should be able to take the small file when that is what
 * they want.
 */
export async function exportAll(options: { media?: boolean } = {}): Promise<ExportFile> {
  const includeMedia = options.media !== false;
  const db = await getDb();
  const data = {} as ExportFile['data'];
  for (const store of EXPORTABLE_STORES) {
    data[store] = await db.getAll(store);
  }
  const file: ExportFile = {
    app: 'project-ascent',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  if (includeMedia) {
    const rows = await db.getAll('media');
    if (rows.length > 0) {
      file.media = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          ownerId: r.ownerId,
          type: r.type,
          width: r.width,
          height: r.height,
          ...(r.caption ? { caption: r.caption } : {}),
          createdAt: r.createdAt,
          data: await blobToDataUrl(r.blob),
        })),
      );
    }
  }
  return file;
}

/**
 * Base64 by hand rather than FileReader or fetch('data:…').
 *
 * Both of those are browser-only, and this is a pure data path that the
 * tests need to exercise without a DOM. `btoa`/`atob` exist in browsers and
 * in Node alike; the chunking is because String.fromCharCode(...bytes) blows
 * the call stack somewhere north of a hundred thousand arguments, which a
 * photo comfortably exceeds.
 */
const CHUNK = 0x8000;

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

function dataUrlToBlob(url: string): Blob {
  const comma = url.indexOf(',');
  const header = url.slice(0, comma);
  const type = /^data:([^;,]+)/.exec(header)?.[1] ?? 'application/octet-stream';
  const binary = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * True when the database holds anything a user would grieve — the guard
 * the import UI must consult before offering a silent replace
 * (the old app's `hasRealData` lesson, kept: AUDIT.md §6).
 */
export async function hasRealData(): Promise<boolean> {
  const db = await getDb();
  if ((await db.count('sessions')) > 0) return true;
  if ((await db.count('projects')) > 0) return true;
  if ((await db.count('metrics')) > 0) return true;
  if ((await db.count('programs')) > 0) return true;
  if ((await db.count('game')) > 0) return true;
  if ((await db.count('media')) > 0) return true;
  return false;
}

export function parseExportFile(text: string): ExportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a valid backup file (unreadable JSON).');
  }
  const file = raw as Partial<ExportFile>;
  if (file.app !== 'project-ascent' || typeof file.schemaVersion !== 'number' || typeof file.data !== 'object' || file.data === null) {
    throw new Error('Not a Project Ascent backup file.');
  }
  if (file.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `This backup is from a newer app version (schema v${file.schemaVersion}). Update the app, then import.`,
    );
  }
  return file as ExportFile;
}

/**
 * mode 'replace': clears every exportable store first.
 * mode 'merge': puts records over existing ones — same keys win from the
 * import, everything else is kept.
 * Callers must check hasRealData() and ask the user before 'replace'.
 */
export async function importAll(file: ExportFile, mode: 'replace' | 'merge'): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(EXPORTABLE_STORES as unknown as ExportableStore[], 'readwrite');
  for (const store of EXPORTABLE_STORES) {
    const incoming = file.data[store];
    if (!Array.isArray(incoming)) continue;
    const os = tx.objectStore(store);
    if (mode === 'replace') await os.clear();
    for (const record of incoming) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await os.put(record as any);
    }
  }
  await tx.done;

  // Photos go in a second transaction. The first one covers the exportable
  // stores only, and media is not one of them.
  const decoded = (file.media ?? []).map((m) => ({
    id: m.id,
    ownerId: m.ownerId,
    type: m.type,
    width: m.width,
    height: m.height,
    ...(m.caption ? { caption: m.caption } : {}),
    createdAt: m.createdAt,
    blob: dataUrlToBlob(m.data),
  }));
  const mediaTx = db.transaction('media', 'readwrite');
  // A replace with no photos in the file still clears them: the backup is
  // the statement of record, and half a restore is worse than either half.
  if (mode === 'replace') await mediaTx.store.clear();
  for (const record of decoded) await mediaTx.store.put(record);
  await mediaTx.done;
}
