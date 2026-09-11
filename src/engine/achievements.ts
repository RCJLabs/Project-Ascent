import type { Session } from '@/db/sessions';
import type { Project } from '@/db/projects';
import { addDays, daysBetween, startOfWeek } from './dates';
import { gradeOrdinal, type GradeScale } from './grades';

/**
 * Named achievements — a fixed, finite set (PLAN.md M32).
 *
 * ## The rule that keeps this from being a fourth list of the same facts
 *
 * The app already names accomplishments in three places. `career.ts` counts
 * unbounded totals and dates them. The five skill trees hold 130 threshold
 * rungs — "send 25 at V4", "climb outdoors on 15 days". `milestones.ts`
 * announces the moment after a session. All three answer **how much**.
 *
 * The plan's own examples for this milestone — "first outdoor day", "three
 * months without a missed week" — are already a skill node *and* a session
 * milestone each, so building them here would have been the same fact in a
 * fourth place. Instead:
 *
 * > **An achievement is a shape in the log, never a running total.**
 *
 * A single day with a property, or a pattern across time. Not "N of X" —
 * that is what the other two axes are for, and it is why nothing in here
 * duplicates a skill node.
 *
 * ## Finite on purpose
 *
 * Twenty-five, fixed. "Nine of twenty-five" is a thing to aim at in a way
 * that "250 sends, then 500" is not — the counters are a timeline, and this
 * is a list. Adding one is a deliberate act, not an emergent consequence of
 * logging more: fourteen were written for M32 and eleven more added at
 * once, each of them a shape rather than a threshold.
 *
 * **One was considered and rejected**, and it is worth writing down why. A
 * dawn-patrol achievement — a session started before six — reads an hour out
 * of `startedAt`, which is an instant in UTC. Turning it into a local hour
 * needs the runtime's timezone, so the same log would earn it on a phone at
 * home and not on the same phone in Spain. Everything here is a fact about
 * the log; a fact that moves with the reader is not one.
 *
 * ## Derived, dated, and unpaid
 *
 * Nothing is stored: an achievement is a question asked of the log, so
 * editing away the session that earned it takes it back. Each carries the
 * date the log crossed it, like a career milestone. None of them award XP,
 * coins or stats — the sessions underneath were paid for when they were
 * logged.
 */

export type AchievementId =
  | 'full-circle'
  | 'long-way-back'
  | 'full-week'
  | 'always-warm'
  | 'hard-outside'
  | 'straight-up'
  | 'no-beta-outdoors'
  | 'whole-spread'
  | 'persistence'
  | 'weekend-on-rock'
  | 'a-trip'
  | 'both-sides'
  | 'listened'
  | 'block-finished'
  // Eleven more, added deliberately — see "Finite on purpose".
  | 'twice-in-a-day'
  | 'long-haul'
  | 'both-ends'
  | 'clean-sheet'
  | 'the-double'
  | 'both-in-a-day'
  | 'deload-honoured'
  | 'the-comeback'
  | 'months-outside'
  | 'rested-and-ready'
  | 'redemption';

export interface Achievement {
  id: AchievementId;
  name: string;
  /** What it takes, in one sentence. Shown whether it is earned or not. */
  detail: string;
  /** The date the log crossed it, or null while it has not. */
  date: string | null;
}

export interface AchievementInput {
  sessions: readonly Session[];
  projects?: readonly Project[];
  /** A program's length in weeks. A callback, so this module stays pure. */
  programWeeks?: (programId: string) => number | undefined;
}

/** Consecutive completed sessions with the warmup ticked. */
export const WARM_RUN = 20;
/** Days away that make coming back its own thing. */
export const BREAK_DAYS = 60;
/** Separate training days inside one calendar week. */
export const WEEK_DAYS = 5;
/** Different grades sent in one session. */
export const SPREAD_GRADES = 5;
/** Logged burns before a send that counts as persistence. */
export const BURNS_FOR_PERSISTENCE = 20;
/** Consecutive days outdoors that make a trip. */
export const TRIP_DAYS = 4;
/** RPE at or above which a session counts as maximal. */
export const MAXIMAL_RPE = 9;
/** Minutes that make a session a long one. */
export const LONG_SESSION_MIN = 180;
/** Climbs in a session with no failed attempt among them. */
export const CLEAN_SHEET_CLIMBS = 5;
/** The RPE a deload week is not supposed to go above. */
export const DELOAD_RPE_CAP = 7;
/** Days after coming back inside which a limit send is a comeback. */
export const COMEBACK_DAYS = 30;
/** Separate calendar months outdoors, inside one year. */
export const OUTDOOR_MONTHS = 3;
/** RPE at or below which a session counts as genuinely easy. */
export const EASY_RPE = 3;

