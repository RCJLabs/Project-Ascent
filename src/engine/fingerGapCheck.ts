/**
 * The check itself: finger sessions closer than the gap (PLAN.md M345).
 *
 * Out of `fingerGap.ts`, whose reading of what counts as a finger session
 * the first load needs. The check over the log runs only in the coach and
 * the program safety notes, both lazy.
 */

import type { Session } from '@/db/sessions';
import { daysBetween } from './dates';
import { loadsFingersDirectly } from './fingerGap';

/**
 * The number eleven programs chose, and the one General Training states in
 * prose. Exported so a test can hold the app to its own content.
 */
export const FINGER_GAP_HOURS = 48;

export interface FingerGaps {
  /** Finger sessions inside the window — the sample the count is out of. */
  sessions: number;
  /** Consecutive pairs closer together than the gap allows. */
  breaches: number;
  /** The tightest of them, in hours. */
  tightestHours: number;
  /** The date of the second session in the tightest pair. */
  on: string;
}

/**
 * How often two finger sessions landed inside the gap.
 *
 * Null when there is nothing worth saying: fewer than two breaches, or not
 * enough finger sessions for two to be a pattern rather than a fortnight.
 * Day-granular, like `planVsLog`'s own spacing check — the log stores dates,
 * not times, so back-to-back days are 24 hours and the same day is none.
 */
export function fingerGaps(
  sessions: readonly Session[],
  today: string,
  hours: number = FINGER_GAP_HOURS,
): FingerGaps | null {
  const dates = sessions
    .filter((s) => loadsFingersDirectly(s))
    .map((s) => s.date)
    .filter((date) => date <= today && daysBetween(date, today) <= FINGER_GAP_WINDOW_DAYS)
    .sort();
  // Two sessions cannot breach a gap on their own often enough to matter,
  // and a climber with three finger sessions in eight weeks is not the one
  // this is for.
  if (dates.length < FINGER_GAP_BREACHES + 2) return null;

  let breaches = 0;
  let tightest = hours;
  let on = '';
  for (let i = 1; i < dates.length; i += 1) {
    const gap = Math.abs(daysBetween(dates[i - 1]!, dates[i]!)) * 24;
    if (gap >= hours) continue;
    breaches += 1;
    if (gap <= tightest) {
      tightest = gap;
      on = dates[i]!;
    }
  }
  if (breaches < FINGER_GAP_BREACHES) return null;
  return { sessions: dates.length, breaches, tightestHours: tightest, on };
}

/** Breaches below this are a bad week rather than a habit — `planVsLog` uses
 *  the same threshold on the same kind of question. */
export const FINGER_GAP_BREACHES = 2;

/** How far back to look. Long enough for a pattern, short enough to be about
 *  how the climber is training now. */
export const FINGER_GAP_WINDOW_DAYS = 56;
