import { APP_VERSION } from '@/version';
import { getDb } from './db';
import { EXPORTABLE_STORES, SCHEMA_VERSION, type ExportableStore } from './schema';

export interface ExportFile {
  app: 'project-ascent';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  data: Record<ExportableStore, unknown[]>;
}

export async function exportAll(): Promise<ExportFile> {
  const db = await getDb();
  const data = {} as ExportFile['data'];
  for (const store of EXPORTABLE_STORES) {
    data[store] = await db.getAll(store);
  }
  return {
    app: 'project-ascent',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
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
}
