/**
 * What the block was trying to move, and what actually moved (PLAN.md M84).
 *
 * Every program declares `assessments`, M67 put those tests on weeks, and
 * the builder's Benchmarks card says the retests exist "so the strength
 * curve has something to draw" — and then each number was drawn alone, on
 * its own page, against *its own previous reading*. `changeOf` compares the
 * last two entries, which answers "did it move since last time" and never
 * "did this block move it".
 *
 * ## One axis, but not for everything
 *
 * M84 asks for the numbers "normalised so a hang in seconds and a pull-up
 * count share one axis". They can: both are ratio-scale quantities and
 * percent change is the honest unit for them. The batteries are not all
 * like that, and pretending otherwise would be the whole point of the chart
 * inverted:
 *
 * - **Grades are ordinal.** V4 to V5 is one step on a ladder, not "+25%".
 *   Nine of the eleven batteries carry at least one grade metric, so this
 *   is not an edge case, and they are reported in steps.
 * - **Pass/fail is not a quantity.** Three metrics are `passfail`, stored
 *   as 0 or 1; "+100%" is a way of saying "started passing" that nobody
 *   would choose.
 * - **One metric is text.** Iron Grip assesses `core_lever`, which
 *   `isChartable` already refuses. It is listed, not measured.
 * - **A baseline of zero has no percent.** Starting at nought pull-ups and
 *   reaching three is real progress and an undefined percentage.
 *
 * ## Direction, not magnitude
 *
 * Two of the assessed metrics — `toe_touch` and `min_edge` — are
 * `higherIsBetter: false`. Every sign here is flipped through that flag, so
 * "moved" means "got better" on both kinds of scale rather than "went up".
 */

import { getMetric } from '@/content/metrics';
import type { Metric, MetricId, Program } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { addDays } from './dates';
import { blockThrough, blockWindow } from './plan';
import { seriesFor } from './assessments';
import { testWeeks, type TestReason } from './testWeeks';
import { signed } from './assessmentStatus';
import type { UnitSystem } from './units';
import { joinCapped } from './phrase';

export type Movement = 'better' | 'worse' | 'flat';

/** Why a metric has no comparison this block. */
export type Gap = 'never-tested' | 'once-only' | 'not-a-number';

export interface TestWindow {
  week: number;
  why: TestReason;
  from: string;
  to: string;
}

export interface AssessmentResult {
  metric: Metric;
  /** Readings inside the block, oldest first. */
  points: MetricEntry[];
  baseline: MetricEntry | null;
  latest: MetricEntry | null;
  moved: Movement | null;
  /**
   * Percent change from baseline, signed so positive is an improvement.
   * Null for anything that is not a ratio-scale quantity, and for a
   * baseline of zero. This is the only field the shared axis may use.
   */
  percent: number | null;
  /** Ladder steps, signed so positive is an improvement. Grades only. */
  steps: number | null;
  /** Nothing to compare, and why. Null when there is a comparison. */
  gap: Gap | null;
  /**
   * The change is exactly the band's width (PLAN.md M370): one plate, one
   * rep. `moved` still says which way, so it counts as trained where the
   * direction is what matters; the counts and the words call it light.
   */
  light: boolean;
}

export interface BlockReport {
  program: Program;
  /** The block's own window: week one's Sunday to the last day of the last week. */
  from: string;
  to: string;
  /** The last day the report covers — the block's end, or today if sooner. */
  through: string;
  finished: boolean;
  /**
   * Whether a reading taken today can still count (PLAN.md M366): false
   * once the block has ended or the climber has left it, because `through`
   * is then behind today and a new reading falls outside it.
   */
  closed: boolean;
  tests: TestWindow[];
  results: AssessmentResult[];
  /** Those whose change can share the percent axis. */
  comparable: AssessmentResult[];
  /** Improved by more than the band. */
  better: number;
  /** Went the other way by more than the band. */
  worse: number;
  flat: number;
  /** Improved by exactly the band: light progress (PLAN.md M370). */
  lightBetter: number;
  /** Went the other way by exactly the band: a light decline. */
  lightWorse: number;
  /** Declared assessments with no comparison this block. */
  untested: number;
}

