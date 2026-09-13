/**
 * The week, as the program sees it (PLAN.md M135).
 *
 * Everything a program says, it says per week: the plan is seven slots, the
 * dose moves week by week (`perWeek`), deloads and tests are weeks, the
 * drill is by week, the back-to-back rule walks seven days, adherence is
 * counted per week, and a move is confined to one. The app showed a day, a
 * month and a block, and the question a climber asks on a Sunday night —
 * what does this week look like, which day is the hard one, what changed,
 * what have I done — was answered in pieces across four screens.
 *
 * This is the reading those pieces share. Pure: the profile, the log and a
 * date in, seven days and the week's facts out. The page draws it, Home
 * summarises it, and neither counts anything itself.
 *
 * ## What a day's status means
 *
 * A day is what happened on it before it is what was planned for it.
 * Anything completed is `done` whatever the plan said, because a climber
 * who trained on a rest day did train; a record that exists and is not
 * finished is `started`. Only then does the plan speak: a training day
 * that has gone by with nothing on it is `missed`, today with nothing yet
 * is `today`, and the rest of the week is `planned`. A day with nothing
 * planned and nothing logged is `rest`, which is most of the week for
 * most programs.
 *
 * `done` over `planned` counts days rather than sessions by type, which is
 * the block screen's stricter reading (`adherence.ts`): the week is asked
 * "did you train on the days it said", and a Performance session on the
 * Endurance day is a yes to that question and a no to the other one. The
 * two numbers are labelled differently so they cannot be read as the same.
 */

import type { Drill, Phase, Program, SessionType } from '@/content/types';
import type { BodyPart } from '@/content/warmups';
import type { Session } from '@/db/sessions';
import type { TestReason } from './assessments';
import { dayLoad, type DayLoad } from './bodyLoad';
import { weekDays } from './dates';
import { DELOAD_STEP, plannedDay, prescriptionFor, type PlannedDay } from './plan';
import type { WeekOverrides } from './reschedule';
import { isRestSession } from './rest';
import { intensityOf, type WeekPlan } from './scheduler';
import { describeWork, sessionMinutes } from './sessionLength';

export type DayStatus = 'done' | 'started' | 'missed' | 'today' | 'planned' | 'rest';

export interface WeekDay {
  date: string;
  /** What the block plans here. Absent when nothing is running. */
  day?: PlannedDay;
  /** The plan puts a training session here — not a rest, not nothing. */
  training: boolean;
  status: DayStatus;
  /** Every record on the day, finished or not. */
  sessions: Session[];
  /** Roughly how long the planned session takes, when the clock can tell. */
  spent: string | null;
  /** What the planned day loads of what is hurt (PLAN.md M89). */
  load: DayLoad;
}

export interface WeekStepLine {
  type: SessionType;
  step: string;
}

export interface WeekOutline {
  /** Sunday. */
  start: string;
  /** Saturday. */
  end: string;
  /** The program week, or null when the block does not cover this week. */
  week: number | null;
  phase?: Phase;
  isDeload: boolean;
  test?: TestReason;
  /** The block has not started by this week. */
  before: boolean;
  /** The block finished before this week. */
  over: boolean;
  days: WeekDay[];
  /** Days the plan places a training session on. */
  planned: number;
  /** Of those, the ones with a finished session. */
  done: number;
  /** Finished training sessions on days the plan left empty. */
  extra: number;
  /** What this week asks that last week did not, by session type. */
  steps: WeekStepLine[];
  /** The deload took a set off at least one session this week. */
  lightened: boolean;
  /** The drills the week's sessions carry, each once. */
  drills: { type: SessionType; drill: Drill }[];
}

export interface WeekInput {
  /** Any date in the week. */
  date: string;
  today: string;
  sessions: readonly Session[];
  program?: Program | undefined;
  startDate?: string | undefined;
  plan?: WeekPlan | undefined;
  overrides?: WeekOverrides | undefined;
  trackId?: string | undefined;
  /** The parts to count load against. Empty when nothing is hurt. */
  injured?: readonly BodyPart[];
}

/** A finished session that is training rather than a logged rest. */
function trained(session: Session): boolean {
  return session.completed && !isRestSession(session);
}

function statusOf(date: string, today: string, planned: boolean, sessions: readonly Session[]): DayStatus {
  if (sessions.some((s) => s.completed)) return 'done';
  if (sessions.length > 0) return 'started';
  if (!planned) return 'rest';
  if (date < today) return 'missed';
  return date === today ? 'today' : 'planned';
}

