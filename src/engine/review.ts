/**
 * The Weekly Review (PLAN.md §6.2).
 *
 * Every Sunday the app assembles the week: load against last week, the ACWR
 * trend, what you sent, how the board went, whether you turned up as often
 * as the program asked, one coaching note, and a look at the week ahead.
 *
 * Deterministic and derived, so any past week can be rebuilt exactly — the
 * review is a reading of the log, not a snapshot taken at the time. That
 * also means it works the first time you open it, on a week that happened
 * before the feature existed.
 */

import type { BodyPart } from '@/content/bodyParts';
import type { Program } from '@/content/types';
import type { Session } from '@/db/sessions';
import type { Project } from '@/db/projects';
import type { Challenge } from './challenges';
import { addDays, daysBetween, startOfWeek, today as todayKey } from './dates';
import { buildLoadIndex, deriveClimberState, loadOrZero, loadStateAt, type AcwrZone } from './derive';
import { sessionHeight } from './altimeter';
import { dayLoad, type DayLoad } from './bodyLoad';
import { DEFAULT_DISPLAY, displayGrade, maxGrade, type GradeDisplay, type GradeScale } from './grades';
import { plannedDay } from './plan';
import type { WeekPlan } from './scheduler';
import type { XpState } from './xp';
import { isRestSession } from './rest';

export type NoteTone = 'good' | 'caution' | 'neutral';

export interface CoachNote {
  id: string;
  tone: NoteTone;
  headline: string;
  body: string;
}

export interface BestSend {
  scale: GradeScale;
  grade: string;
  count: number;
}

export interface PlannedSlot {
  date: string;
  label: string;
  icon: string;
  isRest: boolean;
  /**
   * What that day loads of what is hurt (PLAN.md M89). Empty when nothing
   * does, or when nothing is hurt. The whole reading rather than a count,
   * so the number on a row and the part named under the list cannot drift
   * apart.
   */
  load: DayLoad;
}

export interface WeekReview {
  from: string;
  to: string;
  /** True when the week has not finished yet. */
  inProgress: boolean;

  sessions: number;
  sessionsPrior: number;
  target: number;
  /** Sessions ÷ target. Can exceed 1. */
  adherence: number;

  minutes: number;
  load: number;
  loadPrior: number;
  /** Change against last week, as a fraction. Null when last week was empty. */
  loadDelta: number | null;
  acwr: number | null;
  acwrPrior: number | null;
  zone: AcwrZone;

  sends: number;
  best: BestSend[];
  records: { scale: GradeScale; grade: string; date: string }[];
  feet: number;
  outdoorDays: number;
  restDays: number;
  drills: number;
  warmups: number;
  projectBurns: number;
  projectSends: string[];

  challenges: { done: number; total: number; list: Challenge[] };
  xp: number;

  note: CoachNote;
  nextWeek: PlannedSlot[];
}

export interface ReviewInput {
  sessions: Session[];
  /**
   * The days the climber's blocks put in a planned deload week
   * (PLAN.md M306). `store/deload.ts` is where every caller gets it.
   */
  deloadDates?: ReadonlySet<string>;
  /** Any date inside the week to review. Defaults to today. */
  date?: string;
  program?: Program | undefined;
  startDate?: string | undefined;
  plan?: WeekPlan | undefined;
  projects?: Project[];
  xp?: XpState;
  /**
   * The parts the climber has recorded. Typed as body parts rather than
   * strings because the week ahead is now scanned for what loads them, not
   * only named in a coaching note (PLAN.md M89).
   */
  injuries?: BodyPart[];
  /** Notation to write grades in. Defaults to the stored ladders. */
  display?: GradeDisplay;
  /**
   * The week's challenges, already resolved. See where they are used.
   *
   * Absent means the caller does not show them, not that there are none —
   * `ReviewPage` is the only screen that reads `review.challenges`, and it
   * is a lazy route, so it is the only one that pays for the engine.
   */
  challenges?: Challenge[];
  today?: string;
}