export interface BlockInput {
  program: Program;
  /** The date the climber started it. */
  startDate: string;
  entries: readonly MetricEntry[];
  today: string;
  /** The day the climber left it, if they did; nothing after counts (PLAN.md M365). */
  until?: string | null | undefined;
  /**
   * The first day it covers, when that is not its window's (PLAN.md M369):
   * a run picked up again moved its start, and its first weeks — the
   * baseline among them — are before its window now.
   */
  since?: string | undefined;
}

/**
 * The report, or null when the program has no block to report on.
 *
 * A logging mode declares assessments but has no periodisation, so
 * `testWeeks` returns nothing for one — and a "block report" over a
 * fifty-two week mode with no finish line would be a window chosen by
 * nothing.
 */
export function blockReport(input: BlockInput): BlockReport | null {
  const tests = testWeeks(input.program);
  if (tests.length === 0) return null;

  const { from: first, to } = blockWindow(input.program, input.startDate);
  const from = input.since ?? first;
  const through = blockThrough(to, input.today, input.until);
  if (through < from) return null;

  const windows: TestWindow[] = tests.map((test) => {
    // The window's own weeks: a run picked up again counts its test weeks
    // from where its start is now, not from the first week it covers.
    const start = addDays(first, (test.week - 1) * 7);
    return { week: test.week, why: test.why, from: start, to: addDays(start, 6) };
  });

  const results = input.program.assessments.map((id) =>
    resultFor(id, [...input.entries], from, through),
  );

  return {
    program: input.program,
    from,
    to,
    through,
    finished: input.today > to,
    closed: through < input.today,
    tests: windows,
    results,
    comparable: results.filter((r) => r.percent !== null),
    better: results.filter((r) => r.moved === 'better' && !r.light).length,
    worse: results.filter((r) => r.moved === 'worse' && !r.light).length,
    flat: results.filter((r) => r.moved === 'flat').length,
    lightBetter: results.filter((r) => r.moved === 'better' && r.light).length,
    lightWorse: results.filter((r) => r.moved === 'worse' && r.light).length,
    untested: results.filter((r) => r.gap !== null).length,
  };
}

function resultFor(
  id: MetricId,
  entries: MetricEntry[],
  from: string,
  through: string,
): AssessmentResult {
  // A metric the catalogue no longer carries: named by the program and
  // unresolvable, which a stale content edit can produce.
  const metric = getMetric(id) ?? {
    id,
    label: id,
    unit: '',
    kind: 'text' as const,
    higherIsBetter: true,
    // Nowhere to take it, since nothing knows what it was.
    place: 'tally' as const,
  };

  const points = seriesFor(entries, id).filter((e) => e.date >= from && e.date <= through);
  const baseline = points[0] ?? null;
  const latest = points.length > 1 ? points[points.length - 1]! : null;

  const empty = { metric, points, baseline, latest, moved: null, percent: null, steps: null, light: false };
  if (metric.kind === 'text') return { ...empty, gap: 'not-a-number' };
  if (baseline === null) return { ...empty, gap: 'never-tested' };
  if (latest === null) return { ...empty, gap: 'once-only' };

  const delta = latest.value - baseline.value;
  const signed = metric.higherIsBetter ? delta : -delta;
  const band = bandFor(metric, baseline.value, delta);
  const moved: Movement = band === 'held' ? 'flat' : signed > 0 ? 'better' : 'worse';

  return {
    metric,
    points,
    baseline,
    latest,
    moved,
    // Ordinal and pass/fail scales have no percentage, and neither does a
    // baseline of zero — see the note at the top.
    percent:
      metric.kind === 'number' && baseline.value !== 0
        ? (signed / Math.abs(baseline.value)) * 100
        : null,
    steps: metric.kind === 'grade' ? signed : null,
    gap: null,
    light: band === 'edge',
  };
}

