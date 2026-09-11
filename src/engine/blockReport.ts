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
import { addDays, startOfWeek } from './dates';
import { seriesFor, testWeeks, type TestReason } from './assessments';
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
}

export interface BlockReport {
  program: Program;
  /** The block's own window: week one's Sunday to the last day of the last week. */
  from: string;
  to: string;
  /** The last day the report covers — the block's end, or today if sooner. */
  through: string;
  finished: boolean;
  tests: TestWindow[];
  results: AssessmentResult[];
  /** Those whose change can share the percent axis. */
  comparable: AssessmentResult[];
  better: number;
  worse: number;
  flat: number;
  /** Declared assessments with no comparison this block. */
  untested: number;
}

export interface BlockInput {
  program: Program;
  /** The date the climber started it. */
  startDate: string;
  entries: readonly MetricEntry[];
  today: string;
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

  const from = startOfWeek(input.startDate);
  const to = addDays(from, input.program.weeks * 7 - 1);
  const through = input.today < to ? input.today : to;
  if (through < from) return null;

  const windows: TestWindow[] = tests.map((test) => {
    const start = addDays(from, (test.week - 1) * 7);
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
    tests: windows,
    results,
    comparable: results.filter((r) => r.percent !== null),
    better: results.filter((r) => r.moved === 'better').length,
    worse: results.filter((r) => r.moved === 'worse').length,
    flat: results.filter((r) => r.moved === 'flat').length,
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
  };

  const points = seriesFor(entries, id).filter((e) => e.date >= from && e.date <= through);
  const baseline = points[0] ?? null;
  const latest = points.length > 1 ? points[points.length - 1]! : null;

  const empty = { metric, points, baseline, latest, moved: null, percent: null, steps: null };
  if (metric.kind === 'text') return { ...empty, gap: 'not-a-number' };
  if (baseline === null) return { ...empty, gap: 'never-tested' };
  if (latest === null) return { ...empty, gap: 'once-only' };

  const delta = latest.value - baseline.value;
  const signed = metric.higherIsBetter ? delta : -delta;
  const moved: Movement = signed > 0 ? 'better' : signed < 0 ? 'worse' : 'flat';

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
  };
}

/** "V5", "3 sec", "Pass" — the change in the metric's own terms. */
export function movementLabel(result: AssessmentResult): string {
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
  const size = trim(Math.abs(delta));
  return `${delta > 0 ? '+' : '−'}${size}${metric.unit ? ` ${metric.unit}` : ''}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** "one", "two"… up to a point, because "1 of the 6" reads as a list index. */
function count(n: number): string {
  return ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n] ?? String(n);
}

function names(results: AssessmentResult[], limit = 3): string {
  return joinCapped(results.map((r) => r.metric.label), limit);
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
    const never = report.results.filter((r) => r.gap === 'never-tested').length;
    const once = report.results.filter((r) => r.gap === 'once-only').length;
    if (once > 0) {
      return `Nothing to compare yet: ${count(once)} of the ${total} ${report.program.name} assessments have a baseline and no retest. The block's test weeks are the ones to take them in.`;
    }
    return never === total
      ? `None of the ${total} ${report.program.name} assessments has been taken this block, so there is no before to put an after beside.`
      : `Nothing measurable to compare: the assessments taken so far are not numbers this can put on a scale.`;
  }

  const parts: string[] = [];
  const moved = report.results.filter((r) => r.moved === 'better');
  const fell = report.results.filter((r) => r.moved === 'worse');

  parts.push(
    // The noun belongs to `compared`, not to `better`: "one of the 2
    // retested number" is what pluralising on the wrong count gives you.
    `${count(report.better)} of the ${compared} retested ${compared === 1 ? 'number' : 'numbers'} improved${
      report.flat > 0 ? `, ${count(report.flat)} held` : ''
    }${report.worse > 0 ? `, ${count(report.worse)} went the other way` : ''}.`,
  );
  if (moved.length > 0) parts.push(`Up: ${names(moved)}.`);
  if (fell.length > 0) parts.push(`Down: ${names(fell)}.`);
  if (report.untested > 0) {
    parts.push(
      `${count(report.untested)} of the ${total} ${report.untested === 1 ? 'has' : 'have'} no comparison this block.`,
    );
  }
  return parts.join(' ');
}
