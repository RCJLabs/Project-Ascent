/**
 * Planning the weeks up to a trip (PLAN.md M73).
 *
 * M25 drew the acute:chronic ratio backwards, out of what was logged. This
 * runs the same model forwards: given a date you want to be on something,
 * what each week between here and there should weigh.
 *
 * **The proposal called it "the same maths run in the other direction". It
 * is not.** Backwards, the loads are known and the ratio falls out.
 * Forwards, the ratio is a constraint and the loads are the unknown, and
 * there are two of them pulling opposite ways: arriving *fresh* means the
 * last week is lighter than the baseline, and arriving *not detrained*
 * means the baseline itself has to be at least as high as it is now. A
 * taper satisfies the first by violating the second unless the weeks before
 * it built the room to spend. So it is a shape — build, hold, taper — not
 * an inversion.
 *
 * **The rule this has to answer to.** `engine/objectives.ts` says of the
 * same objective's progress line: *"no projection that has not been
 * earned"*. The altimeter's version of that rule is the one to follow — it
 * does project an ETA, and withholds it below three weeks of history and a
 * measured pace. Two things keep this inside the rule. It projects a
 * *prescription*, not an outcome: what the weeks should weigh, never
 * whether the trip will go well or whether the climber will do any of it.
 * And it withholds entirely when the app has no baseline to plan from,
 * using the same gate the ratio itself uses.
 *
 * **It does not own the trip date.** `Objective` already has `kind: 'trip'`
 * and a `targetDate`, and describes itself as "a trip you have booked". A
 * second place to say when you are going would be a second place for it to
 * be wrong.
 *
 * **It does not invent deloads either.** A climber on a program already has
 * them scheduled, and a peaking plan laying its own on top would be two
 * schedules disagreeing. The program's weeks are read and respected.
 */

import type { Session } from '@/db/sessions';
import type { Program } from '@/content/types';
import { ACWR_BOUNDS, buildLoadIndex, type LoadIndex } from './derive';
import { addDays, daysBetween, programWeek, today as todayKey } from './dates';

/**
 * Weekly ramp.
 *
 * The model's own ceiling is higher than this. A steady geometric ramp of
 * `r` settles at a ratio of `4 / (1 + 1/r + 1/r² + 1/r³)`, which reaches
 * 1.3 — the top of the sweet spot — at about 1.22 a week. So the famous
 * "ten percent rule" is conservative against the maths the app already
 * uses, and this keeps it anyway: the settled figure is what a *sustained*
 * ramp costs, and a plan that runs along the edge of the band has nowhere
 * to put a week that went harder than intended.
 */
export const RAMP = 1.1;

/** A mid-block easy week. Enough to shed fatigue, not enough to lose the week. */
export const DELOAD = 0.7;

/** The last week. Lighter than a deload, because the point is not recovery
 *  from the block — it is arriving with the fatigue gone. */
export const TAPER = 0.55;

/**
 * How often an easy week goes in when nothing else has put one there.
 *
 * The rule above is that the plan does not invent deloads *on top of a
 * program's*, and that stands. But a climber with no program and a twelve
 * week runway was getting seven identical weeks at the ceiling, which is
 * not a plan, it is a wall — so the plan puts its own in when there is no
 * program to defer to. Never in the week before the taper: two easy weeks
 * back to back is the taper starting early by accident.
 */
export const DELOAD_EVERY = 4;

/** Ceiling on the whole build, as a multiple of where you started. The ratio
 *  limits the *rate* and says nothing about the total, and eight weeks of
 *  compounding at 10% is more than double — which is a number no app should
 *  hand anybody. */
export const MAX_BUILD = 1.5;

/** Past this, the runway is a training block and not a peak. The finder
 *  already asks how many weeks you have (M57); this hands over to it. */
export const MAX_RUNWAY_WEEKS = 12;

export type WeekKind = 'build' | 'hold' | 'deload' | 'taper';

