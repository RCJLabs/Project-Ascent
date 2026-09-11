/**
 * The first-run baseline (PLAN.md §9.5).
 *
 * PLAN.md asks this flow to seed "stats, the finder, and the altimeter
 * starting story". Two of those three are right; the altimeter is not, and
 * neither is half of what feeds the stats.
 *
 * The rule here: **the baseline seeds what it can measure, and nothing it
 * cannot.** A climber can truthfully tell the app what they can hang, how
 * many pull-ups they do, how far they fold, and the hardest thing they have
 * sent — those are measurements, taken today, and they belong in the metrics
 * store like any other assessment. What a climber cannot hand over is a
 * training history: sessions logged, weeks held together, drills done, days
 * on rock, feet of vertical. Granting those from a questionnaire would spend
 * the altimeter's whole arc — Everest for a checkbox — and would put
 * fabricated sessions into the calendar, the journal and the ACWR maths,
 * which is the duplicated-state failure of AUDIT.md §8.3 with worse
 * consequences.
 *
 * So a strong climber who has logged nothing finishes onboarding with real
 * Strength and Mobility and near-floor Endurance, Technique and Mental. That
 * is not a gap to paper over; it is the true statement, and it is also the
 * thing that gives the app something to do.
 */

import { METRICS } from '@/content/metrics';
import type { Discipline, Equipment, MetricId } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { parseMetricInput } from './assessments';
import type { Experience, FinderInput, Goal } from './finder';
import { gradeOrdinal, type GradeScale } from './grades';

export interface BaselineAnswers {
  discipline: Discipline;
  experience: Experience;
  goal: Goal;
  daysPerWeek: number;
  /** Raw text as typed. Empty means the question was skipped. */
  boulderGrade: string;
  sportGrade: string;
  /** metricId → raw text as typed. Missing or empty means skipped. */
  benchmarks: Partial<Record<MetricId, string>>;
}

/** Every value each answer is allowed to take, for validating a stored one. */
const DISCIPLINES = ['boulder', 'sport', 'both'] as const satisfies readonly Discipline[];
const EXPERIENCES = ['new', 'returning', 'intermediate', 'advanced'] as const satisfies readonly Experience[];
const GOALS = ['prep', 'fundamentals', 'technique', 'power', 'fingers', 'endurance', 'dynamic', 'project', 'maintain'] as const satisfies readonly Goal[];

export const EMPTY_BASELINE: BaselineAnswers = {
  discipline: 'both',
  experience: 'intermediate',
  goal: 'technique',
  daysPerWeek: 3,
  boulderGrade: '',
  sportGrade: '',
  benchmarks: {},
};

export interface BenchmarkPrompt {
  metricId: MetricId;
  /** Asked only when the climber has this to hand. */
  requires?: Equipment;
  /** The test in plain language, because nobody arrives knowing the ids. */
  how: string;
  /** Shown in the empty field, so the expected unit is never a guess. */
  hint: string;
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
    how: 'Added weight for a 7-second half-crimp hang on a 20 mm edge. Enter 0 if bodyweight is your limit, and a negative number if you take weight off.',
    hint: '0',
  },
  { metricId: 'max_pullups', how: 'Strict pull-ups in one set, chin over the bar.', hint: '8' },
  {
    metricId: 'weighted_pullup_3rm',
    requires: 'gym',
    how: 'Added weight for three strict pull-ups.',
    hint: '25',
  },
  {
    metricId: 'arc_duration',
    requires: 'wall',
    how: 'Longest stretch of continuous easy climbing you can hold without pumping out, in minutes.',
    hint: '15',
  },
  {
    metricId: 'toe_touch',
    how: 'Straight-leg forward fold: inches from your fingertips to the floor. Enter 0 if you reach it.',
    hint: '3',
  },
  {
    metricId: 'wall_angel',
    how: 'Back flat against a wall, arms overhead — do your wrists stay touching the wall the whole way? Pass or fail.',
    hint: 'pass',
  },
  { metricId: 'box_jump_height', how: 'Highest box you can land on from a standing jump, in inches.', hint: '24' },
  {
    metricId: 'flexibility',
    how: 'Score your own mobility out of 10, where 1 is "cannot high-step" and 10 is "drop knee, heel hook, anything".',
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

/**
 * A stored baseline, made safe to use (PLAN.md M20).
 *
 * A record written by an older version — or restored from a backup taken by
 * one — can be missing fields that this one dereferences. `finderInputFrom`
 * calling `.trim()` on an absent `boulderGrade` is the crash that made the
 * whole `/find` page a white screen, and no error boundary makes a wrong
 * answer right: the fix is that the record cannot be the wrong shape by the
 * time anything reads it.
 *
 * Returns null for something that is not a baseline at all. Filling in
 * defaults for every field would hand the finder a confident-looking answer
 * built from nothing, and "we do not know your grade yet" is the truth.
 */
export function readBaseline(value: unknown): BaselineAnswers | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Partial<Record<keyof BaselineAnswers, unknown>>;

  const text = (v: unknown): string => (typeof v === 'string' ? v : '');
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

  // Nothing identifiable at all: not a baseline, not worth guessing at.
  if (raw.discipline === undefined && raw.experience === undefined && raw.goal === undefined) {
    return null;
  }

  const days = Number(raw.daysPerWeek);

  return {
    discipline: oneOf(raw.discipline, DISCIPLINES, EMPTY_BASELINE.discipline),
    experience: oneOf(raw.experience, EXPERIENCES, EMPTY_BASELINE.experience),
    goal: oneOf(raw.goal, GOALS, EMPTY_BASELINE.goal),
    daysPerWeek: Number.isFinite(days) && days >= 1 && days <= 7 ? Math.round(days) : EMPTY_BASELINE.daysPerWeek,
    boulderGrade: text(raw.boulderGrade),
    sportGrade: text(raw.sportGrade),
    benchmarks:
      typeof raw.benchmarks === 'object' && raw.benchmarks !== null
        ? (raw.benchmarks as BaselineAnswers['benchmarks'])
        : {},
  };
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