interface Definition {
  id: AchievementId;
  name: string;
  detail: string;
  /** The date it was earned, or null. */
  find: (log: Log) => string | null;
}

/** Everything the definitions read, walked once. */
interface Log {
  completed: Session[];
  byDate: Map<string, Session[]>;
  dates: string[];
  projects: readonly Project[];
  programWeeks: (programId: string) => number | undefined;
}

const DEFINITIONS: Definition[] = [
  {
    id: 'full-circle',
    name: 'Full Circle',
    detail: 'A session in every month of one calendar year.',
    find: (log) => {
      const months = new Map<string, Set<string>>();
      for (const date of log.dates) {
        const year = date.slice(0, 4);
        const set = months.get(year) ?? new Set<string>();
        set.add(date.slice(5, 7));
        months.set(year, set);
        if (set.size === 12) return date;
      }
      return null;
    },
  },
  {
    id: 'long-way-back',
    name: 'The Long Way Back',
    detail: `A session after ${BREAK_DAYS} days or more without one.`,
    find: (log) => {
      for (let i = 1; i < log.dates.length; i++) {
        if (daysBetween(log.dates[i - 1]!, log.dates[i]!) >= BREAK_DAYS) return log.dates[i]!;
      }
      return null;
    },
  },
  {
    id: 'full-week',
    name: 'A Full Week',
    detail: `${WEEK_DAYS} separate training days inside one calendar week.`,
    // Walks the distinct dates, not the sessions: five sessions on one
    // Saturday is one training day, and counting it as five would make this
    // an achievement for logging twice.
    find: (log) => {
      const weeks = new Map<string, Set<string>>();
      for (const date of log.dates) {
        const week = startOfWeek(date);
        const set = weeks.get(week) ?? new Set<string>();
        set.add(date);
        weeks.set(week, set);
        if (set.size >= WEEK_DAYS) return date;
      }
      return null;
    },
  },
  {
    id: 'always-warm',
    name: 'Warmed Up Every Time',
    detail: `${WARM_RUN} sessions in a row with the warmup ticked.`,
    find: (log) => {
      let run = 0;
      for (const session of log.completed) {
        // Rest days have no warmup to tick, so they neither count nor break
        // the run — otherwise this would be an achievement for never resting.
        if (isRest(session)) continue;
        run = session.warmup === true ? run + 1 : 0;
        if (run >= WARM_RUN) return session.date;
      }
      return null;
    },
  },
  {
    id: 'hard-outside',
    name: 'Hard Outside',
    detail: 'A day on rock where you sent as hard as you ever had.',
    // The bar comes from the whole log, indoors included — the claim is
    // that a day on rock matched everything you had done anywhere.
    find: (log) => firstAtLimit(log.completed, (session) => session.mode === 'outdoor'),
  },
  {
    id: 'straight-up',
    name: 'Straight Up',
    detail: 'A flash or on-sight as hard as anything you had sent.',
    find: (log) =>
      firstAtLimit(log.completed, (_session, climb) => climb.style === 'flash' || climb.style === 'onsight'),
  },
  {
    id: 'no-beta-outdoors',
    name: 'No Beta, No Roof',
    detail: 'An on-sight logged outdoors.',
    find: (log) =>
      log.completed.find(
        (s) => s.mode === 'outdoor' && s.climbs.some((c) => c.style === 'onsight' && c.result === 'send'),
      )?.date ?? null,
  },
  {
    id: 'whole-spread',
    name: 'The Whole Spread',
    detail: `${SPREAD_GRADES} different grades sent in a single session.`,
    find: (log) =>
      log.completed.find((s) => {
        const grades = new Set(
          s.climbs.filter((c) => c.result === 'send').map((c) => `${c.scale}${c.grade}`),
        );
        return grades.size >= SPREAD_GRADES;
      })?.date ?? null,
  },
  {
    id: 'persistence',
    name: 'Persistence',
    detail: `A project sent after ${BURNS_FOR_PERSISTENCE} logged burns or more.`,
    find: (log) => {
      const burns = new Map<string, number>();
      for (const session of log.completed) {
        for (const attempt of session.projectAttempts ?? []) {
          burns.set(attempt.projectId, (burns.get(attempt.projectId) ?? 0) + attempt.count);
        }
      }
      // Keyed on `sentDate`, not on `status`. A project sent and then
      // shelved keeps its send date and the app is careful never to flip it
      // back — filtering on status would have quietly dropped exactly the
      // long projects this is about.
      const sent = log.projects
        .filter((p) => p.sentDate !== undefined)
        .filter((p) => (burns.get(p.id) ?? 0) >= BURNS_FOR_PERSISTENCE)
        .map((p) => p.sentDate!)
        .sort();
      return sent[0] ?? null;
    },
  },
  {
    id: 'weekend-on-rock',
    name: 'A Weekend On Rock',
    detail: 'Two days outdoors, back to back.',
    find: (log) => outdoorRun(log, 2),
  },
  {
    id: 'a-trip',
    name: 'A Trip',
    detail: `${TRIP_DAYS} days outdoors in a row.`,
    find: (log) => outdoorRun(log, TRIP_DAYS),
  },
  {
    id: 'both-sides',
    name: 'Both Sides',
    detail: 'Sends logged on both the boulder and the route scale.',
    find: (log) => {
      const seen = new Set<GradeScale>();
      for (const session of log.completed) {
        for (const climb of session.climbs) {
          if (climb.result === 'send') seen.add(climb.scale);
        }
        if (seen.size >= 2) return session.date;
      }
      return null;
    },
  },
  {
    id: 'listened',
    name: 'Listened',
    detail: `A rest day logged straight after a session at RPE ${MAXIMAL_RPE} or more.`,
    find: (log) => {
      for (let i = 1; i < log.completed.length; i++) {
        const before = log.completed[i - 1]!;
        const after = log.completed[i]!;
        if (!isRest(after) || isRest(before)) continue;
        if ((before.rpe ?? 0) < MAXIMAL_RPE) continue;
        if (daysBetween(before.date, after.date) !== 1) continue;
        return after.date;
      }
      return null;
    },
  },
  {
    id: 'block-finished',
    name: 'A Block Finished',
    detail: 'A program carried through every one of its weeks.',
    find: (log) => {
      const byProgram = new Map<string, Session[]>();
      for (const session of log.completed) {
        if (session.programId === undefined) continue;
        byProgram.set(session.programId, [...(byProgram.get(session.programId) ?? []), session]);
      }
      let earliest: string | null = null;
      for (const [programId, sessions] of byProgram) {
        const weeks = log.programWeeks(programId);
        if (weeks === undefined || weeks <= 0) continue;
        const start = sessions[0]!.date;
        // Every 7-day block from the first session of that program has to
        // contain one. A program you started, abandoned and picked up a year
        // later has the sessions but not the block.
        const covered = new Set<number>();
        for (const session of sessions) {
          const week = Math.floor(daysBetween(start, session.date) / 7);
          if (week >= 0 && week < weeks) covered.add(week);
        }
        if (covered.size < weeks) continue;
        const last = sessions
          .filter((s) => Math.floor(daysBetween(start, s.date) / 7) < weeks)
          .at(-1)!.date;
        if (earliest === null || last < earliest) earliest = last;
      }
      return earliest;
    },
  },
  {
    id: 'twice-in-a-day',
    name: 'Twice in a Day',
    detail: 'Two separate training sessions logged on one date.',
    // Rest days do not count: a session and a rest day on the same date is
    // a day with a rest day in it, not two sessions.
    find: (log) =>
      log.dates.find((date) => (log.byDate.get(date) ?? []).filter((s) => !isRest(s)).length >= 2) ??
      null,
  },
  {
    id: 'long-haul',
    name: 'The Long Haul',
    detail: `A single session of ${LONG_SESSION_MIN / 60} hours or more.`,
    find: (log) => log.completed.find((s) => (s.durationMin ?? 0) >= LONG_SESSION_MIN)?.date ?? null,
  },
  {
    id: 'both-ends',
    name: 'Both Ends',
    detail: `One week holding a session at RPE ${EASY_RPE} or less and one at RPE ${MAXIMAL_RPE} or more.`,
    // Training with a range in it, which is the thing a climber who only
    // ever goes medium never has. An earlier draft of this list had "trained
    // on all seven weekdays" here; three hundred identical sessions earned
    // it, which is exactly what this module says an achievement is not.
    find: (log) => {
      const weeks = new Map<string, Session[]>();
      for (const session of log.completed) {
        if (isRest(session)) continue;
        const week = startOfWeek(session.date);
        weeks.set(week, [...(weeks.get(week) ?? []), session]);
      }
      const found = [...weeks.values()]
        .filter((sessions) => sessions.some((s) => s.rpe !== undefined && s.rpe <= EASY_RPE))
        .filter((sessions) => sessions.some((s) => (s.rpe ?? 0) >= MAXIMAL_RPE))
        .map((sessions) => sessions.at(-1)!.date)
        .sort();
      return found[0] ?? null;
    },
  },
  {
    id: 'clean-sheet',
    name: 'Clean Sheet',
    detail: `A session of ${CLEAN_SHEET_CLIMBS} climbs or more with no failed attempt in it.`,
    find: (log) =>
      log.completed.find((s) => {
        const climbs = s.climbs.reduce((n, c) => n + c.count, 0);
        return climbs >= CLEAN_SHEET_CLIMBS && s.climbs.every((c) => c.result === 'send');
      })?.date ?? null,
  },
  {
    id: 'the-double',
    name: 'The Double',
    detail: 'Two projects sent on the same day.',
    find: (log) => {
      const byDay = new Map<string, number>();
      for (const project of log.projects) {
        if (project.sentDate === undefined) continue;
        byDay.set(project.sentDate, (byDay.get(project.sentDate) ?? 0) + 1);
      }
      return [...byDay.entries()].filter(([, n]) => n >= 2).map(([date]) => date).sort()[0] ?? null;
    },
  },
  {
    id: 'both-in-a-day',
    name: 'Both in a Day',
    detail: 'A boulder and a route, both sent in one session.',
    find: (log) =>
      log.completed.find((s) => {
        const scales = new Set(s.climbs.filter((c) => c.result === 'send').map((c) => c.scale));
        return scales.has('V') && scales.has('YDS');
      })?.date ?? null,
  },
  {
    id: 'deload-honoured',
    name: 'Deload Honoured',
    detail: `A deload week where nothing went above RPE ${DELOAD_RPE_CAP}.`,
    // The whole week, not the marked sessions: a deload with one maximal
    // session in it was not a deload, and reading only the marked ones
    // would let that pass.
    find: (log) => {
      const weeks = new Map<string, Session[]>();
      for (const session of log.completed) {
        const week = startOfWeek(session.date);
        weeks.set(week, [...(weeks.get(week) ?? []), session]);
      }
      const honoured = [...weeks.entries()]
        .filter(([, sessions]) => sessions.some((s) => s.deload === true))
        .filter(([, sessions]) => sessions.filter((s) => !isRest(s)).length >= 2)
        .filter(([, sessions]) => sessions.every((s) => (s.rpe ?? 0) <= DELOAD_RPE_CAP))
        .map(([, sessions]) => sessions.at(-1)!.date)
        .sort();
      return honoured[0] ?? null;
    },
  },
  {
    id: 'the-comeback',
    name: 'The Comeback',
    detail: `A send at your limit within ${COMEBACK_DAYS} days of coming back from a break.`,
    find: (log) => {
      // The days that sit inside a comeback window, worked out first so the
      // limit check stays the shared one.
      const windows: string[] = [];
      for (let i = 1; i < log.dates.length; i++) {
        if (daysBetween(log.dates[i - 1]!, log.dates[i]!) >= BREAK_DAYS) windows.push(log.dates[i]!);
      }
      const inWindow = (date: string): boolean =>
        windows.some((start) => date >= start && daysBetween(start, date) <= COMEBACK_DAYS);
      return firstAtLimit(log.completed, (session) => inWindow(session.date));
    },
  },
  {
    id: 'months-outside',
    name: 'Three Months Outside',
    detail: `Days on rock in ${OUTDOOR_MONTHS} different months of one year.`,
    find: (log) => {
      const years = new Map<string, Set<string>>();
      for (const session of log.completed) {
        if (session.mode !== 'outdoor') continue;
        const year = session.date.slice(0, 4);
        const months = years.get(year) ?? new Set<string>();
        months.add(session.date.slice(5, 7));
        years.set(year, months);
        if (months.size >= OUTDOOR_MONTHS) return session.date;
      }
      return null;
    },
  },
  {
    id: 'rested-and-ready',
    name: 'Rested and Ready',
    detail: 'A send at your limit the day after a logged rest day.',
    // The other side of Listened: that one is for taking the rest, this one
    // is for what the rest was for.
    find: (log) => {
      const after = new Set<string>();
      for (const session of log.completed) {
        if (isRest(session)) after.add(addDays(session.date, 1));
      }
      if (after.size === 0) return null;
      return firstAtLimit(log.completed, (session) => after.has(session.date));
    },
  },
  {
    id: 'redemption',
    name: 'Redemption',
    detail: 'A grade you had only ever failed on, sent in a later session.',
    // A later session, not the same one: attempting a grade and then
    // sending it in the same session is a normal working session, and
    // calling that redemption would hand it out for ordinary climbing.
    find: (log) => {
      const failed = new Set<string>();
      for (const session of log.completed) {
        for (const climb of session.climbs) {
          if (climb.result === 'send' && failed.has(`${climb.scale}${climb.grade}`)) return session.date;
        }
        for (const climb of session.climbs) {
          if (climb.result === 'attempt') failed.add(`${climb.scale}${climb.grade}`);
        }
      }
      return null;
    },
  },
];

