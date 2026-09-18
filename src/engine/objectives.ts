/**
 * Objectives — the long arc (PLAN.md M10, first fork).
 *
 * A twelve-week program ends. When it does, the app has a catalog to re-pick
 * from and nothing you are still working toward. The altimeter and the skill
 * trees are long arcs but both are *accumulation*: they happen to you as a
 * side effect of logging. Neither is a goal you chose.
 *
 * An objective is that goal. A named climb, or a named outcome, at a scale a
 * single block cannot finish: The Nose, a first V8, a 5.13 redpoint, a trip
 * you have booked.
 *
 * ## Why it is not just a bigger project
 *
 * A project is something you are *on*: burns, a high point, a wall you can
 * get to. An objective is something you are *training for*, possibly without
 * being able to touch it yet. So it is not tracked by attempts — it is
 * tracked by what has to be true before it is realistic, and every one of
 * those is measured from the log rather than declared.
 *
 * ## Reusing the skill-tree vocabulary
 *
 * `SkillRequirement` already names fifteen kinds of real training and knows
 * how to measure each one against a climber's history. Inventing a second
 * vocabulary for the same idea would mean two tables to keep in step and two
 * places for "sends at grade" to mean subtly different things. So an
 * objective's requirements *are* skill requirements.
 *
 * ## What it never does
 *
 * Pay you. Marking an objective sent awards nothing: the session that sent
 * it already paid for the send, and an objective's status is self-declared.
 * Paying out for a flag the climber sets by hand is the same mistake as
 * paying them to tick a return-to-climbing box.
 */

import { METRICS } from '@/content/metrics';
import type { MetricId, ProgramId } from '@/content/types';
import type { GradeScale } from './grades';
import { measure, type Measurement, type SkillInput, type SkillRequirement } from './skills';
import { daysBetween, today as todayKey } from './dates';
import { plural } from './phrase';

/**
 * A benchmark requirement, pointed the way that benchmark improves.
 *
 * `metric` and `metric-under` are the same idea read in two directions, and
 * which one a requirement needs is not a question worth asking a climber:
 * `METRICS` already knows, because `min_edge` and `toe_touch` are the two of
 * thirty-seven where a smaller number is a better one. Picking the metric
 * picks the direction (PLAN.md M222).
 */
export function benchmarkFor(metricId: MetricId, value: number): SkillRequirement {
  return METRICS[metricId]!.higherIsBetter
    ? { kind: 'metric', metricId, atLeast: value }
    : { kind: 'metric-under', metricId, atMost: value };
}

export type ObjectiveStatus = 'planning' | 'training' | 'sent' | 'shelved';
export type ObjectiveKind = 'boulder' | 'route' | 'trip' | 'other';

export interface ObjectiveRequirement {
  id: string;
  requirement: SkillRequirement;
  /** Why this one matters here, in the climber's own words. */
  why?: string;
}

