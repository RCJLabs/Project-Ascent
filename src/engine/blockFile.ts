/**
 * An athlete's finished block, as a file a coach can open (PLAN.md M292).
 *
 * `programFile.ts` exists so a coach can hand somebody a block. This is the
 * return leg, and M291 read the code before it was built: the half the queue
 * entry got wrong is that something *does* come back already — since M284 an
 * athlete can share the block report as a picture. What could not come back
 * is anything the app can read.
 *
 * ## The obstacle is not the format
 *
 * The app reads three foreign files, and **two of them write into your own
 * records**: `importAll` replaces or merges the database, `importCsv` adds
 * sessions to your log. A coach opening an athlete's block through either of
 * those would absorb the athlete's training as their own, which is the wrong
 * answer in every screen downstream — the ladders, the venues, the year, the
 * load ratio.
 *
 * The third file is the precedent. M219's race tape is read from a stranger,
 * replayed, and **recorded nowhere**: *"the run counts for the race and for
 * nothing else, and the card says so."* This follows it exactly. Nothing here
 * writes to a store, and the page that opens one says so out loud.
 *
 * ## Facts, not records
 *
 * The file carries the report the athlete's own app computed, not the log it
 * was computed from. So a coach reads what moved and by how much, and does
 * **not** receive session dates, venues, partners, notes, photos, project
 * burns, the game, or anything else in the athlete's database.
 *
 * What it does carry, said plainly because `tapeFile.ts` sets that precedent:
 * the program's name, the block's dates, how many sessions were done, and the
 * assessment numbers themselves. Those numbers are how hard somebody trains,
 * which is the point of sending them and is worth knowing you are sending.
 *
 * ## Rebuild, never cast
 *
 * `programFile.ts`'s rule, and the reason it is the longer half of that file:
 * *"the parser is the substance and the file format is the easy part."*
 * Every field below is read individually, checked, and copied onto a fresh
 * object; sizes are capped so a file claiming forty thousand results is a
 * sentence rather than a frozen tab.
 */

import { APP_VERSION } from '@/version';
import { getMetric } from '@/content/metrics';
import type { MetricId } from '@/content/types';
import { SCHEMA_VERSION } from '@/db/schema';
import { BLOCK_OUTCOME_WORD, type BlockOutcome } from './blocks';
import type { BlockReport, Gap, Movement } from './blockReport';

/** Caps, so a hand-edited file is a sentence rather than a frozen tab. */
const LIMITS = {
  name: 120,
  label: 80,
  summary: 1200,
  results: 40,
} as const;

const MOVEMENTS: Movement[] = ['better', 'worse', 'flat'];
const GAPS: Gap[] = ['never-tested', 'once-only', 'not-a-number'];
const OUTCOMES: BlockOutcome[] = ['running', 'completed', 'left', 'unknown'];

export class BlockFileError extends Error {}

/** One assessment, as the athlete's app read it. */
export interface SharedResult {
  metricId: MetricId;
  /** Their app's spelling, so a metric this one does not ship still reads. */
  label: string;
  baseline: number | null;
  latest: number | null;
  baselineDisplay?: string;
  latestDisplay?: string;
  moved: Movement | null;
  percent: number | null;
  steps: number | null;
  gap: Gap | null;
}

export interface SharedBlock {
  program: string;
  from: string;
  through: string;
  /** Weeks actually run, which is not the program's length on a block left. */
  weeksRun: number;
  outcome: BlockOutcome;
  /** Sessions done in the window, and how many the plan placed. */
  sessions: number | null;
  planned: number | null;
  better: number;
  worse: number;
  flat: number;
  untested: number;
  results: SharedResult[];
  /** The sentence their app wrote. Carried, not recomputed — see below. */
  summary: string;
}

export interface BlockFile {
  app: 'project-ascent';
  kind: 'block';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  block: SharedBlock;
}

export interface BlockFileInput {
  report: BlockReport;
  outcome: BlockOutcome;
  weeksRun: number;
  sessions: number | null;
  planned: number | null;
  /** `describeBlock(report)`, passed rather than called. */
  summary: string;
}

/**
 * The file.
 *
 * The summary sentence is **carried rather than recomputed** on the far
 * side. `describeBlock` needs the whole `Program` to write one, which a file
 * that deliberately does not ship the athlete's program cannot supply — and
 * the sentence is theirs anyway: it is what their app told them, and a coach
 * reading a different sentence from the same numbers is reading a different
 * report.
 */
