/**
 * Did you do the work the plan placed? (PLAN.md M91)
 *
 * The app puts specific session *types* on specific days and never once
 * asked which of them happened. `review.adherence` counts sessions against
 * a weekly *number*, which cannot tell four climbing sessions from four
 * skipped Finger Protocols — and `session.planned` was read by one function
 * merging two records.
 *
 * **The week is the unit, not the day.** A climber who moves Tuesday's
 * session to Wednesday did the work; scoring against the exact date would
 * call that two misses and would make the number say more about a person's
 * diary than about their training. So each week is asked what it placed and
 * what it got, by type, and the days inside it do not matter.
 *
 * **A part-finished week counts only its elapsed days.** Otherwise every
 * climber is behind from Sunday to Saturday, which is a number that teaches
 * you to ignore the number.
 */

import type { Program } from '@/content/types';
import type { Session } from '@/db/sessions';
import { addDays, daysBetween } from './dates';
import { blockWindow, plannedDay } from './plan';
import type { WeekOverrides } from './reschedule';
import type { WeekPlan } from './scheduler';
import { isRestSession } from './rest';
import { joinList } from './phrase';

export interface TypeAdherence {
  typeId: string;
  /** Snapshot of the name, so a row reads without the program in hand. */
  name: string;
  icon: string;
  planned: number;
  done: number;
  /** Sessions of this type beyond what its weeks asked for. */
  extra: number;
}

export interface BlockAdherence {
  from: string;
  to: string;
  /** The last day counted: the block's last, or today if sooner. */
  through: string;
  /** Weeks with at least one elapsed day. */
  weeks: number;
  types: TypeAdherence[];
  planned: number;
  done: number;
  /**
   * Completed sessions inside the window that the plan did not place —
   * logged by hand, or a type the program does not have. Not a failure:
   * the number is there so "you did less than the plan asked" cannot be
   * said to someone who was training the whole time.
   */
  unplanned: number;
}

export interface AdherenceInput {
  program: Program;
  startDate: string;
  plan: WeekPlan;
  overrides?: WeekOverrides | undefined;
  sessions: readonly Session[];
  today: string;
}

/** Every date from `from` to `to`, inclusive. */
function daysIn(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = 0; i <= daysBetween(from, to); i++) out.push(addDays(from, i));
  return out;
}

export function blockAdherence(input: AdherenceInput): BlockAdherence | null {
  const { from, to } = blockWindow(input.program, input.startDate);
  const through = input.today < to ? input.today : to;
  if (through < from) return null;

  const known = new Map(input.program.sessionTypes.map((t) => [t.id, t]));
  const counts = new Map<string, TypeAdherence>();
  const count = (typeId: string): TypeAdherence => {
    const existing = counts.get(typeId);
    if (existing) return existing;
    const type = known.get(typeId)!;
    const row: TypeAdherence = { typeId, name: type.name, icon: type.icon, planned: 0, done: 0, extra: 0 };
    counts.set(typeId, row);
    return row;
  };

  const done = input.sessions.filter(
    (s) => s.completed && s.date >= from && s.date <= through && !isRestSession(s),
  );
  let unplanned = 0;
  for (const session of done) {
    const type = session.sessionTypeId ? known.get(session.sessionTypeId) : undefined;
    if (!type || type.isRest === true) unplanned++;
  }

  let weeks = 0;
  for (let start = from; start <= through; start = addDays(start, 7)) {
    weeks++;
    const end = addDays(start, 6) < through ? addDays(start, 6) : through;

    const placed = new Map<string, number>();
    for (const date of daysIn(start, end)) {
      const day = plannedDay(input.program, input.startDate, input.plan, date, input.overrides);
      if (!day.sessionType || day.isRest) continue;
      placed.set(day.sessionType.id, (placed.get(day.sessionType.id) ?? 0) + 1);
    }

    const logged = new Map<string, number>();
    for (const session of done) {
      if (session.date < start || session.date > end) continue;
      const type = session.sessionTypeId ? known.get(session.sessionTypeId) : undefined;
      if (!type || type.isRest === true) continue;
      logged.set(type.id, (logged.get(type.id) ?? 0) + 1);
    }

    for (const [typeId, asked] of placed) {
      const row = count(typeId);
      const got = logged.get(typeId) ?? 0;
      row.planned += asked;
      row.done += Math.min(asked, got);
      row.extra += Math.max(0, got - asked);
    }
    // A type the program has but this week did not place. Every one of
    // those sessions is extra, and counting it against another week's
    // shortfall would let a double Tuesday pay for a missed Friday.
    for (const [typeId, got] of logged) {
      if (placed.has(typeId)) continue;
      count(typeId).extra += got;
    }
  }

  const types = [...counts.values()].sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));
  return {
    from,
    to,
    through,
    weeks,
    types,
    planned: types.reduce((sum, t) => sum + t.planned, 0),
    done: types.reduce((sum, t) => sum + t.done, 0),
    unplanned,
  };
}

/** How far behind a type is, as a share of what it asked for. */
function shortfall(type: TypeAdherence): number {
  return type.planned === 0 ? 0 : (type.planned - type.done) / type.planned;
}

/**
 * The verdict, in one sentence.
 *
 * Leads with what was missed rather than what was done: "9 of 12 Finger
 * Protocol" is only worth saying about the sessions that did not happen.
 * Null when the plan placed nothing, because there is no adherence to a
 * plan that asked for nothing.
 */
export function describeAdherence(a: BlockAdherence): string | null {
  if (a.planned === 0) return null;

  const extra =
    a.unplanned === 0
      ? ''
      : ` You also logged ${a.unplanned} ${a.unplanned === 1 ? 'session' : 'sessions'} the plan did not place.`;

  const missed = a.types.filter((t) => t.done < t.planned).sort((x, y) => shortfall(y) - shortfall(x));
  if (missed.length === 0) {
    return `You did every session the plan placed — all ${a.planned} of them.${extra}`;
  }

  const named = joinList(missed.slice(0, 2).map((t) => `${t.done} of ${t.planned} ${t.name}`));
  const rest =
    missed.length > 2 ? `, and ${missed.length - 2} other ${missed.length - 2 === 1 ? 'type' : 'types'} short` : '';
  return `You did ${named}${rest}. That is ${a.done} of ${a.planned} sessions the plan placed.${extra}`;
}
