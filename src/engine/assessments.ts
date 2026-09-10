/**
 * Assessment maths: parse a result, read a series, decide what is due.
 *
 * Every metric reduces to one numeric series so the chart, the change
 * indicator and the plateau engine treat them uniformly — the per-kind
 * awkwardness (a grade is a ladder position, a pass/fail is a bit) is
 * absorbed here, once, at the parse boundary.
 *
 * Pure: registry and records in, verdicts out.
 */

import { getMetric, METRICS } from '@/content/metrics';
import { phaseForWeek, type Metric, type MetricId, type Program } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { addDays, daysBetween, programWeek, today as todayKey } from './dates';
import { fromInput, toDisplay, unitLabel, type UnitSystem } from './units';
import {
  DEFAULT_DISPLAY,
  V_GRADES,
  YDS_GRADES,
  canonicalGrade,
  displayGrade,
  gradeOrdinal,
  type GradeDisplay,
} from './grades';

/** How long a result stands before it is worth retesting off-program. */
export const STALE_DAYS = 56;

export type ParseResult =
  | { ok: true; value: number; display?: string }
  | { ok: false; error: string };

export function parseMetricInput(
  metric: Metric,
  raw: string,
  units: UnitSystem = 'imperial',
): ParseResult {
  const text = raw.trim();
  if (text === '') return { ok: false, error: 'Enter a result.' };

  switch (metric.kind) {
    case 'grade': {
      const scale = metric.scale ?? 'V';
      const grade = canonicalGrade(scale, text);
      if (grade === null) return { ok: false, error: `${text} is not on the ${scale} ladder.` };
      return { ok: true, value: gradeOrdinal(scale, grade), display: grade };
    }
    case 'passfail': {
      const yes = /^(pass|p|yes|y|true|1)$/i.test(text);
      const no = /^(fail|f|no|n|false|0)$/i.test(text);
      if (!yes && !no) return { ok: false, error: 'Enter pass or fail.' };
      return { ok: true, value: yes ? 1 : 0, display: yes ? 'Pass' : 'Fail' };
    }
    case 'text':
      return { ok: true, value: 0, display: text };
    case 'number': {
      const n = Number(text);
      if (!Number.isFinite(n)) return { ok: false, error: 'Enter a number.' };
      // A climber reading in kilograms types kilograms; storage is imperial.
      return { ok: true, value: fromInput(n, metric.unit, units) };
    }
  }
}

export function formatEntry(
  metric: Metric,
  entry: MetricEntry,
  display: GradeDisplay = DEFAULT_DISPLAY,
  units: UnitSystem = 'imperial',
): string {
  // A grade metric stores its canonical ladder string; the climber may read
  // a different notation, and this is the one place that knows both.
  if (metric.kind === 'grade') {
    const grade = entry.display ?? (metric.scale === 'YDS' ? YDS_GRADES : V_GRADES)[entry.value];
    return grade === undefined ? trim(entry.value) : displayGrade(metric.scale ?? 'V', grade, display);
  }
  if (entry.display !== undefined) return entry.display;
  // Weight and length are stored imperial and read either way (M48). The
  // number and its label have to move together, or 60 lbs becomes "60 kg".
  const shown = trim(toDisplay(entry.value, metric.unit, units));
  const label = unitLabel(metric.unit, units);
  return label ? `${shown} ${label}` : shown;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Whether a metric's value is meaningful on a chart. */
export function isChartable(metric: Metric): boolean {
  return metric.kind !== 'text';
}

export function seriesFor(entries: MetricEntry[], metricId: MetricId): MetricEntry[] {
  return entries.filter((e) => e.metricId === metricId).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface Change {
  delta: number;
  /** Null for grades and pass/fail, where a percentage is meaningless. */
  percent: number | null;
  /** Null when the metric cannot improve in a numeric sense (text). */
  improved: boolean | null;
  label: string;
}

export function changeOf(metric: Metric, series: MetricEntry[]): Change | null {
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

  const percent = previous.value === 0 ? null : (delta / Math.abs(previous.value)) * 100;
  return {
    delta,
    percent,
    improved: better,
    label: `${delta > 0 ? '+' : '−'}${trim(Math.abs(delta))}${metric.unit ? ` ${metric.unit}` : ''}`,
  };
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
  const change = changeOf(metric, series);

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

/** Every metric in the registry, for adding one outside your program. */
export function allMetrics(): Metric[] {
  return Object.values(METRICS).sort((a, b) => a.label.localeCompare(b.label));
}