export interface Objective {
  id: string;
  name: string;
  kind: ObjectiveKind;
  status: ObjectiveStatus;
  grade?: string;
  scale?: GradeScale;
  location?: string;
  /**
   * When you intend to be on it. Not a deadline that can be failed — the
   * app never marks an objective missed, because a season that did not go
   * to plan is a season, not a failure state.
   */
  targetDate?: string;
  /**
   * Blocks you mean to run before it, in order (PLAN.md M109).
   *
   * The sequence is stored; every date is derived from it and the target,
   * working backwards. Absent on an objective inside the peak runway, where
   * `peak.ts` answers a different and better question.
   */
  season?: ProgramId[];
  requirements: ObjectiveRequirement[];
  /** A tracked project, when the objective is something you are already on. */
  projectId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** More than a handful and none of them is really the objective. */
export const MAX_ACTIVE = 3;

export function newObjectiveId(): string {
  return `obj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function newRequirementId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface MeasuredRequirement extends ObjectiveRequirement {
  measurement: Measurement;
  /** 0..1, capped. A requirement half done counts as half. */
  fraction: number;
}

export interface ObjectiveProgress {
  measured: MeasuredRequirement[];
  met: number;
  total: number;
  /**
   * 0..1.
   *
   * The mean of each requirement's own fraction rather than "met ÷ total".
   * Five requirements each 80% done is a climber nearly there, and reporting
   * that as 0% would be a lie the whole feature could not survive.
   */
  readiness: number;
  /** The requirement furthest from done — the honest answer to "what now?". */
  weakest: MeasuredRequirement | null;
  /** Whole weeks until the target date; negative once it has passed. */
  weeksLeft: number | null;
  /** The same gap in days, which keeps its sign. */
  daysLeft: number | null;
}

export function objectiveProgress(objective: Objective, input: SkillInput, today = todayKey()): ObjectiveProgress {
  const measured: MeasuredRequirement[] = objective.requirements.map((req) => {
    const measurement = measure(req.requirement, input);
    return { ...req, measurement, fraction: fractionOf(measurement) };
  });

  const unmet = measured.filter((m) => !m.measurement.met);
  const weakest = unmet.length === 0
    ? null
    : unmet.reduce((worst, m) => (m.fraction < worst.fraction ? m : worst));

  return {
    measured,
    met: measured.filter((m) => m.measurement.met).length,
    total: measured.length,
    readiness: measured.length === 0 ? 0 : measured.reduce((sum, m) => sum + m.fraction, 0) / measured.length,
    weakest,
    weeksLeft: objective.targetDate === undefined
      ? null
      : Math.round(daysBetween(today, objective.targetDate) / 7),
    /**
     * The same gap in days, which is the one that keeps its sign
     * (PLAN.md M256).
     *
     * `Math.round(-2 / 7)` is **negative zero**, and `-0 < 0` is `false` —
     * so a target that went two days ago tested as neither past nor future
     * and fell into the "this week" branch, directly above a runway card
     * reading *"That date has been and gone."* `peakPlan` gets it right by
     * asking the days, which is what this field is for.
     */
    daysLeft: objective.targetDate === undefined
      ? null
      : daysBetween(today, objective.targetDate),
  };
}

/**
 * How far along one requirement is, from where the climber stands now.
 *
 * `standing` rather than `current` (PLAN.md M257). They are the same number
 * on thirteen of the fourteen kinds; on `streak-weeks` `current` is the
 * longest streak ever run and `standing` is the one being run now, and
 * `suggestedRequirements` puts a streak on **every** new objective. A
 * climber whose nine-week run broke last month read 5/8 of the way through
 * a requirement they were seven weeks from — and that fraction is a term
 * in `readiness`, which is the headline percentage, and in `weakest`, which
 * is the app's answer to "what now?".
 */
function fractionOf(measurement: Measurement): number {
  if (measurement.met) return 1;
  if (measurement.target <= 0) return measurement.met ? 1 : 0;
  return Math.max(0, Math.min(1, measurement.standing / measurement.target));
}

/**
 * One line about where an objective stands.
 *
 * Deliberately free of any claim about whether the date will be made. The
 * app can measure what has happened; it cannot tell a climber whether three
 * more months of training will go the way they hope, and the altimeter's
 * rule holds here too — no projection that has not been earned.
 */
export function describeProgress(progress: ObjectiveProgress): string {
  if (progress.total === 0) return 'Nothing to work toward yet — add what has to be true first.';
  const percent = Math.round(progress.readiness * 100);
  const weeks = progress.weeksLeft;
  const days = progress.daysLeft;
  // The days decide past from future, because the weeks cannot: rounding
  // two days into the past gives `-0`, which is not less than zero
  // (PLAN.md M256). Once it is known to be past, the weeks say how far —
  // except inside the first one, where days are what a climber has.
  const when =
    weeks === null || days === null
      ? ''
      : days < 0
        ? Math.abs(days) < 7
          ? ` · target was ${Math.abs(days)} ${plural(Math.abs(days), 'day')} ago`
          : ` · target was ${Math.abs(weeks)} ${plural(Math.abs(weeks), 'week')} ago`
        : weeks === 0
          ? ' · this week'
          : ` · ${weeks} ${plural(weeks, 'week')} out`;
  return `${percent}% of the way there, ${progress.met} of ${progress.total} met${when}`;
}

/**
 * Requirements worth suggesting for a new objective.
 *
 * A starting point, not a prescription: everything here is editable and
 * removable, and a climber who knows what their route demands should replace
 * the lot. The shape follows what a hard ascent actually asks for — sending
 * below the grade in volume, time on real rock for anything outdoors, and
 * the consistency that makes the rest possible.
 */
export function suggestedRequirements(kind: ObjectiveKind, scale: GradeScale, grade: string, ladder: readonly string[]): ObjectiveRequirement[] {
  const index = ladder.indexOf(grade);
  const below = (n: number) => ladder[Math.max(0, index - n)] ?? ladder[0]!;
  const out: SkillRequirement[] = [];

  if (index >= 0 && (kind === 'boulder' || kind === 'route')) {
    // Volume below the grade is what makes the grade possible; the pyramid
    // is the oldest idea in climbing training and the least argued with.
    out.push({ kind: 'sends', scale, grade: below(2), count: 10 });
    out.push({ kind: 'sends', scale, grade: below(1), count: 3 });
  }
  if (kind === 'route' || kind === 'trip') {
    out.push({ kind: 'outdoor-days', count: 12 });
  }
  if (kind === 'boulder') {
    out.push({ kind: 'outdoor-days', count: 8 });
  }
  out.push({ kind: 'streak-weeks', weeks: 8 });
  out.push({ kind: 'sessions', count: 60 });

  return out.map((requirement) => ({ id: newRequirementId(), requirement }));
}

/**
 * Whether picking a program could plausibly move this requirement.
 *
 * Consistency, rest and days on rock are not things a training block
 * delivers — they are things a climber arranges. Offering "find a program
 * that trains this" against them would be the app talking for the sake of
 * having something to say.
 */
export function trainableByProgram(requirement: SkillRequirement): boolean {
  switch (requirement.kind) {
    case 'streak-weeks':
    case 'rest-days':
    case 'outdoor-days':
      return false;
    default:
      return true;
  }
}

/** Active objectives, the ones the app should be helping with. */
export function activeObjectives(objectives: readonly Objective[]): Objective[] {
  return objectives.filter((o) => o.status === 'planning' || o.status === 'training');
}

/**
 * Whether a linked project's send has effectively achieved this.
 *
 * Derived rather than stored, so an objective cannot claim a send the log
 * does not have — the same rule the project reconciler follows.
 */
export function achievedByProject(objective: Objective, sentProjectIds: ReadonlySet<string>): boolean {
  return objective.projectId !== undefined && sentProjectIds.has(objective.projectId);
}

/** Sort for a list: what you are on, then what is closest, then the rest. */
export function rankObjectives(objectives: readonly Objective[], readiness: Map<string, number>): Objective[] {
  const rank: Record<ObjectiveStatus, number> = { training: 0, planning: 1, sent: 2, shelved: 3 };
  return [...objectives].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return (readiness.get(b.id) ?? 0) - (readiness.get(a.id) ?? 0);
  });
}
