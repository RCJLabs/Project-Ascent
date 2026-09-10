import type { Session } from '@/db/sessions';
import type { Project } from '@/db/projects';
import { daysBetween, startOfWeek } from './dates';
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
 * Fourteen, fixed. "Nine of fourteen" is a thing to aim at in a way that
 * "250 sends, then 500" is not — the counters are a timeline, and this is a
 * list. Adding one later is a deliberate act, not an emergent consequence of
 * logging more.
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
  | 'block-finished';

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
