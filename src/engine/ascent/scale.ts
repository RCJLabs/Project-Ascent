/**
 * What a run on the wall would have climbed (PLAN.md M210).
 *
 * The Ascent measured everything in metres and printed them raw: `1,063 m`,
 * five times on its own page, on the share card that leaves the app and in
 * the sentence under the month's chart. Two things were wrong with that.
 *
 * **The unit was not the climber's.** Every other height in this app runs
 * through `formatHeight` against the units setting — the altimeter card, the
 * career page, the trips — and the one screen that did not was the game. A
 * climber who logs in feet met metres here and nowhere else.
 *
 * **And a bare height says nothing.** 950 m is a number; *past El Capitan*
 * is a climb. The app already owns that ladder — ten named climbs from a
 * single gym wall to Everest — and had never once used it to say what a run
 * amounted to.
 *
 * ## This is a comparison, never a credit
 *
 * `altimeter.ts` opens by promising that **no game action adds a single
 * foot**, and that is the reason the altimeter means anything. Nothing here
 * touches it: this reads the ladder to name a scale and writes nothing back,
 * and the copy says *past* a climb rather than claiming one. A run is still
 * worth exactly what `rewards.ts` pays for it, which is capped.
 */

import { CLIMBS_TO_EVEREST, type Milestone } from '../altimeter';
import { feetFromMetres, formatHeight, heightValue, unitLabel, type UnitSystem } from '../units';

const EVEREST_FEET = CLIMBS_TO_EVEREST.at(-1)!.feet;

/**
 * A run's height, in the units the climber reads everything else in.
 *
 * Split as well as joined, because the card shown when a run ends sets the
 * number at four times the size of its unit and would otherwise have to take
 * the string apart again.
 */
export interface RunHeight {
  /** The number, with a thousands separator. */
  value: string;
  /** `m` or `ft`. */
  unit: string;
  /** The two of them, which is what every other place wants. */
  label: string;
}

export function runHeight(metres: number, units: UnitSystem): RunHeight {
  const value = heightValue(feetFromMetres(metres), units).toLocaleString();
  const unit = unitLabel('ft', units);
  return { value, unit, label: `${value} ${unit}` };
}

/**
 * The tallest named climb a run of this height would have topped out.
 *
 * Null below the first rung: a 9 m run has not cleared a single gym wall and
 * saying so is a joke at the climber's expense on their first attempt.
 */
export function matchedClimb(metres: number): Milestone | null {
  const feet = feetFromMetres(metres);
  let found: Milestone | null = null;
  for (const climb of CLIMBS_TO_EVEREST) {
    if (climb.feet > feet) break;
    found = climb;
  }
  return found;
}

/**
 * The next one up, as something to aim at. Null once Everest is behind you,
 * because the ladder above it is thirteen peaks within 800 m of each other.
 */
export function nextClimb(metres: number): Milestone | null {
  const feet = feetFromMetres(metres);
  return CLIMBS_TO_EVEREST.find((c) => c.feet > feet) ?? null;
}

/** Whole Everests in a run, for the climbers who get past one. */
export function everests(metres: number): number {
  return Math.floor(feetFromMetres(metres) / EVEREST_FEET);
}

/**
 * The scale of a run, in one sentence, or null while it is shorter than a
 * gym wall.
 *
 * Names what was cleared and what is next, because the altimeter's own page
 * reads that way — *reached*, and *on the way to* — and the game borrowing
 * its voice is the point of borrowing its ladder.
 */
export function describeScale(metres: number, units: UnitSystem): string | null {
  const climb = matchedClimb(metres);
  if (climb === null) return null;

  const laps = everests(metres);
  if (laps >= 2) return `Past Everest, ${laps} times over.`;

  const next = nextClimb(metres);
  if (next === null) return 'Past Everest.';

  const gap = formatHeight(next.feet - feetFromMetres(metres), units);
  return `Past ${climb.name}. ${next.name} is ${gap} higher.`;
}
