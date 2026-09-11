import { APP_VERSION } from '@/version';
import { looksLikeZip, unzip, zip, ZipError, type ZipEntry } from '@/lib/zip';
import type { Mark } from '@/lib/marks';
import { getDb } from './db';
import {
  EXPORTABLE_STORES,
  SCHEMA_VERSION,
  SNAPSHOT_KEY,
  type ExportableStore,
  type MediaRecord,
} from './schema';

/**
 * A photo's description. The bytes live beside it in the archive.
 *
 * Exactly one of `file` and `data` is set. `data` is what backups written
 * before M53 carry, and reading them is not optional: a backup format that
 * stops accepting its own older files is not a backup format.
 */
export interface MediaExport {
  id: string;
  ownerId: string;
  type: string;
  width: number;
  height: number;
  caption?: string;
  /** The drawn beta (PLAN.md M71). Rides inside backup.json, not beside the
   *  photo: it is geometry, and a few hundred bytes of it. */
  marks?: Mark[];
  createdAt: string;
  /** This photo's entry inside the archive, e.g. `media/m-abc.webp`. */
  file?: string;
  /** Base64 data URL, from a backup made before the archive format. */
  data?: string;
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

/** The records, inside every archive this app writes. */
export const BACKUP_ENTRY = 'backup.json';
const MEDIA_DIR = 'media/';

/**
 * Every record, without photos.
 *
 * This is the JSON that goes inside an archive, and it is also what the
 * pre-import snapshot stores directly. Photos are never inlined here — see
 * `exportArchive`, and zip.ts for the measurements that ended that.
 */
export async function exportAll(): Promise<ExportFile> {
  const db = await getDb();
  const data = {} as ExportFile['data'];
  for (const store of EXPORTABLE_STORES) {
    const rows = await db.getAll(store);
    // The pre-import snapshot lives in `meta`. A backup containing a backup
    // doubles in size every time one is taken from a restored database, and
    // restoring one would hand the climber someone else's undo history.
    data[store] =
      store === 'meta'
        ? rows.filter((r) => (r as { key?: string }).key !== SNAPSHOT_KEY)
        : rows;
  }
  return {
    app: 'project-ascent',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export interface Archive {
  bytes: Uint8Array;
  /** The same records the archive carries, for a caller that wants to
   *  say what it just wrote without opening the file again. */
  file: ExportFile;
}

/**
 * The whole backup as one file: records as JSON, photos as photos.
 *
 * Photos are opt-out rather than absent — a backup that silently drops them
 * is a backup that lies — and opt-out rather than mandatory, because a
 * climber with four years of project pictures should be able to take the
 * small file when the small file is what they want.
 */
export async function exportArchive(options: { media?: boolean } = {}): Promise<Archive> {
  const file = await exportAll();
  const photos: ZipEntry[] = [];

  if (options.media !== false) {
    const db = await getDb();
    const rows = await db.getAll('media');
    if (rows.length > 0) {
      const taken = new Set<string>();
      const media: MediaExport[] = [];
      for (const row of rows) {
        const name = photoName(row, taken);
        media.push({
          id: row.id,
          ownerId: row.ownerId,
          type: row.type,
          width: row.width,
          height: row.height,
          ...(row.caption ? { caption: row.caption } : {}),
          ...(row.marks?.length ? { marks: row.marks } : {}),
          createdAt: row.createdAt,
          file: name,
        });
        photos.push({ name, bytes: new Uint8Array(await row.blob.arrayBuffer()) });
      }
      file.media = media;
    }
  }

  // The records first, so anything reading the archive in order — this app
  // included — knows what it is holding before it reaches the pictures.
  const entries: ZipEntry[] = [
    { name: BACKUP_ENTRY, bytes: new TextEncoder().encode(JSON.stringify(file, null, 2)) },
    ...photos,
  ];
  return { bytes: zip(entries), file };
}

/** File extensions worth naming. Anything else keeps its subtype. */
const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

function extensionFor(type: string): string {
  const known = EXTENSIONS[type];
  if (known) return known;
  const subtype = type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') ?? '';
  return subtype || 'bin';
}

/**
 * A file name for a photo, unique within the archive.
 *
 * Built from the record's id because an archive a climber opens should be
 * navigable, but never trusting it: an id arrives from whatever file was
 * imported last, and a name with a slash in it would write a photo into a
 * directory — or over the records.
 */
function photoName(record: MediaRecord, taken: Set<string>): string {
  const safe = record.id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'photo';
  const extension = extensionFor(record.type);
  let name = `${MEDIA_DIR}${safe}.${extension}`;
  for (let n = 2; taken.has(name); n += 1) name = `${MEDIA_DIR}${safe}-${n}.${extension}`;
  taken.add(name);
  return name;
}

/**
 * Base64 by hand rather than FileReader or fetch('data:…').
 *
 * Both of those are browser-only, and this is a pure data path that the
 * tests need to exercise without a DOM. `btoa`/`atob` exist in browsers and
 * in Node alike.
 */
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

export interface Backup {
  file: ExportFile;
  /** Photo bytes by entry name. Empty for a backup written before M53. */
  blobs: Map<string, Uint8Array>;
  /** Photos the file describes that its archive does not contain. */
  photosMissing: number;
}

/**
 * One way in for both formats.
 *
 * The archive is what this app writes now; the bare JSON is what it wrote
 * until M53, and every copy of it that exists is somebody's only copy. Both
 * arrive here as bytes and leave as the same thing, so nothing downstream —
 * the preview, the import, the tests — has to know which it was.
 */
export function readBackupFile(bytes: Uint8Array): Backup {
  if (!looksLikeZip(bytes)) {
    return resolveMedia(parseExportFile(new TextDecoder().decode(bytes)), new Map());
  }
  const entries = unzip(bytes);
  const records = entries.find((e) => e.name === BACKUP_ENTRY);
  if (!records) {
    throw new ZipError(`This archive is not a Project Ascent backup — there is no ${BACKUP_ENTRY} inside it.`);
  }
  const file = parseExportFile(new TextDecoder().decode(records.bytes));
  const blobs = new Map(entries.filter((e) => e !== records).map((e) => [e.name, e.bytes]));
  return resolveMedia(file, blobs);
}

/**
 * Drop photos the file describes but does not carry, and count them.
 *
 * Dropped here rather than at import, so the preview a climber reads and the
 * import they then confirm are counting the same photos. `media` stays
 * defined even when nothing survives: the file said it carried photos, and
 * a replace clears the device's own on that basis.
 */
function resolveMedia(file: ExportFile, blobs: Map<string, Uint8Array>): Backup {
  if (!file.media) return { file, blobs, photosMissing: 0 };
  const kept = file.media.filter((m) =>
    m.file !== undefined ? blobs.has(m.file) : typeof m.data === 'string',
  );
  return { file: { ...file, media: kept }, blobs, photosMissing: file.media.length - kept.length };
}

export interface ImportOptions {
  /** Photo bytes from the archive, by entry name. */
  blobs?: Map<string, Uint8Array>;
  /**
   * What a replace does to photos the file does not carry.
   *
   * 'clear' — the default, and right for a backup a climber picked: the file
   * is the statement of record, and half a restore is worse than either half.
   * 'keep' — for the snapshot restore, which stores records only and so never
   * claimed to speak for photos at all (PLAN.md M54).
   */
  photos?: 'clear' | 'keep';
}

/**
 * mode 'replace': clears every exportable store first.
 * mode 'merge': puts records over existing ones — same keys win from the
 * import, everything else is kept.
 * Callers must check hasRealData() and ask the user before 'replace'.
 */
export async function importAll(
  file: ExportFile,
  mode: 'replace' | 'merge',
  options: ImportOptions = {},
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(EXPORTABLE_STORES as unknown as ExportableStore[], 'readwrite');
  for (const store of EXPORTABLE_STORES) {
    const incoming = file.data[store];
    if (!Array.isArray(incoming)) continue;
    const os = tx.objectStore(store);
    if (mode === 'replace') {
      // Everything except the snapshot, which is what makes this import
      // undoable — clearing it here would delete the way back mid-import.
      if (store === 'meta') {
        for (const key of await os.getAllKeys()) {
          if (key !== SNAPSHOT_KEY) await os.delete(key);
        }
      } else {
        await os.clear();
      }
    }
    for (const record of incoming) {
      // A file cannot write the reserved key, whatever it claims to hold.
      if (store === 'meta' && (record as { key?: string })?.key === SNAPSHOT_KEY) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await os.put(record as any);
    }
  }
  await tx.done;

  // Photos go in a second transaction. The first one covers the exportable
  // stores only, and media is not one of them.
  const decoded = (file.media ?? []).flatMap((m) => {
    const blob = photoBlob(m, options.blobs);
    // Already counted and reported by readBackupFile; a caller that built
    // the file by hand gets the same treatment rather than a broken record.
    if (!blob) return [];
    return [
      {
        id: m.id,
        ownerId: m.ownerId,
        type: m.type,
        width: m.width,
        height: m.height,
        ...(m.marks?.length ? { marks: m.marks } : {}),
        ...(m.caption ? { caption: m.caption } : {}),
        createdAt: m.createdAt,
        blob,
      },
    ];
  });
  const mediaTx = db.transaction('media', 'readwrite');
  // A replace with no photos in the file still clears them: the backup is
  // the statement of record, and half a restore is worse than either half.
  // Unless the caller says otherwise — see ImportOptions.photos.
  if (mode === 'replace' && options.photos !== 'keep') await mediaTx.store.clear();
  for (const record of decoded) await mediaTx.store.put(record);
  await mediaTx.done;
}

function photoBlob(m: MediaExport, blobs?: Map<string, Uint8Array>): Blob | null {
  if (m.file !== undefined) {
    const bytes = blobs?.get(m.file);
    return bytes ? new Blob([bytes as BlobPart], { type: m.type }) : null;
  }
  return typeof m.data === 'string' ? dataUrlToBlob(m.data) : null;
}