/** A logged rest day: the checklist is there and nothing was climbed. */
function isRest(session: Session): boolean {
  return session.restChecklist !== undefined && session.climbs.length === 0;
}

/**
 * The first session holding a send that matched everything before it, on its
 * own ladder — with `extra` narrowing which climbs count.
 *
 * **Per ladder, because they are different ladders.** An ordinal is an index
 * into its own scale and the two are not the same length: 5.11a and V10 both
 * come out as 10. Comparing across them — which the first version did — made
 * a climber who logs boulders *and* routes have their "hardest" decided by
 * whichever ladder had more rungs underneath them, so a V7 boulderer who had
 * also led a 5.11a could never earn a limit achievement on the wall they
 * actually climb.
 *
 * **Measured against the log as it stood that day, not as it stands now.**
 * Checking against the all-time maximum meant *getting better took an
 * achievement away*: flash your limit at V7, send V9 a year later, and the
 * flash silently stopped counting. These are facts about a day.
 */
function firstAtLimit(
  completed: Session[],
  matches: (session: Session, climb: Session['climbs'][number]) => boolean,
): string | null {
  const best = new Map<GradeScale, number>();
  for (const session of completed) {
    let earned = false;
    // Two passes over one session's climbs: a send earlier in the same
    // session must not raise the bar a later one is judged against.
    for (const climb of session.climbs) {
      if (climb.result !== 'send') continue;
      const ordinal = gradeOrdinal(climb.scale, climb.grade);
      if (ordinal < 0) continue;
      if (matches(session, climb) && ordinal >= (best.get(climb.scale) ?? 0)) earned = true;
    }
    for (const climb of session.climbs) {
      if (climb.result !== 'send') continue;
      const ordinal = gradeOrdinal(climb.scale, climb.grade);
      if (ordinal < 0) continue;
      if (ordinal > (best.get(climb.scale) ?? -1)) best.set(climb.scale, ordinal);
    }
    if (earned) return session.date;
  }
  return null;
}

