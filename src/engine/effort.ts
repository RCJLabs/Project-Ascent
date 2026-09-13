/**
 * How hard a day that already happened actually was (PLAN.md M144).
 *
 * The month grid drew every completed day as the same ✅ — a two-hour limit
 * session and a twenty-minute flush were one tick — while the session itself
 * carries an RPE and the planned type carries an intensity. Planned days have
 * said something about their shape since M131 (LIMIT) and M67 before it (DL,
 * T); logged days said only *it happened*.
 *
 * ## RPE, not load, and not a quantile
 *
 * The consistency grid on Progress shades five levels from the same sessions
 * and is **not** the scale to reuse here, for a reason worth writing down: it
 * cuts its levels at quantiles of the window it is drawing. That is right for
 * a year of columns, where the question is *how did this year vary* — and
 * wrong for a month, where the same session would shade differently depending
 * on which month you were looking at, and a light month would make an easy
 * day look hard.
 *
 * RPE is already an absolute self-rating on a fixed 1-10 scale, which is what
 * the question *how hard was that day* wants. The four tiers are the app's own
 * four intensities, so one vocabulary covers the planned day and the logged
 * one.
 *
 * ## The hardest session of the day decides
 *
 * A date can hold several sessions — the logger indexes them `date#0`,
 * `date#1` — and a climber who did a hard morning and an easy evening had a
 * hard day. Taking the maximum is the same rule the week screen's load badge
 * follows.
 */

import type { Intensity, SessionType } from '@/content/types';
import type { Session } from '@/db/sessions';
import { intensityOf } from './scheduler';

/**
 * Where each intensity starts, hardest first.
 *
 * RPE 9 and 10 is limit work — the effort a climber can hold for a few
 * moves and not a session. 7-8 is the working range a hard day sits in,
 * 5-6 is moderate, and anything below is easy however long it lasted.
 */
export const RPE_TIERS: readonly (readonly [number, Intensity])[] = [
  [9, 'max'],
  [7, 'hard'],
  [5, 'moderate'],
  [1, 'easy'],
];

/** The tier an RPE falls in, or null when it is not an RPE at all. */
export function effortOfRpe(rpe: number | undefined): Intensity | null {
  if (rpe === undefined || !Number.isFinite(rpe)) return null;
  for (const [floor, intensity] of RPE_TIERS) {
    if (rpe >= floor) return intensity;
  }
  return null;
}

/**
 * How hard a logged day was, from what the day itself says.
 *
 * The hardest RPE across the day's completed sessions, and where nobody
 * rated one, the intensity the program planned for that day. Null when
 * neither is known — a session logged as a note has nothing to read, and
 * shading it would be the app inventing a number.
 */
export function effortOfDay(
  sessions: readonly Session[],
  planned?: SessionType | undefined,
): Intensity | null {
  let hardest: number | undefined;
  for (const session of sessions) {
    if (!session.completed) continue;
    const rpe = session.rpe;
    if (rpe === undefined) continue;
    hardest = hardest === undefined ? rpe : Math.max(hardest, rpe);
  }
  const rated = effortOfRpe(hardest);
  if (rated !== null) return rated;
  // The plan is a weaker statement than the climber's own rating — it is
  // what was asked for, not what was done — so it only speaks when nothing
  // was rated. A rest day planned is not an effort logged.
  if (planned === undefined || planned.isRest) return null;
  return intensityOf(planned);
}