export function buildBlockFile(input: BlockFileInput): BlockFile {
  const { report } = input;
  return {
    app: 'project-ascent',
    kind: 'block',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    block: {
      program: report.program.name,
      from: report.from,
      through: report.through,
      weeksRun: input.weeksRun,
      outcome: input.outcome,
      sessions: input.sessions,
      planned: input.planned,
      better: report.better,
      worse: report.worse,
      flat: report.flat,
      untested: report.untested,
      results: report.results.slice(0, LIMITS.results).map((r) => ({
        metricId: r.metric.id,
        label: r.metric.label,
        baseline: r.baseline?.value ?? null,
        latest: r.latest?.value ?? null,
        ...(r.baseline?.display ? { baselineDisplay: r.baseline.display } : {}),
        ...(r.latest?.display ? { latestDisplay: r.latest.display } : {}),
        moved: r.moved,
        percent: r.percent,
        steps: r.steps,
        gap: r.gap,
      })),
      summary: input.summary,
    },
  };
}

export function blockFileName(block: { program: string; through: string }): string {
  const slug = block.program.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'block'}-${block.through}.ascent-block.json`;
}

/** What the coach's own app calls a metric, falling back to the sender's. */
export function labelFor(result: SharedResult): string {
  return getMetric(result.metricId)?.label ?? result.label;
}

/** The outcome in words, from the one table both sides read. */
export function outcomeWord(outcome: BlockOutcome): string {
  return BLOCK_OUTCOME_WORD[outcome];
}

export function parseBlockFile(text: string): SharedBlock {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BlockFileError('That file is not readable JSON.');
  }
  const file = asRecord(raw);
  if (file === null) throw new BlockFileError('That file does not contain a block.');
  if (file['app'] !== 'project-ascent' || file['kind'] !== 'block') {
    throw new BlockFileError('That is not a Project Ascent block file.');
  }
  const version = file['schemaVersion'];
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    throw new BlockFileError(
      `That block was written by a newer version of the app (v${version}). Update, then open it.`,
    );
  }
  const body = asRecord(file['block']);
  if (body === null) throw new BlockFileError('That file has no block in it.');

  const results = list(body['results'], LIMITS.results)
    .map(readResult)
    .filter((r): r is SharedResult => r !== null);

  return {
    program: str(body['program'], LIMITS.name) || 'Their block',
    from: date(body['from']),
    through: date(body['through']),
    weeksRun: whole(body['weeksRun'], 0, 520),
    outcome: pick(body['outcome'], OUTCOMES, 'unknown'),
    sessions: countOrNull(body['sessions']),
    planned: countOrNull(body['planned']),
    better: whole(body['better'], 0, LIMITS.results),
    worse: whole(body['worse'], 0, LIMITS.results),
    flat: whole(body['flat'], 0, LIMITS.results),
    untested: whole(body['untested'], 0, LIMITS.results),
    results,
    summary: str(body['summary'], LIMITS.summary),
  };
}

// ── Readers ───────────────────────────────────────────────────────────────

function readResult(value: unknown): SharedResult | null {
  const raw = asRecord(value);
  if (raw === null) return null;
  const id = typeof raw['metricId'] === 'string' ? raw['metricId'] : '';
  const label = str(raw['label'], LIMITS.label);
  // A result that names nothing is a row with no question on it. The id may
  // be one this app does not ship — a sender on a newer version — which is
  // why the sender's label is carried and why this does not check it against
  // the registry.
  if (id === '' && label === '') return null;
  return {
    metricId: id as MetricId,
    label,
    baseline: finite(raw['baseline']),
    latest: finite(raw['latest']),
    ...(str(raw['baselineDisplay'], LIMITS.label)
      ? { baselineDisplay: str(raw['baselineDisplay'], LIMITS.label) }
      : {}),
    ...(str(raw['latestDisplay'], LIMITS.label)
      ? { latestDisplay: str(raw['latestDisplay'], LIMITS.label) }
      : {}),
    moved: MOVEMENTS.includes(raw['moved'] as Movement) ? (raw['moved'] as Movement) : null,
    percent: finite(raw['percent']),
    steps: finite(raw['steps']),
    gap: GAPS.includes(raw['gap'] as Gap) ? (raw['gap'] as Gap) : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function list(value: unknown, cap: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, cap) : [];
}

function str(value: unknown, cap: number): string {
  return typeof value === 'string' ? value.trim().slice(0, cap) : '';
}

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** A finite number, or null. `NaN` and `Infinity` both read as absent. */
function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function whole(value: unknown, min: number, max: number): number {
  const n = finite(value);
  if (n === null) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function countOrNull(value: unknown): number | null {
  const n = finite(value);
  return n === null ? null : Math.max(0, Math.round(n));
}

/** An ISO day, or the empty string. Never a Date: this is only ever shown. */
function date(value: unknown): string {
  const text = str(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}