export interface PeakWeek {
  /** 1-based, counting forward from today. */
  week: number;
  /** The last day of this week. */
  ends: string;
  kind: WeekKind;
  /** Target load for the week, in the sRPE units the log produces. */
  load: number;
  /** As a share of the baseline: 1.1 is ten percent more than usual. */
  ofNow: number;
  /** The ratio this week would produce, if it were followed. */
  acwr: number;
  /** The chronic baseline at the end of it — the fitness, as the app counts it. */
  chronic: number;
}

export type WithheldReason = 'past' | 'too-far' | 'no-baseline';

export interface PeakPlan {
  weeks: PeakWeek[];
  /** Weekly-equivalent load right now, or null when there is no baseline. */
  baseline: number | null;
  /** Whole weeks of runway. */
  runway: number;
  /** The ratio on the trip, if the plan is followed. */
  arriveAt: number | null;
  /** The baseline on the trip. Fitness, in the same units as `baseline`. */
  fitnessAtTrip: number | null;
  withheld: WithheldReason | null;
}

export interface PeakRequest {
  sessions: readonly Session[];
  /** The date you want to be on it. */
  target: string;
  from?: string;
  /** The active program, so its deload weeks are respected rather than
   *  duplicated. */
  program?: Program;
  /** When that program started. */
  startDate?: string;
}

/** Sum of the loads in the seven days ending on `end`, inclusive. */
function weekLoad(index: LoadIndex, end: string): number {
  let total = 0;
  for (let i = 0; i < 7; i += 1) total += index.byDate.get(addDays(end, -i))?.load ?? 0;
  return total;
}

const empty = (runway: number, withheld: WithheldReason): PeakPlan => ({
  weeks: [],
  baseline: null,
  runway,
  arriveAt: null,
  fitnessAtTrip: null,
  withheld,
});

export function peakPlan(request: PeakRequest): PeakPlan {
  const from = request.from ?? todayKey();
  const days = daysBetween(from, request.target);
  if (days < 0) return empty(0, 'past');

  // Weeks are anchored to today rather than counted back from the trip, so
  // the last one ends within three days of it. Close enough for a week-sized
  // instruction, and it keeps every week a whole week.
  const runway = Math.max(1, Math.round(days / 7));
  if (runway > MAX_RUNWAY_WEEKS) return empty(runway, 'too-far');

  const index = buildLoadIndex([...request.sessions]);

  // The three seven-day blocks before today. The ratio is a four-week
  // window, so the first projected week's baseline is mostly real history —
  // planning from the baseline alone would quietly forget that.
  const history = [weekLoad(index, addDays(from, -14)), weekLoad(index, addDays(from, -7)), weekLoad(index, from)];
  const baseline = (history[0]! + history[1]! + history[2]! + weekLoad(index, addDays(from, -21))) / 4;

  // The same gate the ratio itself uses. Without a baseline there is nothing
  // to take a percentage of, and a plan built on one week of logging is a
  // plan built on nothing.
  if (!hasBaseline(index, from, baseline)) return empty(runway, 'no-baseline');

  const ceiling = baseline * MAX_BUILD;
  const weeks: PeakWeek[] = [];
  const loads = [...history];
  let level = baseline;

  for (let week = 1; week <= runway; week += 1) {
    const ends = addDays(from, week * 7);
    const kind = weekKind(week, runway, ends, level, ceiling, request);

    // No clamp on the build: `weekKind` calls the week a hold precisely when
    // the next step would clear the ceiling, so a build week's step never
    // does. A `Math.min` here survived being removed, which is what dead
    // code looks like from the outside.
    if (kind === 'build') level *= RAMP;
    else if (kind === 'hold') level = ceiling;
    const load = kind === 'taper' ? level * TAPER : kind === 'deload' ? level * DELOAD : level;

    loads.push(load);
    const chronic = loads.slice(-4).reduce((sum, n) => sum + n, 0) / 4;
    weeks.push({
      week,
      ends,
      kind,
      load,
      ofNow: load / baseline,
      acwr: chronic === 0 ? 0 : load / chronic,
      chronic,
    });
  }

  const last = weeks[weeks.length - 1]!;
  return {
    weeks,
    baseline,
    runway,
    arriveAt: last.acwr,
    fitnessAtTrip: last.chronic,
    withheld: null,
  };
}

