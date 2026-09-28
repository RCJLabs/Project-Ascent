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
 *
 * This file is the answers and reading a stored set back, which the profile
 * store does at boot. The battery that asks them and what they become —
 * metric entries, the finder's input — is `baselineBattery.ts` (PLAN.md
 * M344), read only by the pages that ask or use them.
 */

import type { Discipline, MetricId } from '@/content/types';
import type { Experience, Goal } from './finder';

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