export function buildReview(input: ReviewInput): WeekReview {
  const today = input.today ?? todayKey();
  const from = startOfWeek(input.date ?? today);
  const to = addDays(from, 6);
  const priorFrom = addDays(from, -7);

  const all = input.sessions.filter((s) => s.completed);
  const week = all.filter((s) => s.date >= from && s.date <= to);
  /**
   * The same slice of last week, not the whole of it (PLAN.md M254).
   *
   * `week` holds what has happened; on a Thursday that is four days. `prior`
   * held seven, so "-50% on last week" was a fact about the calendar rather
   * than about the training — which is the exact failure `yearReview.ts` was
   * written around, in its own words: *"A year-in-review that compares a
   * part-finished year against a full one tells every climber they are
   * having a worse year until roughly December."* `blockCompare.ts` guards
   * the same thing from the other side, withholding the comparison until the
   * log covers the whole earlier window. Two engines here are careful about
   * this and the weekly note, which a climber sees fifty-two times a year,
   * was not.
   *
   * A finished week takes the whole of the one before it, exactly as before.
   */
  // Clamped rather than branched on whether the week has ended: once today
  // is past it, the offset is more than six and the clamp takes the whole
  // week, which is the same rule said once. A first draft guarded that case
  // separately and the battery showed the guard could not change an answer.
  const throughDay = Math.max(0, Math.min(6, daysBetween(from, today)));
  const priorTo = addDays(priorFrom, throughDay);
  const prior = all.filter((s) => s.date >= priorFrom && s.date <= priorTo);

  const training = week.filter((s) => !isRestSession(s));
  const load = week.reduce((sum, s) => sum + loadOrZero(s), 0);
  const loadPrior = prior.reduce((sum, s) => sum + loadOrZero(s), 0);

  const index = buildLoadIndex(all);
  // ACWR as of the end of the week under review, not today — an old week
  // must read the way it read then.
  const asOf = to <= today ? to : today;
  const now = loadStateAt(index, asOf);
  const then = loadStateAt(index, addDays(from, -1));

  const state = deriveClimberState(all, { today: asOf, deloadDates: input.deloadDates });
  const target = weeklyTargetOf(input.program);

  const boulderSends: Record<string, number> = {};
  const sportSends: Record<string, number> = {};
  let sends = 0;
  let feet = 0;
  let projectBurns = 0;

  for (const session of week) {
    feet += sessionHeight(session);
    for (const attempt of session.projectAttempts ?? []) projectBurns += attempt.count;
    for (const climb of session.climbs) {
      if (climb.result !== 'send') continue;
      sends += climb.count;
      const bucket = climb.scale === 'V' ? boulderSends : sportSends;
      bucket[climb.grade] = (bucket[climb.grade] ?? 0) + climb.count;
    }
  }

  const best: BestSend[] = [];
  for (const [scale, bucket] of [['V', boulderSends], ['YDS', sportSends]] as const) {
    const grade = maxGrade(scale, Object.keys(bucket));
    if (grade) best.push({ scale, grade, count: bucket[grade] ?? 0 });
  }

  const records = state.personalRecords.filter((r) => r.date >= from && r.date <= to);
  /**
   * Handed in rather than derived (PLAN.md M230).
   *
   * This module called `weeklyChallenges` and that one import put the whole
   * of `engine/challenges.ts` — the daily quality ladder, the weekly variety
   * table and the bounty generator, with the copy for all of it — into the
   * **entry chunk**, because `ReviewCard` is on Home and Home is the one
   * eager route. Measured: **2.12KB gzipped**, for a field that exactly one
   * screen reads, and that screen is a lazy route.
   *
   * So it arrives as data, the way `achievements.ts` takes `programWeeks` as
   * a callback to stay out of the programs catalogue. A caller that does not
   * pass any is a caller that does not show them — which is every caller but
   * `ReviewPage`.
   */
  const challengeList = input.challenges ?? [];
  const xpThisWeek = (input.xp?.events ?? [])
    .filter((e) => e.date >= from && e.date <= to)
    .reduce((sum, e) => sum + e.xp, 0);

  const projectSends = (input.projects ?? [])
    .filter((p) => p.sentDate !== undefined && p.sentDate >= from && p.sentDate <= to)
    .map((p) => p.name);

  const review: Omit<WeekReview, 'note' | 'nextWeek'> = {
    from,
    to,
    inProgress: to > today,
    sessions: training.length,
    sessionsPrior: prior.filter((s) => !isRestSession(s)).length,
    target,
    adherence: target === 0 ? 0 : training.length / target,
    minutes: week.reduce((sum, s) => sum + (s.durationMin ?? 0), 0),
    load: Math.round(load),
    loadPrior: Math.round(loadPrior),
    loadDelta: loadPrior === 0 ? null : (load - loadPrior) / loadPrior,
    acwr: now.acwr,
    acwrPrior: then.acwr,
    zone: now.zone,
    sends,
    best,
    records,
    feet: Math.round(feet),
    outdoorDays: new Set(training.filter((s) => s.mode === 'outdoor').map((s) => s.date)).size,
    restDays: week.filter(isRestSession).length,
    drills: training.filter((s) => s.drillDone).length,
    warmups: training.filter((s) => s.warmup).length,
    projectBurns,
    projectSends,
    challenges: {
      done: challengeList.filter((c) => c.done).length,
      total: challengeList.length,
      list: challengeList,
    },
    xp: xpThisWeek,
  };

  return {
    ...review,
    note: coachNote(review, input, state),
    nextWeek: nextWeekLayout(input, to),
  };
}

/** "an elbow", "a shoulder" — body parts are the only place this matters. */
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

/** Exported since M230: the caller that resolves the week's challenges
 *  has to scale them to the same target this does. */
export function weeklyTargetOf(program: Program | undefined): number {
  const rule = program?.constraints.find((c) => c.kind === 'sessions-per-week');
  return rule && rule.kind === 'sessions-per-week' ? rule.min : 3;
}

/**
 * One note, chosen by a fixed priority order.
 *
 * A tip card, not a chatbot, and honest about being rules — the old app's
 * coach triggers with the AI call removed (AUDIT.md §4.6). Recovery comes
 * before praise, because a week that went well on a body that is breaking
 * down is not a week that went well.
 */
