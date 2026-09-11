import type { Pressure } from './offline';
import { describeSpan } from './live';

/**
 * The state of your own data, on purpose (PLAN.md M80).
 *
 * **The app already tells you four of these five things — but only ever as a
 * warning.** The live bar appears when a session was left open. The storage
 * banner appears when the next write might not save. Settings prints a line
 * when a read had to drop records. Each is a good warning, and between them
 * they mean the only way to learn that nothing is wrong is to notice that
 * nothing appeared. That is not the same as being told, and it is no use at
 * all at the moment a climber actually wants to know — before taking a
 * backup, or after importing one.
 *
 * So this is the same knowledge, gathered, and stated either way. What is
 * genuinely new is small and worth naming: **nothing counted the records** (a
 * count per store existed only inside an import preview), **nothing ever
 * reported the orphan sweep** (it runs at boot and its return value is
 * discarded), and **the live bar shows stale sessions one at a time** —
 * `staleSessions(...)[0]` — so a climber with three of them fixes one and is
 * shown the next.
 *
 * Pure, with the database read next door in `db/health.ts`, the same split
 * `importPreview` uses: everything below is decided from plain numbers, so
 * the rules are testable without a database.
 */

/**
 * "1 projects record" is not English (PLAN.md M44). The store names are the
 * database's; these are the words for a person. Moved here from the settings
 * page so the page and the report cannot disagree about what a record is
 * called.
 */
export const RECORD_NOUN: Record<string, [string, string]> = {
  sessions: ['session', 'sessions'],
  projects: ['project', 'projects'],
  metrics: ['benchmark', 'benchmarks'],
  programs: ['program', 'programs'],
  media: ['photo', 'photos'],
  profile: ['setting', 'settings'],
  game: ['record', 'records'],
  meta: ['note', 'notes'],
};

/**
 * A record count with the words that agree with it.
 *
 * One place, because writing the count and its verb into the same template
 * string is how "1 photo belong to something that is gone" and "1 records
 * could not be read" both shipped — the first found in a browser, the
 * other two by the test written for the first.
 */
function records(n: number): { count: string; was: string; its: string } {
  return n === 1
    ? { count: '1 record', was: 'was', its: 'its' }
    : { count: `${n} records`, was: 'were', its: 'their' };
}

export function countOf(n: number, store: string): string {
  const [one, many] = RECORD_NOUN[store] ?? [store, store];
  return `${n} ${n === 1 ? one : many}`;
}

/** What to call each store on the page, in the order a climber cares. */
export const HEALTH_STORES = [
  'sessions',
  'projects',
  'metrics',
  'media',
  'programs',
  'game',
  'profile',
  'meta',
] as const;

export type HealthStore = (typeof HEALTH_STORES)[number];

export const STORE_TITLE: Record<HealthStore, string> = {
  sessions: 'Sessions',
  projects: 'Projects',
  metrics: 'Assessment results',
  media: 'Photos',
  programs: 'Your programs',
  game: 'Climber progress',
  profile: 'Settings and profile',
  meta: 'App bookkeeping',
};

export interface StoreRow {
  store: HealthStore;
  label: string;
  count: number;
  /** Bytes, where the app can know them. Only photos can be measured. */
  bytes?: number;
  /** Records this store's last read had to leave out. */
  dropped: number;
  /** Records read without part of their contents. */
  repaired: number;
}

export interface StaleSession {
  id: string;
  date: string;
  /** Milliseconds the clock has been running. */
  ms: number;
}

/** Something worth doing something about. */
export interface Finding {
  kind: 'unreadable' | 'repaired' | 'orphans' | 'stale' | 'storage';
  /** `warn` is losing data now; `caution` is untidy or about to. */
  tone: 'warn' | 'caution';
  headline: string;
  detail: string;
  /** Set when the tidy-up button can deal with it. */
  fixable?: boolean;
}

export interface DataHealthInput {
  counts: Partial<Record<HealthStore, number>>;
  problems: { store: string; dropped: number; repaired: number }[];
  /** Photos whose owner is gone, waiting for the next sweep. */
  orphans: { count: number; bytes: number };
  stale: StaleSession[];
  mediaBytes: number;
  pressure: Pressure | null;
}

export interface DataHealth {
  rows: StoreRow[];
  findings: Finding[];
  /** Every record the app holds, photos included. */
  total: number;
}

