/**
 * What kind of file the app was just handed (PLAN.md M111).
 *
 * `file_handlers` matches on extension, and **both of the app's own files
 * are `.json`** — a shared program (`programFile.ts`, written so a coach
 * can hand an athlete a block) and a backup. The manifest cannot tell them
 * apart, so the app reads the first line of the thing before deciding which
 * screen it belongs to.
 *
 * A backup archive is a `.zip` and is not a question: nothing else the app
 * writes is one.
 *
 * `programFile.ts` states the rule this follows for anything a stranger
 * produced — **rebuild, never cast** — so this only ever *reads* two
 * fields, and hands the file to a parser that re-checks everything.
 */

export type OpenedKind = 'program' | 'backup' | null;

/** Bytes that start a zip, which is what an archive backup is. */
export function looksZipped(head: Uint8Array): boolean {
  return head[0] === 0x50 && head[1] === 0x4b;
}

/**
 * The kind, from the text of a JSON file, or null when it is neither.
 *
 * Null rather than a guess: a file the app cannot place is one it should
 * say it cannot place, not one it opens in whichever screen was nearest.
 */
export function openedKind(text: string): OpenedKind {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  // Only null needs its own line: indexing it throws, and `typeof null` is
  // `'object'` so the obvious guard lets it through. A number, a string or
  // an array is safe to index and answers `undefined` to the next check.
  if (raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (record['app'] !== 'project-ascent') return null;
  if (record['kind'] === 'program') return 'program';
  // A backup names its schema. Anything else carrying the app's name is
  // still not something either importer knows how to read.
  return typeof record['schemaVersion'] === 'number' ? 'backup' : null;
}

/**
 * The kind of an actual file, archive or text.
 *
 * The two bytes come first because an archive is cheap to recognise and
 * `text()` on one is megabytes of binary decoded as UTF-8 for nothing.
 */
export async function kindOfFile(file: File): Promise<OpenedKind> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  // Two bytes before any decoding. An archive backup is every photo the
  // climber has ever attached, and `text()` on it is all of that decoded as
  // UTF-8 to learn something the first two bytes already said.
  if (looksZipped(head)) return 'backup';
  return openedKind(await file.text());
}

/** Where a file of that kind is opened. */
export const OPENS_AT: Record<Exclude<OpenedKind, null>, string> = {
  program: '/build',
  backup: '/settings',
};
