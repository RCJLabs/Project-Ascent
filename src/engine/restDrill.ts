/**
 * What to do on the day the plan says do nothing (PLAN.md M164).
 *
 * M132 wrote twelve drills for a day with no wall in it — a closed gym, a
 * tweaked pulley, a hotel room — and they are the only twelve in a library of
 * 156 that belong to no program. Measured rather than read off the ids: 144
 * drills carry a non-empty `sources`, the twelve that do not are exactly what
 * `offWallDrills()` returns, and all twelve declare `equipment: ['none']`.
 *
 * **And all thirteen shipped programs schedule rest days.** Every one of them
 * ships a session type with `isRest`, and the pre-session card renders that
 * day as *"Rest day · week 3. Recovery is training — log it to bank it."* The
 * drills written for precisely that day sit behind a toggle in a library, and
 * `offWallDrills()` had no caller in the app at all — only its own test.
 *
 * ## Which one, and why it is not all twelve
 *
 * A list of twelve on a rest day is a menu, and the day this is for is a day
 * something is already wrong with. One drill, named, with its duration on it.
 *
 * Two of the twelve are excluded by rule rather than by taste:
 *
 * - **`category: 'power'`.** `off_tension_holds` is twelve to fifteen minutes
 *   of hollow and arch holds. That is training. Offering it on a rest day
 *   would be the app contradicting the plan it just rendered.
 * - **Anything that loads what the climber said is hurt**, through `drillConflict`
 *   — the same reading M153 put in the logger and M161 put on the assessments.
 *   `off_wrist_forearm_prep` loads `fingers`, `shoulder` and `forearm`, and a
 *   climber with a hurt finger should not meet it on the one day they are
 *   resting it.
 *
 * `off_easy_aerobic` is *not* excluded despite being `endurance`: the recovery
 * checklist this app has shipped since M94 has *"Walking / Zone 1"* as one of
 * its four items, so zone-one aerobic work is already part of what this app
 * means by a rest day.
 *
 * ## Rotation, not randomness
 *
 * The coach's house rule is that the same log always produces the same advice,
 * so the choice is a function of the date. Two rest days in a row get different
 * drills; the same rest day re-opened gets the same one, and a screenshot in a
 * test is stable.
 */

import { offWallDrills } from '@/content/drills';
import type { BodyPart } from '@/content/bodyParts';
import type { Drill } from '@/content/types';
import { drillConflict } from './bodyLoad';
import { daysBetween } from './dates';

/** The rotation's origin. Any fixed date works; this is the app's own epoch. */
const EPOCH = '2026-01-01';

/**
 * The drills that belong on a day off, in a stable order.
 *
 * Derived from `offWallDrills()` rather than listed, so a thirteenth off-wall
 * drill is offered the day it is written and a twelfth that changes category
 * drops out on its own.
 */
export function restDayDrills(): Drill[] {
  return offWallDrills().filter((drill) => drill.category !== 'power');
}

/**
 * One drill for one rest day, or null when everything is ruled out.
 *
 * Null rather than a fallback: a climber who has reported enough injuries to
 * exclude all eleven is being told something by that, and quietly handing them
 * the least-bad option would be the app pretending it had not noticed.
 *
 * **Measured: that null is currently unreachable**, and the test says so
 * rather than the code guessing. Six of the eleven — skin repair, the easy
 * aerobic hour, and the four mental and strategy ones — declare `loads: []`
 * and name no body part in their text, so `drillConflict` finds nothing in
 * them for any injury. A climber reporting all nine parts hurt still gets six.
 * The contract stays `| null` because it is the honest one for a caller to
 * handle if a future off-wall drill changes that; there is no separate
 * `length === 0` guard, because `% 0` is `NaN`, `safe[NaN]` is `undefined`,
 * and the `?? null` below is already that guard written once.
 */
export function restDayDrill(date: string, injured: readonly BodyPart[] = []): Drill | null {
  const safe = restDayDrills().filter((drill) => drillConflict(drill, injured) === null);
  // Modulo of a day count, so consecutive rest days step through the list.
  // `daysBetween` is signed, and a date before the epoch makes it negative —
  // `%` in JavaScript keeps the sign, so `-3 % 11` is `-3` and would index off
  // the front of the array. The second modulo is what stops that.
  const step = ((daysBetween(EPOCH, date) % safe.length) + safe.length) % safe.length;
  return safe[step] ?? null;
}