export function dataHealth(input: DataHealthInput): DataHealth {
  const byStore = new Map(input.problems.map((p) => [p.store, p]));

  const rows: StoreRow[] = HEALTH_STORES.map((store) => {
    const problem = byStore.get(store);
    const count = input.counts[store] ?? 0;
    return {
      store,
      label: STORE_TITLE[store],
      count,
      ...(store === 'media' ? { bytes: input.mediaBytes } : {}),
      dropped: problem?.dropped ?? 0,
      repaired: problem?.repaired ?? 0,
    };
  });

  const findings: Finding[] = [];

  // Dropped first, always: it is the only one of these that means records
  // the climber wrote are not being shown at all.
  const dropped = input.problems.filter((p) => p.dropped > 0);
  if (dropped.length > 0) {
    findings.push({
      kind: 'unreadable',
      tone: 'warn',
      headline: `${records(dropped.reduce((n, p) => n + p.dropped, 0)).count} could not be read`,
      detail: `${dropped.map((p) => countOf(p.dropped, p.store)).join(', ')}. ${REPAIR_NOTE}`,
    });
  }

  const repaired = input.problems.filter((p) => p.repaired > 0);
  if (repaired.length > 0) {
    findings.push({
      kind: 'repaired',
      tone: 'caution',
      headline: (({ count, was, its }) => `${count} ${was} read without part of ${its} contents`)(
        records(repaired.reduce((n, p) => n + p.repaired, 0)),
      ),
      detail: `${repaired.map((p) => countOf(p.repaired, p.store)).join(', ')}. ${REPAIR_NOTE}`,
    });
  }

  if (input.orphans.count > 0) {
    findings.push({
      kind: 'orphans',
      tone: 'caution',
      headline: `${countOf(input.orphans.count, 'media')} ${
        input.orphans.count === 1 ? 'belongs' : 'belong'
      } to something that is gone`,
      detail:
        'A deleted session or project leaves its photos behind for a while, so an undo can hand them back. These are past that, and tidying up will delete them.',
      fixable: true,
    });
  }

  if (input.stale.length > 0) {
    findings.push({
      kind: 'stale',
      tone: 'caution',
      headline: `${input.stale.length} session${input.stale.length === 1 ? ' was' : 's were'} left open`,
      detail:
        'The clock is still running on them, so their duration is not being counted toward your training load. Finish or discard each one in its log.',
    });
  }

  // Only when it is actually a problem: a browser that has promised not to
  // evict and has room is not a finding, it is the normal case.
  if (input.pressure && input.pressure.level !== 'fine' && input.pressure.level !== 'unknown') {
    findings.push({
      kind: 'storage',
      tone: input.pressure.level === 'full' || input.pressure.level === 'evictable' ? 'warn' : 'caution',
      headline: input.pressure.headline,
      detail: input.pressure.detail,
    });
  }

  return {
    rows,
    findings,
    total: rows.reduce((n, row) => n + row.count, 0),
  };
}

const REPAIR_NOTE =
  'This usually means a backup written by an older version of the app. Importing a newer one replaces them.';

/**
 * The one sentence Settings prints beside its import button.
 *
 * Shared rather than written twice: the warning stays where a climber is
 * already standing when it matters, and the page below shows the same
 * problem in full. Two spellings of it would drift.
 */
export function describeProblem(problem: { store: string; dropped: number; repaired: number }): string {
  const parts: string[] = [];
  if (problem.dropped > 0) {
    parts.push(
      `${countOf(problem.dropped, problem.store)} could not be read and ${problem.dropped === 1 ? 'was' : 'were'} left out.`,
    );
  }
  if (problem.repaired > 0) {
    parts.push(
      `${countOf(problem.repaired, problem.store)} ${problem.repaired === 1 ? 'was' : 'were'} missing part of ${problem.repaired === 1 ? 'its' : 'their'} contents and ${problem.repaired === 1 ? 'was' : 'were'} read without it.`,
    );
  }
  return `${parts.join(' ')} ${REPAIR_NOTE}`;
}

/**
 * The headline for the whole page.
 *
 * The point of the milestone: when there is nothing wrong it says so, rather
 * than showing an empty space that could equally mean the checks did not run.
 */
export function describeHealth(health: DataHealth): string {
  if (health.findings.length === 0) {
    return `${health.total.toLocaleString()} records, all readable. Nothing needs attention.`;
  }
  const worst = health.findings.some((f) => f.tone === 'warn');
  return `${health.total.toLocaleString()} records. ${health.findings.length} thing${
    health.findings.length === 1 ? '' : 's'
  } worth ${worst ? 'looking at now' : 'knowing about'}.`;
}

/** How long a stale session has been open, for a list of them. */
export function describeStale(session: StaleSession): string {
  return describeSpan(session.ms);
}