function coachNote(
  review: Omit<WeekReview, 'note' | 'nextWeek'>,
  input: ReviewInput,
  state: ReturnType<typeof deriveClimberState>,
): CoachNote {
  const injuries = input.injuries ?? [];

  if (injuries.length > 0) {
    return {
      id: 'injury',
      tone: 'caution',
      headline: `Training around ${injuries.map(withArticle).join(' and ')}`,
      body: 'Your warmups already leave it out and the finder will steer you off programs that load it. Keep the volume honest until it is off the list.',
    };
  }

  if (review.zone === 'danger') {
    return {
      id: 'spike',
      tone: 'caution',
      headline: 'Load spiked this week',
      body: `You are at ${review.acwr!.toFixed(2)}× your baseline. That is the sharpest kind of rise this model flags — take next week down to roughly ${Math.round(review.load * 0.7)} of load and it settles on its own.`,
    };
  }

  if (review.sessions >= 5 && review.restDays === 0) {
    return {
      id: 'no-rest',
      tone: 'caution',
      headline: `${review.sessions} sessions, no rest days`,
      body: 'Adaptation happens on the days off. Log one next week — the app treats a rest day as training, and so should you.',
    };
  }

  if (review.records.length > 0) {
    const record = review.records.at(-1)!;
    return {
      id: 'record',
      tone: 'good',
      headline: `First ${displayGrade(record.scale, record.grade, input.display ?? DEFAULT_DISPLAY)}`,
      body: 'Hold the pattern rather than adding to it. The block that produced this is the one worth repeating, not escalating.',
    };
  }

  if (review.projectSends.length > 0) {
    return {
      id: 'project',
      tone: 'good',
      headline: `Sent ${review.projectSends.join(' and ')}`,
      body: 'Pick the next one while the fitness is there. A project queue is the cheapest motivation there is.',
    };
  }

  if (review.projectBurns >= 20) {
    return {
      id: 'burning',
      tone: 'neutral',
      headline: `${review.projectBurns} burns on projects`,
      body: 'That is a lot of attempts. If the high point has not moved in three sessions, the block needs a different lever rather than more goes.',
    };
  }

  if (review.sessions > 0 && review.warmups / review.sessions < 0.5) {
    return {
      id: 'warmup',
      tone: 'caution',
      headline: 'Warmups are slipping',
      body: `You warmed up before ${review.warmups} of ${review.sessions} sessions. It is the cheapest injury insurance in the app, and it costs seven minutes.`,
    };
  }

  if (review.adherence >= 1 && review.sessionsPrior >= review.target) {
    return {
      id: 'streak',
      tone: 'good',
      headline: `${state.streakWeeks} weeks on target`,
      body: 'Consistency is doing more for you than any single session. Nothing to change.',
    };
  }

  if (review.sessions === 0) {
    return {
      id: 'blank',
      tone: 'neutral',
      headline: review.inProgress ? 'Nothing logged yet this week' : 'Nothing logged this week',
      body: review.inProgress
        ? 'The week is still running, so this is a note rather than a verdict. If you climbed and did not log it, backfilling takes a minute and keeps every number honest.'
        : 'No verdict on a blank week. If you climbed and did not log it, backfilling takes a minute and keeps every number honest.',
    };
  }

  if (review.adherence < 0.6) {
    // Not in the past tense while the week is still running (PLAN.md M254).
    // "A short week is not a failure — next week starts clean" was written
    // for a week that is over, and it was being delivered on a Thursday with
    // three days left in it. `inProgress` was on the shape all along and only
    // the page subtitle read it.
    return {
      id: 'short',
      tone: 'neutral',
      headline: review.inProgress
        ? `${review.sessions} of ${review.target} sessions so far`
        : `${review.sessions} of ${review.target} sessions`,
      body: review.inProgress
        ? 'Still time — the week has days left in it, and the streak counts weeks that hit the target.'
        : 'A short week is not a failure — it is one week. The streak counts weeks you hit the target, so next week starts clean.',
    };
  }

  if (review.drills === 0 && review.sessions >= 2) {
    return {
      id: 'drills',
      tone: 'neutral',
      headline: 'No drills this week',
      body: 'The drill is the part of the session that changes how you move rather than how tired you are. Worth ten minutes next time.',
    };
  }

  return {
    id: 'steady',
    tone: 'good',
    headline: 'A solid week',
    body: 'Load is where it should be and you turned up. This is the boring part that works.',
  };
}

function nextWeekLayout(input: ReviewInput, weekEnd: string): PlannedSlot[] {
  const { program, startDate, plan } = input;
  if (!program || !startDate || !plan) return [];

  const injured = input.injuries ?? [];
  const slots: PlannedSlot[] = [];
  for (let i = 1; i <= 7; i++) {
    const date = addDays(weekEnd, i);
    const day = plannedDay(program, startDate, plan, date);
    slots.push({
      date,
      label: day.sessionType?.name ?? 'Rest',
      icon: day.sessionType?.icon ?? '🔋',
      isRest: day.isRest || !day.sessionType,
      load: dayLoad(day, injured),
    });
  }
  return slots;
}
