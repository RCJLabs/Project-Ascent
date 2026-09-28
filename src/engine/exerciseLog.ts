/**
 * What you actually lifted, read back (PLAN.md M98).
 *
 * ## The hole this fills
 *
 * `Session.completedExercises` was a list of names. Iron Grip's Hammer phase
 * states its goal as **"Progress added load weekly"** and prescribes
 * `load: '85-90% max added weight'` — one static string for four weeks —
 * and the app's only question about it was whether you did it. Eleven phase
 * goals across seven programs describe a progression like that, and M33's
 * `constantDose` says the same thing from the other side: twelve blocks run
 * an identical dose all block because the progression "lives in intensity,
 * grade choice and session length — dimensions this model has no field for".
 *
 * The block report is not the answer either. It reads `metrics`, which are
 * assessments: tested at a phase boundary, a handful of times a block. What
 * happened between tests — the working weight that crept up every week —
 * was written nowhere.
 *
 * ## Nothing is inferred
 *
 * Every number here was typed by the climber. A prescription's dose is prose
 * (`'3-5'`, `'60-70% max added weight'`, `'BW+15lb'`) and parsing it into a
 * starting value would put a number in the log that nobody did — the same
 * mistake `templates.ts` refuses when it declines to copy climbs forward.
 * The logger offers the *last* entry as a one-tap repeat, which is a number
 * the climber made, and the tap is what makes it a claim.
 *
 * ## Better is not a claim this module makes
 *
 * `blockReport` can say a metric moved the right way because every `Metric`
 * declares `higherIsBetter`. An exercise line declares nothing. More load is
 * usually progress; more reps at less load might be a deload, a phase
 * change, or a bad day, and the app cannot tell which. So a movement here is
 * reported as *from → to* per dimension and never as better or worse.
 *
 * Pure: sessions in, readings out.
 *
 * What the numbers say — the series, the prescription it is held against,
 * the sentences and the movement across a block — is in
 * `exerciseReadings.ts` (PLAN.md M344). This part is in the first load, for
 * the session editor and the plan check; only lazy pages read the rest.
 */

import type { LoggedExercise } from '@/db/sessions';

/** One exercise on one day. */
export interface LoggedPoint {
  date: string;
  sessionId: string;
  entry: LoggedExercise;
}

/** The dimensions an exercise can be logged in, in the order they read. */
export const DIMENSIONS = ['sets', 'reps', 'hold', 'load'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/**
 * Whether anything was written down beyond the tick.
 *
 * A bare `{ name }` means "I did this" and is the whole of what the old
 * `completedExercises` could say. It is not a reading, so it never becomes a
 * point on a series or a number to repeat.
 */
export function hasNumbers(entry: LoggedExercise): boolean {
  return DIMENSIONS.some((d) => entry[d] !== undefined);
}

/** Case- and space-insensitive, so "Max Hangs" and "max hangs" are one line. */
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
