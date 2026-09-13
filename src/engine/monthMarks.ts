/**
 * What a month of the calendar actually carries (PLAN.md M145).
 *
 * The legend was written independently of the loop that draws the squares
 * and drifted from it in both directions: one row reading *Planned session*
 * for a month holding several different ones, and a row explaining a LIMIT
 * marker on blocks like Iron Grip whose two working days are both hard and
 * neither of which is a limit day — a key to a mark a climber could look
 * for and never find.
 *
 * Pure, and separate from the page, so the rule can be held against
 * fixtures the calendar cannot easily be put into: a limit day that falls
 * in the leading week, two session types a custom program gave the same
 * name, a month whose only logged day is a trailing one.
 *
 * ## The two gates are not the same gate
 *
 * The cell draws a session icon and a logged tick on **every** square,
 * including the leading and trailing days borrowed from the months either
 * side; it draws LIMIT, DL and T only `inMonth`. This mirrors that exactly,
 * because a legend that gates differently from the grid is the bug it
 * exists to prevent.
 */

import type { SessionType } from '@/content/types';
import { intensityOf } from './scheduler';

/** One square, reduced to what the legend needs to know about it. */
export interface MarkedDay {
  /** Whether the square belongs to the month being shown. */
  inMonth: boolean;
  /** True when anything logged on that day was finished. */
  done: boolean;
  /** The session planned there, or undefined for a rest day or none. */
  type?: SessionType | undefined;
  isDeload?: boolean | undefined;
  /** Present when the week carries an assessment. */
  test?: unknown;
}

export interface MonthMarks {
  /** Every distinct session type the grid draws, in the order it meets them. */
  types: SessionType[];
  logged: boolean;
  limit: boolean;
  deload: boolean;
  test: boolean;
}

export function monthMarks(days: readonly MarkedDay[]): MonthMarks {
  // Keyed by id, not by name: a custom program may give two session types
  // the same name, and collapsing them would drop one from the key while
  // the grid went on drawing both.
  const types = new Map<string, SessionType>();
  let logged = false;
  let limit = false;
  let deload = false;
  let test = false;
  for (const day of days) {
    if (day.done) logged = true;
    if (day.type) types.set(day.type.id, day.type);
    if (!day.inMonth) continue;
    if (day.type && intensityOf(day.type) === 'max') limit = true;
    if (day.isDeload) deload = true;
    if (day.test !== undefined) test = true;
  }
  return { types: [...types.values()], logged, limit, deload, test };
}

/** Whether there is anything for a legend to explain at all. */
export function worthExplaining(marks: MonthMarks): boolean {
  return marks.logged || marks.types.length > 0;
}