/**
 * Where a change falls against the metric's band for noise (PLAN.md M367,
 * M370).
 *
 * Every difference used to count: 40 to 40.5 lbs on a max hang *improved*,
 * 60 to 59 seconds on a dead hang *went the other way*, and the counts, the
 * share card, the coach's file and the order of what comes next all
 * followed. The coach's answer was that small changes are held, and the
 * bands are theirs (`content/metrics.ts`). Inside the band is `held`.
 * Exactly the band's width — one plate, one rep — is the `edge`, which the
 * coach called light progress, or a light decline (M370); M367 had held it.
 * Grades and pass/fail have no band — one step on a ladder, or a pass where
 * there was a fail, is already the smallest real change — and a number
 * metric without one counts any change.
 */
export function bandFor(metric: Metric, baseline: number, delta: number): 'held' | 'edge' | 'beyond' {
  const size = Math.abs(delta);
  const band = metric.kind === 'number' ? metric.held : undefined;
  if (band === undefined) return size === 0 ? 'held' : 'beyond';
  const within = 'abs' in band ? band.abs : Math.max(band.atLeast, (Math.abs(baseline) * band.pct) / 100);
  // Readings are decimals, so the edge is a tolerance rather than equality:
  // 33 × 10% is 3.3, and 36.3 − 33 is 3.2999999999999972.
  if (size === 0) return 'held';
  if (within > 0 && Math.abs(size - within) < 1e-9) return 'edge';
  return size < within ? 'held' : 'beyond';
}

/** A change inside the band, which reads as held. */
export function held(metric: Metric, baseline: number, delta: number): boolean {
  return bandFor(metric, baseline, delta) === 'held';
}

/** When a baseline with no retest can still get one (PLAN.md M366). */
export type RetestWhen =
  /** In a test week now, or with none left before the block ends. */
  | { when: 'now'; window: TestWindow | null }
  /** At the next test week, which has not come yet. */
  | { when: 'later'; window: TestWindow }
  /** Never, for this block: it has ended or been left. */
  | { when: 'over' };

/**
 * When the retests a block is owed can be taken (PLAN.md M366).
 *
 * The card under the report said *"Taking them now is what turns the block
 * into a measurement"* whatever the block's state. On a block that had
 * ended, a reading taken now falls outside it and changes nothing; in week
 * two of twelve, it sat under the sentence saying the test weeks are when
 * to take them. Any test week after the baseline is a retest — a phase
 * test is compared like the final one.
 */
export function retestWhen(report: BlockReport, today: string): RetestWhen {
  if (report.closed) return { when: 'over' };
  const next = report.tests.find((t) => t.why !== 'baseline' && t.to >= today);
  if (next === undefined) return { when: 'now', window: null };
  return next.from <= today ? { when: 'now', window: next } : { when: 'later', window: next };
}

/**
 * "V5", "3 sec", "Pass" — the change in the metric's own terms, and in the
 * climber's units (PLAN.md M341): it printed the stored unit, so a block's
 * weighted pull-up read *"+10 BW+lbs"* to a climber reading in kilograms.
 */
export function movementLabel(result: AssessmentResult, units: UnitSystem = 'imperial'): string {
  const { metric, baseline, latest } = result;
  if (baseline === null || latest === null) return '—';

  if (metric.kind === 'passfail') {
    const was = baseline.value > 0;
    const now = latest.value > 0;
    if (was === now) return now ? 'still passing' : 'still failing';
    return now ? 'now passing' : 'now failing';
  }
  if (metric.kind === 'grade') {
    const steps = Math.abs(result.steps ?? 0);
    if (steps === 0) return 'same grade';
    return `${result.steps! > 0 ? '+' : '−'}${steps} grade${steps === 1 ? '' : 's'}`;
  }
  const delta = latest.value - baseline.value;
  if (delta === 0) return 'no change';
  return signed(delta, metric.unit, units);
}

