/**
 * Assessment maths: parse a result, read a series, decide what is due.
 *
 * Every metric reduces to one numeric series so the chart, the change
 * indicator and the plateau engine treat them uniformly — the per-kind
 * awkwardness (a grade is a ladder position, a pass/fail is a bit) is
 * absorbed here, once, at the parse boundary.
 *
 * Pure: registry and records in, verdicts out.
 *
 * What is due and what changed are in `assessmentStatus.ts` (PLAN.md M341):
 * this module is in the first load, for the parser and the test weeks, and
 * only lazy pages and the coach ever ask for a status.
 */

import { METRICS } from '@/content/metrics';
import type { Metric, MetricId, Program } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { fromInput, toDisplay, unitWord, type UnitSystem } from './units';
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
  const value = toDisplay(entry.value, metric.unit, units);
  const label = unitWord(metric.unit, units, value);
  return label ? `${trim(value)} ${label}` : trim(value);
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

/**
 * The weeks a program expects you to test in (PLAN.md M67).
 *
 * Every program declares `assessments` and nothing ever put one on a date.
 * The app already knew when a test was *due* — no baseline, a new phase
 * since the last one, or eight weeks stale — but a climber only found out by
 * visiting the assessments page, or afterwards, from the coach saying they
 * were late.
 *
 * The weeks are the ones the existing rules already key off, so the calendar
 * and the assessments page cannot disagree: **week one**, because a block
 * without a before has no after; **the first week of every later phase**,
 * which is exactly when `assessmentStatus` starts reporting `phase`; and
 * **the last week**, which is the after.
 *
 * Logging modes are left alone. They have no periodisation and no finish
 * line, so a test week in one would be a date chosen by nothing.
 */
export type TestReason = 'baseline' | 'phase' | 'final';

export function testWeeks(program: Program): { week: number; why: TestReason }[] {
  if (program.kind === 'mode' || program.assessments.length === 0) return [];

  const weeks = new Map<number, TestReason>();
  // Later writes lose to earlier ones: a week that is both the start of a
  // phase and the end of the block is the phase test, which is the one with
  // something to compare against.
  const claim = (week: number, why: TestReason) => {
    if (week >= 1 && week <= program.weeks && !weeks.has(week)) weeks.set(week, why);
  };

  claim(1, 'baseline');
  for (const phase of program.phases) claim(phase.weekStart, 'phase');
  claim(program.weeks, 'final');

  return [...weeks.entries()]
    .map(([week, why]) => ({ week, why }))
    .sort((a, b) => a.week - b.week);
}

/** What to call a test week, in the climber's words. */
export const TEST_REASON_LABEL: Record<TestReason, string> = {
  baseline: 'Baseline week — measure before the block starts moving.',
  phase: 'Test week — a new phase, so the numbers are worth taking again.',
  final: 'Final week — the after, to put beside the before.',
};

/** Every metric in the registry, for adding one outside your program. */
export function allMetrics(): Metric[] {
  return Object.values(METRICS).sort((a, b) => a.label.localeCompare(b.label));
}
