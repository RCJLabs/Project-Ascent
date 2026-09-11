/**
 * The training plan, as a calendar the climber's phone can hold (PLAN.md M75).
 *
 * See `lib/ics.ts` for why this replaced local notifications. This half is
 * the part that decides *what* goes in the file: which days, what to call
 * them, and — the bit that has to be earned rather than invented — what time
 * of day and for how long.
 *
 * **The times come from the log.** The app has never been told when a
 * climber trains, and guessing 6pm for everybody produces a calendar full of
 * events at the wrong time, which is worse than no calendar. So the usual
 * start and the usual length are read from sessions that actually happened,
 * and when there are too few to read, the export says it is guessing rather
 * than quietly using a default.
 */

import type { Program } from '@/content/types';
import type { Session } from '@/db/sessions';
import type { IcsEvent } from '@/lib/ics';
import { addDays, daysBetween, startOfWeek } from './dates';
import { plannedDay } from './plan';
import type { WeekOverrides } from './reschedule';
import type { WeekPlan } from './scheduler';
import { TEST_REASON_LABEL } from './assessments';

/** 6pm, used only when the log cannot say otherwise. */
export const DEFAULT_START = 18 * 60;
export const DEFAULT_DURATION = 90;

/** Sessions to read before the app stops calling it a guess. */
export const ENOUGH = 3;

/** How long before the session the alarm fires. */
export const DEFAULT_ALARM_MINUTES = 120;

/** Times are rounded to this, because 18:07 is false precision. */
const STEP = 15;

/** Believable session lengths. A session left open overnight is not a
 *  four-hour session, and `live.ts` already refuses to record one. */
const MIN_DURATION = 30;
const MAX_DURATION = 240;

export interface UsualSession {
  /** Minutes after midnight. */
  startMinute: number;
  durationMinutes: number;
  /** Sessions the start time was read from. Below `ENOUGH` it is a guess. */
  starts: number;
  /** Sessions the length was read from. */
  durations: number;
}

function round(minutes: number): number {
  return Math.round(minutes / STEP) * STEP;
}

/** Middle value, not mean: one session that ran until midnight is not the
 *  hour you train at. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function usualSession(sessions: readonly Session[]): UsualSession {
  // Only a session started live has a clock on it; one typed in on Thursday
  // for Tuesday has no start time and never had one.
  const starts: number[] = [];
  const durations: number[] = [];
  for (const session of sessions) {
    if (session.startedAt) {
      const at = new Date(session.startedAt);
      if (!Number.isNaN(at.getTime())) starts.push(at.getHours() * 60 + at.getMinutes());
    }
    if (
      session.completed &&
      typeof session.durationMin === 'number' &&
      session.durationMin >= MIN_DURATION &&
      session.durationMin <= MAX_DURATION
    ) {
      durations.push(session.durationMin);
    }
  }

  const start = median(starts);
  const duration = median(durations);
  return {
    startMinute: start === null ? DEFAULT_START : round(start),
    durationMinutes: duration === null ? DEFAULT_DURATION : round(duration),
    starts: starts.length,
    durations: durations.length,
  };
}

/** Whether the times above were read from enough of a log to mean anything. */
export function timesAreKnown(usual: UsualSession): boolean {
  return usual.starts >= ENOUGH && usual.durations >= ENOUGH;
}

export interface ScheduleRequest {
  program: Program;
  startDate: string;
  plan: WeekPlan;
  overrides?: WeekOverrides;
  /** The first day to export. Days already gone are not reminders. */
  from: string;
  usual: UsualSession;
  alarmMinutes?: number;
  /** Rest days too. Off by default: a calendar of "Rest" is noise, and the
   *  app's whole argument against notifications was that noise is what makes
   *  a reminder stop working. */
  includeRest?: boolean;
}

/**
 * The last day the program covers.
 *
 * Computed here because `programWeek` **clamps** rather than returning null
 * past the end — a date a year after a twelve-week block still reports week
 * 12 — so asking it where the program stops gives the wrong answer.
 */
export function lastDayOf(program: Program, startDate: string): string {
  return addDays(startOfWeek(startDate), program.weeks * 7 - 1);
}

export function scheduleEvents(request: ScheduleRequest): IcsEvent[] {
  const { program, startDate, plan, overrides, from, usual } = request;
  const last = lastDayOf(program, startDate);
  const span = daysBetween(from, last);
  if (span < 0) return [];

  const events: IcsEvent[] = [];
  for (let i = 0; i <= span; i += 1) {
    const date = addDays(from, i);
    const day = plannedDay(program, startDate, plan, date, overrides);
    if (day.week === null) continue;
    if (day.isRest && request.includeRest !== true) continue;
    if (!day.sessionType) continue;

    const marks = [
      day.isDeload ? 'Deload' : null,
      day.test ? TEST_REASON_LABEL[day.test] : null,
    ].filter((m): m is string => m !== null);

    const summary = `${day.sessionType.icon} ${day.sessionType.name}${
      marks.length > 0 ? ` · ${marks.join(' · ')}` : ''
    }`;

    events.push({
      // Stable: the same day of the same program is the same event, so a
      // re-export updates rather than duplicates.
      uid: `${date}-${program.id}@project-ascent`,
      date,
      startMinute: usual.startMinute,
      durationMinutes: usual.durationMinutes,
      summary,
      description: [
        `Week ${day.week} of ${program.weeks}${day.phase ? ` · ${day.phase.name}` : ''}`,
        day.sessionType.description,
        day.drill ? `Drill: ${day.drill.name}` : null,
        'From Project Ascent. Export again after changing the plan and these update in place.',
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
      alarms: [
        {
          minutesBefore: request.alarmMinutes ?? DEFAULT_ALARM_MINUTES,
          description: summary,
        },
      ],
    });
  }
  return events;
}

/** What to call the file. */
export function calendarFilename(program: Program): string {
  return `project-ascent-${program.id.replace(/_/g, '-')}.ics`;
}