/** A sentence starts in capitals, which a count spelled out does not (PLAN.md M368). */
function opening(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** "one", "two"… up to a point, because "1 of the 6" reads as a list index. */
function count(n: number): string {
  return ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] ?? String(n);
}

function names(results: AssessmentResult[], limit = 3): string {
  // A light one says so, beside the ones that moved by more (PLAN.md M370).
  return joinCapped(results.map((r) => (r.light ? `${r.metric.label} (light)` : r.metric.label)), limit);
}

/**
 * Which of the numbers this block was trying to move actually moved.
 *
 * The plain sentence M84 asks for, and it leads with the count rather than
 * the winners: a report that names three improvements and stays quiet about
 * four untested metrics is a highlight reel.
 */
export function describeBlock(report: BlockReport): string {
  const total = report.results.length;
  const compared = total - report.untested;

  if (compared === 0) {
    const once = report.results.filter((r) => r.gap === 'once-only').length;
    if (once > 0) {
      const has = `${count(once)} of the ${total} ${report.program.name} assessments ${once === 1 ? 'has' : 'have'} a baseline and no retest`;
      // Its test weeks are behind it once it is over (PLAN.md M366): this
      // said to take them there on a block that ended months ago.
      return report.closed
        ? `Nothing to compare: ${has}, and the block is over.`
        : `Nothing to compare yet: ${has}. The block's test weeks are the ones to take ${once === 1 ? 'it' : 'them'} in.`;
    }
    /**
     * `never === total` was the wrong test (PLAN.md M253).
     *
     * `gap: 'not-a-number'` is decided by the metric's **kind**, before
     * anything looks at whether a reading exists — so a battery holding one
     * text assessment can never have `never === total`, and its climber fell
     * to the sentence about *"the assessments taken so far"* having taken
     * none. Measured across the catalogue: Iron Grip is the one program of
     * thirteen with a mixed battery, nine assessments and one of them text,
     * and it is the app's flagship finger block.
     *
     * The question this branch answers is whether anything comparable was
     * taken, so it counts the comparable ones. A battery with no numbers in
     * it at all is a different fact and gets its own sentence.
     */
    const words = report.results.filter((r) => r.gap === 'not-a-number').length;
    const numeric = total - words;
    if (numeric === 0) {
      return `Nothing measurable to compare: none of the ${total} ${report.program.name} ${total === 1 ? 'assessment is a number' : 'assessments is a number'} this can put on a scale.`;
    }
    return words === 0
      ? `None of the ${total} ${report.program.name} assessments has been taken this block, so there is no before to put an after beside.`
      : `None of the ${numeric} ${report.program.name} assessments that carry a number has been taken this block, so there is no before to put an after beside.`;
  }

  const parts: string[] = [];
  // The full changes first, then the light ones (PLAN.md M370).
  const firm = (a: AssessmentResult, b: AssessmentResult) => Number(a.light) - Number(b.light);
  const moved = report.results.filter((r) => r.moved === 'better').sort(firm);
  const fell = report.results.filter((r) => r.moved === 'worse').sort(firm);

  parts.push(
    // The noun belongs to `compared`, not to `better`: "one of the 2
    // retested number" is what pluralising on the wrong count gives you.
    opening(`${count(report.better)} of the ${compared} retested ${compared === 1 ? 'number' : 'numbers'} improved${
      report.lightBetter > 0 ? `, ${count(report.lightBetter)} made light progress` : ''
    }${report.flat > 0 ? `, ${count(report.flat)} held` : ''}${
      report.worse > 0 ? `, ${count(report.worse)} went the other way` : ''
    }${report.lightWorse > 0 ? `, ${count(report.lightWorse)} had a light decline` : ''}.`),
  );
  if (moved.length > 0) parts.push(`Up: ${names(moved)}.`);
  if (fell.length > 0) parts.push(`Down: ${names(fell)}.`);
  if (report.untested > 0) {
    parts.push(
      opening(`${count(report.untested)} of the ${total} ${report.untested === 1 ? 'has' : 'have'} no comparison this block.`),
    );
  }
  return parts.join(' ');
}