/** The last day of the first run of `length` consecutive outdoor days. */
function outdoorRun(log: Log, length: number): string | null {
  const outdoor = [...new Set(log.completed.filter((s) => s.mode === 'outdoor').map((s) => s.date))].sort();
  let run = 1;
  for (let i = 1; i <= outdoor.length; i++) {
    if (run >= length) return outdoor[i - 1]!;
    if (i === outdoor.length) break;
    run = daysBetween(outdoor[i - 1]!, outdoor[i]!) === 1 ? run + 1 : 1;
  }
  return run >= length ? outdoor.at(-1)! : null;
}

export function deriveAchievements(input: AchievementInput): Achievement[] {
  const completed = [...input.sessions]
    .filter((s) => s.completed)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));

  const byDate = new Map<string, Session[]>();
  for (const session of completed) {
    byDate.set(session.date, [...(byDate.get(session.date) ?? []), session]);
  }

  const log: Log = {
    completed,
    byDate,
    dates: [...byDate.keys()],
    projects: input.projects ?? [],
    programWeeks: input.programWeeks ?? (() => undefined),
  };

  return DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    detail: definition.detail,
    date: definition.find(log),
  }));
}

/** How many of the fixed set the log has earned. */
export function earnedCount(achievements: readonly Achievement[]): number {
  return achievements.filter((a) => a.date !== null).length;
}

/** Earned first and newest among those; the rest keep their listed order. */
export function sortAchievements(achievements: readonly Achievement[]): Achievement[] {
  const earned = achievements.filter((a) => a.date !== null).sort((a, b) => (a.date! < b.date! ? 1 : -1));
  const rest = achievements.filter((a) => a.date === null);
  return [...earned, ...rest];
}

/** The total, so a screen can say "nine of fourteen" without counting. */
export const ACHIEVEMENT_COUNT = DEFINITIONS.length;
