/**
 * What is due, and what the last reading changed.
 *
 * Out of `assessments.ts` (PLAN.md M341), which is in the first load for its
 * parser, its series and its test weeks. Nothing in the first load asks for
 * a status: the coach, the benchmark pages and Progress do, and all of them
 * are lazy. Moved, these stop costing every climber who opens the app, and
 * `changeOf` could take the units it had been printing wrong.
 */

import { getMetric } from '@/content/metrics';
import { phaseForWeek, type Metric, type MetricId, type Program } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { STALE_DAYS, seriesFor } from './assessments';
import { addDays, daysBetween, programWeek, today as todayKey } from './dates';
import { isAddedWeight, toDisplay, unitWord, type UnitSystem } from './units';

export interface Change {
  delta: number;
  /**
   * Null for grades, pass/fail and added weight, where a percentage is
   * meaningless or wrong (PLAN.md M234).
   *
   * The third was a bug rather than a gap. A `BW+lbs` metric stores the
   * plate, not the load, so thirty pounds becoming thirty-three is ten per
   * cent of what is recorded and about two per cent of what the fingers
   * hold — and *"Max Hang 20mm 7s improved: +3 BW+lbs (10%)"* is what the
   * coach said about it. The number was six times the truth.
   *
   * The delta is untouched, because the delta is right: three pounds more is
   * three pounds more however much the climber weighs.
   */
  percent: number | null;
  /** Null when the metric cannot improve in a numeric sense (text). */
  improved: boolean | null;
  label: string;
}

/**
 * What the last reading changed, in the climber's units (PLAN.md M341).
 *
 * The label printed the stored unit, so a climber reading in kilograms saw
 * *"13.6 BW+kg"* on the benchmark row and *"+10 BW+lbs"* beside it — M48's
 * *"the number and its label have to move together"*, broken one line
 * below the number that keeps it. And *"+1 reps"*.
 */
export function changeOf(metric: Metric, series: MetricEntry[], units: UnitSystem = 'imperial'): Change | null {
  if (series.length < 2 || metric.kind === 'text') return null;
  const latest = series.at(-1)!;
  const previous = series.at(-2)!;
  const delta = latest.value - previous.value;
  if (delta === 0) return { delta: 0, percent: 0, improved: null, label: 'no change' };

  const better = metric.higherIsBetter ? delta > 0 : delta < 0;

  if (metric.kind === 'grade') {
    const steps = Math.abs(delta);
    return {
      delta,
      percent: null,
      improved: better,
      label: `${delta > 0 ? '+' : '−'}${steps} grade${steps === 1 ? '' : 's'}`,
    };
  }
  if (metric.kind === 'passfail') {
    return { delta, percent: null, improved: better, label: delta > 0 ? 'now passing' : 'now failing' };
  }

  // A percentage of added weight is a percentage of the wrong number: the
  // climber is most of the load and this app has never known their weight.
  const percent =
    previous.value === 0 || isAddedWeight(metric.unit)
      ? null
      : (delta / Math.abs(previous.value)) * 100;
  return {
    delta,
    percent,
    improved: better,
    label: signed(delta, metric.unit, units),
  };
}

/** A difference with its sign and unit: *"+1.4 BW+kg"*, *"−1 rep"*. */
export function signed(delta: number, unit: string, units: UnitSystem): string {
  const size = toDisplay(Math.abs(delta), unit, units);
  const word = unitWord(unit, units, size);
  return `${delta > 0 ? '+' : '−'}${trim(size)}${word ? ` ${word}` : ''}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export type DueReason = 'baseline' | 'phase' | 'stale' | null;

export interface AssessmentStatus {
  metric: Metric;
  series: MetricEntry[];
  latest: MetricEntry | null;
  change: Change | null;
  due: DueReason;
  /** Why it is due, in words. Null when it is not. */
  dueLabel: string | null;
  daysSince: number | null;
}

export interface AssessmentContext {
  program?: Program | undefined;
  startDate?: string | undefined;
  today?: string;
  /** What the change is said in (PLAN.md M341). Imperial, as stored, when absent. */
  units?: UnitSystem;
}

/**
 * Status for one metric.
 *
 * Three ways to become due, checked in order of specificity: never tested
 * (a baseline), not tested since the current training phase began (the
 * phase changed what you are training, so the old number describes a
 * different climber), or simply old.
 */
export function assessmentStatus(
  metricId: MetricId,
  entries: MetricEntry[],
  context: AssessmentContext = {},
): AssessmentStatus | null {
  const metric = getMetric(metricId);
  if (!metric) return null;

  const today = context.today ?? todayKey();
  const series = seriesFor(entries, metricId);
  const latest = series.at(-1) ?? null;
  const change = changeOf(metric, series, context.units);

  if (latest === null) {
    return { metric, series, latest, change, due: 'baseline', dueLabel: 'No baseline yet', daysSince: null };
  }

  const daysSince = Math.max(0, daysBetween(latest.date, today));
  const phase = currentPhaseStart(metricId, context, today);
  if (phase && latest.date < phase.start) {
    return {
      metric,
      series,
      latest,
      change,
      due: 'phase',
      dueLabel: `Not tested since ${phase.name} began`,
      daysSince,
    };
  }
  if (daysSince >= STALE_DAYS) {
    return {
      metric,
      series,
      latest,
      change,
      due: 'stale',
      dueLabel: `Last tested ${Math.round(daysSince / 7)} weeks ago`,
      daysSince,
    };
  }
  return { metric, series, latest, change, due: null, dueLabel: null, daysSince };
}

/**
 * When the program's current phase began — but only for a metric the
 * program actually asks for. A benchmark you measured once on your own is
 * not made obsolete by someone else's phase boundary, so it falls through
 * to the plain staleness rule instead of nagging every four weeks.
 */
function currentPhaseStart(
  metricId: MetricId,
  context: AssessmentContext,
  today: string,
): { name: string; start: string } | null {
  const { program, startDate } = context;
  if (!program || !startDate) return null;
  if (!program.assessments.includes(metricId)) return null;
  const week = programWeek(startDate, today, program.weeks);
  if (week === null) return null;
  const phase = phaseForWeek(program, week);
  if (!phase) return null;
  return { name: phase.name, start: addDays(startDate, (phase.weekStart - 1) * 7) };
}

/**
 * The battery for a program, plus anything you have measured before.
 *
 * Metrics you once tested stay on the list even after switching programs —
 * dropping them would break the continuous history the global registry
 * exists to provide.
 */
export function assessmentBattery(
  entries: MetricEntry[],
  context: AssessmentContext = {},
): AssessmentStatus[] {
  const ids = new Set<MetricId>(context.program?.assessments ?? []);
  for (const entry of entries) ids.add(entry.metricId);

  const statuses = [...ids]
    .map((id) => assessmentStatus(id, entries, context))
    .filter((s): s is AssessmentStatus => s !== null);

  const inProgram = new Set<MetricId>(context.program?.assessments ?? []);
  const dueRank: Record<Exclude<DueReason, null> | 'none', number> = { phase: 0, baseline: 1, stale: 2, none: 3 };

  return statuses.sort((a, b) => {
    const byDue = dueRank[a.due ?? 'none'] - dueRank[b.due ?? 'none'];
    if (byDue !== 0) return byDue;
    const byProgram = Number(inProgram.has(b.metric.id)) - Number(inProgram.has(a.metric.id));
    if (byProgram !== 0) return byProgram;
    return a.metric.label.localeCompare(b.metric.label);
  });
}
