import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { dbFault, readOr, resetDbForTests } from './db';

/**
 * Reads that rejected into nothing (PLAN.md M158).
 *
 * M151 recorded one unhandled rejection on a `VersionError` boot and said it
 * had not traced it. It was `DemoBanner`, and there were six more behind it —
 * every one the same shape: a `db/` read with no store above it, called from
 * an effect as `void read().then(setState)`, where `void` satisfies the
 * linter and handles nothing.
 *
 * Two halves are checked here. That each of those reads now *resolves* on a
 * database that refuses, which is a fact about runtime; and that a new one
 * cannot be added without a decision, which is a fact about the source and
 * needs a scan.
 */

/** Every open refuses, exactly as an older build meeting newer data does. */
function refuse(): void {
  vi.spyOn(indexedDB, 'open').mockImplementation(() => {
    const error = new DOMException('The requested version is less than the existing version.', 'VersionError');
    throw error;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('readOr', () => {
  it('hands back the fallback and records why', async () => {
    const error = new DOMException('nope', 'VersionError');
    expect(
      await readOr(() => Promise.reject(error), 'fallback'),
    ).toBe('fallback');
    expect(dbFault()).toBe('newer-schema');
  });

  it('is transparent when the read works', async () => {
    expect(await readOr(() => Promise.resolve(42), 0)).toBe(42);
    expect(dbFault()).toBeNull();
  });

  it('catches a read that throws before it returns a promise', async () => {
    // `getDb` is `async` for exactly this reason (M151): `openDB` calls
    // `indexedDB.open` in its own body, so a browser that refuses outright
    // throws synchronously.
    expect(
      await readOr(() => {
        throw new DOMException('blocked', 'UnknownError');
      }, 'fallback'),
    ).toBe('fallback');
    expect(dbFault()).toBe('unavailable');
  });
});

/**
 * The seven reads a component fires at the database on its own behalf, with
 * the fallback each answers when it cannot be read. Every one was an
 * unhandled rejection before this milestone.
 */
const READS: [string, () => Promise<unknown>, unknown][] = [
  ['hasDemo', async () => (await import('./demoFlag')).hasDemo(), false],
  ['canLoadDemo', async () => (await import('./demo')).canLoadDemo(), false],
  ['mediaBytes', async () => (await import('./media')).mediaBytes(), 0],
  ['mediaByIds', async () => (await import('./media')).mediaByIds(['a']), []],
  ['mediaOwners', async () => (await import('./media')).mediaOwners(), new Map()],
  ['listMedia', async () => (await import('./media')).listMedia('session:1'), []],
  ['readSnapshot', async () => (await import('./snapshot')).readSnapshot(), null],
];

describe('a database that refuses', () => {
  it.each(READS.map(([name]) => name))('%s resolves rather than rejecting', async (name) => {
    const [, read, fallback] = READS.find(([n]) => n === name)!;
    refuse();
    await expect(read()).resolves.toEqual(fallback);
    // And the refusal is recorded, so the banner has something to say —
    // a fallback that swallowed the reason would be the M151 lie again.
    expect(dbFault()).toBe('newer-schema');
  });

  it('reports the health page as empty rather than throwing', async () => {
    refuse();
    const { readDbHealth } = await import('./health');
    const health = await readDbHealth();
    expect(health.counts).toEqual({});
    expect(health.mediaBytes).toBe(0);
    expect(health.orphans).toEqual({ count: 0, bytes: 0 });
    // Null rather than the running version: nothing could be read, so the
    // database's own origin is unknown and the page must not claim this
    // build made it (PLAN.md M159).
    expect(health.versions.createdWith).toBeNull();
    expect(dbFault()).toBe('newer-schema');
  });

  it('would notice a read that went back to rejecting', async () => {
    // The cases above pass for a function that never touches the database
    // at all, so this proves the refusal is real and reaches an unwrapped
    // read: `getAll` on a raw connection still throws.
    refuse();
    const { getDb } = await import('./db');
    await expect(getDb()).rejects.toThrow();
  });
});

/**
 * The scan, so the next one is a decision rather than an accident.
 *
 * A list of seven names would pass the day an eighth read appears, which is
 * the failure mode M152 and M157 both wrote scans to avoid. What is checked
 * instead: every `db/` function a component imports and calls is either
 * wrapped in `readOr`, or named below with the reason it is not.
 */
const ASKED_FOR: Record<string, string> = {
  loadDemo: 'writes the sample climber, from a button that reports its own failure',
  wipeDemo: 'clears the sample climber, from the same card and the same button',
  eraseEverything: 'the climber typed the confirmation; a silent no-op would be worse than an error',
  previewFile: 'an import the climber chose a file for — Settings shows the failure on the card',
  takeSnapshot: 'part of the import flow, which reports as a whole',
  restoreSnapshot: 'the undo for that import, same flow',
  clearSnapshot: 'the same flow, discarding the restore point',
  sweepOrphanMedia: 'a tidy-up the climber pressed — DataPage catches it and says so',
  addMedia: 'attaching a photo, from a picker the climber opened',
  deleteMedia: 'removing a photo the climber picked out to remove',
  updateMedia: 'editing a caption the climber is typing into',
};

/** Runtime (not type-only) names each screen imports out of `db/`. */
function importedFromDb(): Map<string, string> {
  const out = new Map<string, string>();
  const lines = execSync(
    "grep -rn \"from '@/db/\" src/ui src/features --include=*.ts --include=*.tsx || true",
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter((l) => l !== '' && !/\.test\.tsx?:/.test(l));

  for (const line of lines) {
    const at = line.indexOf(':');
    const file = line.slice(0, at);
    const text = line.slice(at + 1).replace(/^\d+:/, '');
    // `import type { … }` brings in no runtime value and cannot reject.
    if (/^\s*import\s+type\s/.test(text)) continue;
    const names = /import\s*\{([^}]*)\}/.exec(text)?.[1] ?? '';
    for (const raw of names.split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim();
      if (name !== '' && !/^type\s/.test(raw.trim())) out.set(name, file);
    }
  }
  return out;
}

/**
 * The decision itself, as a function so it can be fed a known case.
 *
 * A scan whose only input is the real tree passes just as well when it is
 * exempting everything or accepting every body — the battery showed both.
 * Pulling it out means the self-check below exercises the same code the real
 * case does, which is what M157 had to do to its own scan for the same
 * reason.
 */
function bodyOf(source: string, name: string): string | null {
  // To the first `}` at column zero, not a fixed number of characters. A
  // windowed match reached past the end of the function and found the
  // `readOr` in the *next* one, so an unwrapped read sitting above a wrapped
  // one passed — which the self-check below caught and the real tree, where
  // they happen to sit the other way round, never would have.
  const match = new RegExp(`export async function ${name}\\b[\\s\\S]*?\\n\\}`).exec(source);
  return match?.[0] ?? null;
}

function unguardedReads(
  imports: Map<string, string>,
  dbSource: string,
  askedFor: Record<string, string>,
): string[] {
  const out: string[] = [];
  for (const [name, file] of imports) {
    if (askedFor[name]) continue;
    // Only exported async functions can reject; constants and sync helpers
    // (`sessionOwner`, `STORE_LABEL`, `dbFault`) cannot.
    const body = bodyOf(dbSource, name);
    if (body === null) continue;
    if (!/\breadOr\(/.test(body)) out.push(`${name} (${file})`);
  }
  return out;
}

describe('every db read a screen fires on its own behalf', () => {
  const dbSource = execSync('cat src/db/*.ts', { encoding: 'utf8' });

  it('finds the imports to check', () => {
    // A scan that quietly found nothing would pass every case below.
    expect(importedFromDb().size).toBeGreaterThanOrEqual(15);
  });

  it('is wrapped in readOr, or named as something the climber asked for', () => {
    const unguarded = unguardedReads(importedFromDb(), dbSource, ASKED_FOR);
    expect(
      unguarded,
      `wrap in readOr, or add to ASKED_FOR with a reason:\n${unguarded.join('\n')}`,
    ).toEqual([]);
  });

  it('flags an unwrapped read, and only that one', () => {
    const source = [
      'export async function readBare(): Promise<number> {',
      '  const db = await getDb();',
      '  return db.count("meta");',
      '}',
      'export async function readSafe(): Promise<number> {',
      '  return await readOr(async () => (await getDb()).count("meta"), 0);',
      '}',
      'export async function writeThing(): Promise<void> {',
      '  await (await getDb()).put("meta", {});',
      '}',
      'export function sync(): number {',
      '  return 1;',
      '}',
    ].join('\n');
    const imports = new Map([
      ['readBare', 'src/features/x/A.tsx'],
      ['readSafe', 'src/features/x/B.tsx'],
      ['writeThing', 'src/features/x/C.tsx'],
      ['sync', 'src/features/x/D.tsx'],
      ['notInDbAtAll', 'src/features/x/E.tsx'],
    ]);
    expect(unguardedReads(imports, source, { writeThing: 'a write the climber asked for' })).toEqual([
      'readBare (src/features/x/A.tsx)',
    ]);
    // And an empty exemption table does not change the wrapped one's verdict.
    expect(unguardedReads(imports, source, {})).toEqual([
      'readBare (src/features/x/A.tsx)',
      'writeThing (src/features/x/C.tsx)',
    ]);
  });

  it('exempts nothing without saying why', () => {
    for (const [name, reason] of Object.entries(ASKED_FOR)) {
      expect(reason.length, name).toBeGreaterThan(20);
      expect(dbSource, name).toContain(name);
    }
  });

  /**
   * And the wrapping check has to be able to fail, or the pass above is a
   * loop that found nothing to look at.
   */
  it('reads a body to its own closing brace, not past it', () => {
    const source = [
      'export async function first(): Promise<number> {',
      '  return 1;',
      '}',
      'export async function second(): Promise<number> {',
      '  return await readOr(async () => 2, 0);',
      '}',
    ].join('\n');
    expect(bodyOf(source, 'first')).not.toContain('readOr');
    expect(bodyOf(source, 'second')).toContain('readOr');
    expect(bodyOf(source, 'missing')).toBeNull();
    expect(bodyOf(readFileSync('src/db/demoFlag.ts', 'utf8'), 'hasDemo')).toContain('readOr');
  });
});