function weekKind(
  week: number,
  runway: number,
  ends: string,
  level: number,
  ceiling: number,
  request: PeakRequest,
): WeekKind {
  if (week === runway) return 'taper';
  if (isProgramDeload(ends, request)) return 'deload';
  if (week % DELOAD_EVERY === 0 && week < runway - 1) return 'deload';
  return level * RAMP > ceiling ? 'hold' : 'build';
}

function isProgramDeload(date: string, request: PeakRequest): boolean {
  const { program, startDate } = request;
  if (!program || !startDate) return false;
  const week = programWeek(startDate, date, program.weeks);
  return week !== null && (program.deloadWeeks ?? []).includes(week);
}

/**
 * Whether the log supports a baseline at all.
 *
 * Deliberately the same two conditions `loadSeries` applies before it will
 * report a ratio — three weeks of calendar and six days carrying load
 * inside the four-week window. Three weeks with two sessions in it produces
 * arithmetic, not a baseline, and a plan is a worse place than a chart to
 * find that out.
 */
function hasBaseline(index: LoadIndex, from: string, baseline: number): boolean {
  if (baseline <= 0) return false;
  if (index.earliest === null || daysBetween(index.earliest, from) + 1 < 21) return false;
  let days = 0;
  for (let i = 0; i < 28; i += 1) {
    if ((index.byDate.get(addDays(from, -i))?.load ?? 0) > 0) days += 1;
  }
  return days >= 6;
}

export const WITHHELD_REASON: Record<WithheldReason, string> = {
  past: 'That date has been and gone.',
  'too-far': `More than ${MAX_RUNWAY_WEEKS} weeks out is a training block, not a peak. Pick a program for the first part of it and come back when the trip is closer.`,
  'no-baseline': 'Three weeks of logged sessions, with the effort and the time filled in, and this becomes meaningful.',
};

export const WEEK_LABEL: Record<WeekKind, string> = {
  build: 'Build',
  hold: 'Hold',
  deload: 'Deload',
  taper: 'Taper',
};

/**
 * One sentence about the shape of the plan.
 *
 * Says what it asks for and what it lands on, and makes no claim about the
 * trip. Whether a climber arrives strong is not something a load model gets
 * a vote on.
 */
export function describePeak(plan: PeakPlan): string {
  if (plan.withheld !== null) return WITHHELD_REASON[plan.withheld];
  const peak = Math.max(...plan.weeks.map((w) => w.ofNow));
  // Everything that is not the taper, rather than the build weeks alone: a
  // run of "hold" weeks at the ceiling is still work, and calling nine weeks
  // "nine weeks of building" when six of them are flat is a sentence the
  // table underneath it contradicts.
  const build = plan.weeks.length - 1;
  const arrive = plan.arriveAt!.toFixed(2);
  if (build === 0) {
    // No weeks to build in, so there is nothing to claim about fitness: the
    // only thing a light week on its own can do is take the baseline down
    // with it, and saying otherwise would be the plan promising what its
    // own arithmetic denies.
    return 'One week out. There is no time to build — this is the taper, and all it can do is take the fatigue off.';
  }
  return `${build} ${build === 1 ? 'week' : 'weeks'} of work, topping out at ${Math.round(peak * 100)}% of your usual week, then a taper into the trip at ${arrive}.`;
}

/**
 * Whether the plan keeps the fitness it started with.
 *
 * The second half of "fresh and not detrained", and the half a taper on its
 * own fails: with no weeks to build first, the only thing a light week can
 * do is take the baseline down with it.
 */
export function keepsFitness(plan: PeakPlan): boolean {
  return plan.baseline !== null && plan.fitnessAtTrip !== null && plan.fitnessAtTrip >= plan.baseline;
}

/** Whether every week of the plan stays inside the band the app judges by. */
export function staysInBand(plan: PeakPlan): boolean {
  return plan.weeks.every((w) => w.kind !== 'build' && w.kind !== 'hold'
    ? true
    : w.acwr >= ACWR_BOUNDS.optimalFrom && w.acwr <= ACWR_BOUNDS.optimalTo);
}
