/**
 * The first-run battery, and what the answers become (PLAN.md §9.5, M35,
 * M85, M99b).
 *
 * Out of `onboarding.ts` (PLAN.md M344): the profile store reads a stored
 * baseline at boot, which keeps the answers' shape in the first load; the
 * questions, their conversion to metric entries and the finder's input are
 * read only by onboarding, the finder and the benchmark pages. The rule —
 * **the baseline seeds what it can measure, and nothing it cannot** — is
 * `onboarding.ts`'s, and holds here.
 */

import { METRICS } from '@/content/metrics';
import type { Equipment, MetricId } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { parseMetricInput } from './assessments';
import type { FinderInput } from './finder';
import { gradeOrdinal, type GradeScale } from './grades';
import type { BaselineAnswers } from './onboarding';

export interface BenchmarkPrompt {
  metricId: MetricId;
  /** Asked only when the climber has this to hand. */
  requires?: Equipment;
  /**
   * How to *type* the answer, where the number needs a convention (PLAN.md
   * M99b).
   *
   * This used to be `how`: a second copy of `Metric.description`, written
   * here and shown only during onboarding. Six of the eight said the same
   * thing as the registry in slightly different words, and had already
   * drifted — one wrote "20 mm", the other "20mm". What the registry could
   * not say was the *entry* rule, and that is the half worth keeping: a
   * climber typing a max hang on `/assessments` was never told that zero
   * means bodyweight and that negatives are allowed.
   *
   * So the test is described once, in the registry, and this says only what
   * is true of the box you type into — which means it belongs on the
   * assessments form too, and now appears there.
   */
  entry?: string;
  /** Shown in the empty field, so the expected unit is never a guess. */
  hint: string;
}

/** The entry convention for a metric, wherever its number is typed. */
export function entryNote(metricId: MetricId): string | undefined {
  return BENCHMARKS.find((b) => b.metricId === metricId)?.entry;
}

/**
 * The battery. Short on purpose: every question here is one a climber can
 * answer in a gym in ten minutes, and any of them can be skipped. Metrics
 * that only mean something inside a program (repeaters, min edge, density
 * hangs) are left to that program's own assessment schedule.
 */
export const BENCHMARKS: BenchmarkPrompt[] = [
  {
    metricId: 'max_hang_20mm_7s',
    requires: 'hangboard',
    entry: 'Enter 0 if bodyweight is your limit, and a negative number if you take weight off.',
    hint: '0',
  },
  { metricId: 'max_pullups', hint: '8' },
  { metricId: 'weighted_pullup_3rm', requires: 'gym', hint: '25' },
  { metricId: 'arc_duration', requires: 'wall', hint: '15' },
  {
    metricId: 'toe_touch',
    entry: 'Enter 0 if you reach the floor. Lower is better, so a smaller number is a better result.',
    hint: '3',
  },
  { metricId: 'wall_angel', entry: 'Pass or fail.', hint: 'pass' },
  { metricId: 'box_jump_height', hint: '24' },
  {
    metricId: 'flexibility',
    entry: 'Score yourself out of 10, where 1 is "cannot high-step" and 10 is "drop knee, heel hook, anything".',
    hint: '5',
  },
];

/** The battery minus anything the climber has no way to test. */
export function benchmarksFor(equipment: readonly Equipment[]): BenchmarkPrompt[] {
  return BENCHMARKS.filter((b) => !b.requires || equipment.includes(b.requires));
}

/** The grade questions, which live on their own step but store as metrics. */
export const GRADE_METRICS = {
  boulder: 'max_boulder_grade',
  sport: 'max_sport_grade',
} as const satisfies Record<string, MetricId>;

/**
 * Everything answered, as dated metric entries. Anything blank or
 * unparseable is dropped rather than guessed at — a baseline that invents a
 * number is worse than one with a gap in it.
 */
export function baselineEntries(answers: BaselineAnswers, date: string): MetricEntry[] {
  const raw: [MetricId, string][] = [
    [GRADE_METRICS.boulder, answers.boulderGrade],
    [GRADE_METRICS.sport, answers.sportGrade],
    ...BENCHMARKS.map((b): [MetricId, string] => [b.metricId, answers.benchmarks[b.metricId] ?? '']),
  ];

  const out: MetricEntry[] = [];
  for (const [metricId, text] of raw) {
    if (text.trim() === '') continue;
    const metric = METRICS[metricId];
    if (!metric) continue;
    const parsed = parseMetricInput(metric, text);
    if (!parsed.ok) continue;
    out.push({
      metricId,
      date,
      value: parsed.value,
      ...(parsed.display !== undefined ? { display: parsed.display } : {}),
    });
  }
  return out;
}

/** How many of the questions were actually answered. */
export function answeredCount(answers: BaselineAnswers, equipment: readonly Equipment[]): number {
  return baselineEntries(answers, '2000-01-01').filter((e) => {
    const prompt = BENCHMARKS.find((b) => b.metricId === e.metricId);
    return !prompt || benchmarksFor(equipment).includes(prompt);
  }).length;
}

/** The finder, asked the same questions, so nobody answers them twice. */
export function finderInputFrom(
  answers: BaselineAnswers,
  equipment: Equipment[],
  injuries: string[],
  /**
   * Logged benchmarks, for the entry standards the seven questions do not
   * ask about (PLAN.md M35). Defaults to none, which reads as unmeasured
   * rather than as failing.
   */
  metrics: MetricEntry[] = [],
): FinderInput {
  return {
    metrics,
    discipline: answers.discipline,
    experience: answers.experience,
    ...(answers.boulderGrade.trim() ? { boulderGrade: answers.boulderGrade.trim() } : {}),
    ...(answers.sportGrade.trim() ? { sportGrade: answers.sportGrade.trim() } : {}),
    goal: answers.goal,
    daysPerWeek: answers.daysPerWeek,
    equipment,
    injuries,
    comingOffBreak: answers.experience === 'returning',
  };
}

/**
 * The grades the log says, where they beat the ones the climber typed.
 *
 * The finder seeds from the first-run baseline, which is right the day it
 * is taken and stale a block later: a climber who answered "V4" at
 * onboarding and has since sent V6 is offered programs for a V4 climber
 * (PLAN.md M85). Only ever upward — a quiet month is not evidence you got
 * worse, and the baseline is what the climber themselves claimed.
 */
export function gradesFromLog(
  answers: BaselineAnswers | null,
  state: { boulder: { best: string | null }; sport: { best: string | null } },
): { boulderGrade: string; sportGrade: string } {
  const better = (typed: string, logged: string | null, scale: GradeScale): string => {
    if (logged === null) return typed;
    // No special case for a blank answer: `gradeOrdinal` gives −1 for
    // anything it cannot place, including '', so any real logged grade
    // already wins the comparison. An explicit guard was there first and no
    // mutation could kill it.
    return gradeOrdinal(scale, logged) > gradeOrdinal(scale, typed) ? logged : typed;
  };
  return {
    boulderGrade: better(answers?.boulderGrade ?? '', state.boulder.best, 'V'),
    sportGrade: better(answers?.sportGrade ?? '', state.sport.best, 'YDS'),
  };
}
