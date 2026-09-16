/**
 * The named climbs a run passes, marked while it is still going (PLAN.md M232).
 *
 * M210 gave every run a climb it had heard of — *past El Capitan* rather
 * than `950 m` — but only once the run was over. Nothing marked passing one
 * *during* it, and the run itself has no shape to speak of: `config.ts` says
 * so out loud, that after ninety seconds "nothing changes again — the wall is
 * as hard as it gets, and staying on it is the whole test".
 *
 * ## The obvious version marks the wrong end of the run
 *
 * `CLIMBS_TO_EVEREST` is ten rungs from a 45 ft gym wall to Everest, and it
 * is the ladder M210 names a finished run against. Timed against the ramp,
 * it is spent long before the problem it was meant to fix begins:
 *
 * ```
 * First gym wall   45 ft    0.2s     Mt. Whitney   14,505 ft   32s
 * Devils Tower    867 ft    2.9s     Kilimanjaro   19,341 ft   40s
 * Half Dome     2,000 ft    6.2s     Denali        20,310 ft   41s
 * El Capitan    2,900 ft    8.7s     Aconcagua     22,838 ft   45s
 * Mt. Washington 5,790 ft   15.6s    Everest       29,032 ft   55s
 * ```
 *
 * Four of them fire inside the first nine seconds — during the acceleration,
 * which is the part of a run that already has a shape — and Everest is behind
 * you at 55 seconds, **thirty-five seconds before the flat stretch even
 * starts**. Marking that ladder alone would put every announcement where one
 * is least wanted and none at all where one is most.
 *
 * ## The rungs M210 rejected are the ones this needs
 *
 * `MILESTONES` carries thirteen more above Everest — the other
 * eight-thousanders, **stacked**, so K2's entry reads 57,283 ft because it
 * sits on Everest's shoulders. M210 left those out on the grounds that a rung
 * naming a finished run should be a height and not a running total.
 *
 * For a mark passed *during* a run that reasoning inverts. A run is
 * cumulative distance, so a running total is exactly the right shape, and
 * past the speed cap they land every 43–45 seconds for as long as anyone can
 * stay on the wall. The flat stretch is the part of the ladder that fits it.
 *
 * ## Two filters, and neither is a taste
 *
 * A hand-picked list goes stale the first time `SPEED` is retuned, so both
 * cuts are derived from the tuning they have to agree with:
 *
 * - **Below `SPAWN.grace`, nothing is marked.** A run climbs two screens
 *   before the first row spawns, so a mark under 1,680 ft would be announced
 *   over an empty wall. That drops the gym wall and Devils Tower.
 * - **Nothing is marked within `MARK_HOLD_MS` of the mark below it**, timed
 *   at the fastest a run can go — Free Solo's 1.3× — because a pair that
 *   cannot collide *there* cannot collide anywhere. That drops Denali alone,
 *   which sits 969 ft above Kilimanjaro and 1.2 seconds behind it.
 *
 * El Capitan survives by four tenths of a second, which is the right outcome
 * and not one a hand-picked list would have argued for.
 *
 * ## This is a comparison and never a credit
 *
 * `altimeter.ts` opens by promising that no game action adds a single foot,
 * and M210 kept that promise. So does this: it reads the ladder to place a
 * line and writes nothing back. The wall is one-way, and a run that crosses
 * Everest here has not climbed a foot of the real one.
 */

import { MILESTONES, type Milestone } from '../altimeter';
import { METRES_PER_PX, SPAWN, SPEED } from './config';
import { feetFromMetres } from '../units';

/**
 * How long a crossing is announced for.
 *
 * It is exported and read by the spacing filter below, so the list can never
 * contain two marks that would be on screen at once. Raising it thins the
 * ladder rather than stacking the banners.
 */
export const MARK_HOLD_MS = 1_600;

export interface Mark extends Milestone {
  /** Climbed distance in simulation pixels, which is what a run counts in. */
  px: number;
}

/** Feet of lifetime-altimeter height, as one pixel of climbed wall. */
const FEET_PER_PX = feetFromMetres(METRES_PER_PX);

/**
 * When a run reaches `px`, on the wall as tuned and played straight.
 *
 * Closed form rather than a simulation, because the derivation below runs at
 * module load. It is the integral of `currentSpeed`: a linear ramp to the
 * cap and a constant after it. `multiplier` is the mode and boon scaling,
 * which multiplies speed and so divides distance — the cap is reached at the
 * same *moment* whatever it is, which is why it is applied to the distance
 * rather than to the time.
 *
 * Deliberately ignores slow-mo and `rampReduction`: both make a run slower,
 * and the spacing filter wants the fastest case.
 */
export function secondsToClimb(px: number, multiplier = 1): number {
  const capSeconds = (SPEED.max - SPEED.base) / SPEED.rampPerSecond;
  const capDistance = SPEED.base * capSeconds + (SPEED.rampPerSecond * capSeconds * capSeconds) / 2;
  const distance = Math.max(0, px) / multiplier;
  if (distance <= capDistance) {
    const { base, rampPerSecond: ramp } = SPEED;
    return (Math.sqrt(base * base + 2 * ramp * distance) - base) / ramp;
  }
  return capSeconds + (distance - capDistance) / SPEED.max;
}

function buildMarks(): Mark[] {
  const marks: Mark[] = [];
  let lastSeconds = -Infinity;
  for (const climb of MILESTONES) {
    const px = climb.feet / FEET_PER_PX;
    // Nothing is on the wall yet, so there is nothing to have climbed past.
    if (px < SPAWN.grace) continue;
    const seconds = secondsToClimb(px, SPEED.freeSoloMultiplier);
    if (seconds - lastSeconds < MARK_HOLD_MS / 1000) continue;
    lastSeconds = seconds;
    marks.push({ ...climb, px });
  }
  return marks;
}

/**
 * The ladder, thinned. Ascending, so a crossing scan can stop early.
 *
 * Built once at module load: it depends on nothing but the tuning tables, and
 * a run that derived its own would be a run whose marks could differ from
 * another run's on the same wall.
 */
export const RUN_MARKS: readonly Mark[] = buildMarks();

/**
 * The mark crossed by climbing from `before` to `after`, if any.
 *
 * Takes the interval rather than a position because a frame can advance
 * several hundred pixels — at the cap, a 60 Hz frame is 8 px and a
 * backgrounded tab resuming is 120 — and a mark tested only against the
 * current distance would be missed entirely on the frame that passed it.
 *
 * The **highest** one crossed, on the vanishing chance a single frame clears
 * two: announcing the lower of them would say you had passed something you
 * were already well above.
 */
export function markCrossed(before: number, after: number): Mark | null {
  // No guard for `after <= before`. It reads like one is wanted and it would
  // be dead code: a mark can only be found when it is above `before` and at
  // or below `after`, and no mark is both when the interval is empty or
  // backwards. A mutation battery deleting it survived, which is what dead
  // code does.
  let found: Mark | null = null;
  for (const mark of RUN_MARKS) {
    if (mark.px > after) break;
    if (mark.px > before) found = mark;
  }
  return found;
}

/** The marks between `from` and `to` pixels, for the renderer's viewport. */
export function marksBetween(from: number, to: number): Mark[] {
  return RUN_MARKS.filter((m) => m.px >= from && m.px <= to);
}

/**
 * The next mark above a run, as something to aim at. Null past the last rung.
 *
 * The ladder ends at fourteen eight-thousanders stacked — around six minutes
 * of perfect play — and inventing rungs past it would be inventing mountains.
 */
export function nextMark(px: number): Mark | null {
  return RUN_MARKS.find((m) => m.px > px) ?? null;
}