export function weekOutline(input: WeekInput): WeekOutline {
  const dates = weekDays(input.date);
  const start = dates[0]!;
  const end = dates[6]!;
  const planning = input.program !== undefined && input.startDate !== undefined && input.plan !== undefined;
  const injured = input.injured ?? [];

  const days: WeekDay[] = dates.map((date) => {
    const day = planning
      ? plannedDay(input.program!, input.startDate!, input.plan!, date, input.overrides)
      : undefined;
    const sessions = input.sessions.filter((s) => s.date === date);
    const training = day !== undefined && day.sessionType !== undefined && !day.isRest;
    return {
      date,
      ...(day ? { day } : {}),
      training,
      status: statusOf(date, input.today, training, sessions),
      sessions,
      spent: training
        ? describeWork(
            sessionMinutes({
              type: day.sessionType!,
              program: input.program,
              week: day.week,
              trackId: input.trackId,
              deload: day.isDeload,
            }),
          )
        : null,
      load: day ? dayLoad(day, injured) : { conflicts: [], parts: [] },
    };
  });

  // The week's facts are the same on every day of it — `plannedDay` derives
  // them from the week — so any day will do, and the first is as good as
  // the rest.
  const first = days[0]!.day;
  const week = first?.week ?? null;
  const over = first?.over === true;
  const before = planning && week === null && !over;

  const trainingDays = days.filter((d) => d.training);
  const planned = trainingDays.length;
  const done = trainingDays.filter((d) => d.status === 'done').length;
  const extra = days
    .filter((d) => !trainingDays.includes(d))
    .reduce((n, d) => n + d.sessions.filter(trained).length, 0);

  // Once per session type rather than once per day: a week with two
  // Fingerboard sessions asks the same thing of both, and saying it twice
  // reads as two different things.
  const steps: WeekStepLine[] = [];
  const drills: { type: SessionType; drill: Drill }[] = [];
  let lightened = false;
  const seen = new Set<string>();
  for (const { day } of trainingDays) {
    const type = day!.sessionType!;
    if (seen.has(type.id)) continue;
    seen.add(type.id);
    if (day!.drill) drills.push({ type, drill: day!.drill });
    if (!day!.phase) continue;
    for (const block of prescriptionFor(type, day!.phase, input.trackId, day!.week, day!.isDeload)) {
      if (block.step === undefined) continue;
      if (block.step === DELOAD_STEP) lightened = true;
      else steps.push({ type, step: block.step });
    }
  }

  return {
    start,
    end,
    week,
    ...(first?.phase ? { phase: first.phase } : {}),
    isDeload: first?.isDeload === true,
    ...(first?.test !== undefined ? { test: first.test } : {}),
    before,
    over,
    days,
    planned,
    done,
    extra,
    steps,
    lightened,
    drills,
  };
}

/**
 * The hardest day still to come this week, or null (PLAN.md M131 marks
 * it on the calendar; this is the same day, named).
 *
 * Still to come rather than any: "Limit day Tuesday" on a Thursday is a
 * fact about the past dressed as a plan. A limit day already done, missed
 * or started is left to its row.
 */
export function nextLimitDay(outline: WeekOutline): WeekDay | null {
  return (
    outline.days.find(
      (d) =>
        (d.status === 'today' || d.status === 'planned') &&
        d.day?.sessionType !== undefined &&
        intensityOf(d.day.sessionType) === 'max',
    ) ?? null
  );
}

/**
 * The line Home and the week's own header say about the count.
 *
 * Tense follows the week: a week that has gone is reported, this week is
 * reported with what is left, a week to come is only planned. Null for a
 * week the plan puts nothing in, which is a week with nothing to count.
 */
export function describeWeekDays(outline: WeekOutline, today: string): string | null {
  if (outline.planned === 0) return null;
  const noun = outline.planned === 1 ? 'training day' : 'training days';
  const extra = outline.extra > 0 ? `, and ${outline.extra} unplanned` : '';
  if (outline.end < today) return `${outline.done} of ${outline.planned} ${noun} done${extra}`;
  if (outline.start > today) return `${outline.planned} ${noun} planned`;
  const left = outline.days.filter((d) => d.status === 'planned' || d.status === 'today').length;
  const toCome = left > 0 ? `, ${left} to come` : '';
  return `${outline.done} of ${outline.planned} ${noun} done${toCome}${extra}`;
}
