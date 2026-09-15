/**
 * Whether the climber is away on the trip they told the app about
 * (PLAN.md M163).
 *
 * `loadSpike` suppresses itself for exactly one reason — `inPlannedDeload` —
 * with the note that *"a deload is a deliberate change of load in the other
 * direction, and the ratio moving is the point of it rather than a
 * surprise."* The proposal for this milestone read that sentence, said it was
 * equally true of a trip, and asked for one more clause beside it.
 *
 * **It is not equally true, and this deliberately does not do that.** A
 * deload's ratio moves *down*, so nothing is at risk while it moves and
 * silence costs nothing. A trip's moves *up*, and the thing the rule is about
 * — tissue loaded faster than it adapted — is genuinely more likely on a trip
 * than at home: more days on, longer days, rock nobody's fingers are used to,
 * and skin as the only thing that says stop. Suppressing the app's loudest
 * warning at the highest-risk fortnight of a climber's year would be a
 * regression wearing a fix's clothes.
 *
 * **What is wrong is the advice, not the alarm.** The tip says *"An easier
 * week now costs a week"* and offers *Plan the week → /calendar*. On day four
 * of nine in Céüse a climber can do neither: they cannot take an easier week,
 * they did not fly there to rest, and the calendar is not the screen that
 * helps. So the tip keeps its weight, its headline and its reading, and
 * changes what it asks for.
 *
 * ## Why this needs no corroboration from the log
 *
 * The only evidence here is the climber's own objective — a date they typed,
 * possibly weeks ago, for a trip that may have been cancelled. That would be
 * far too thin to *suppress* a warning on. It is enough to *reword* one,
 * because a false positive then costs a sentence rather than a warning: the
 * spike is still there, at the same weight, saying the same thing about the
 * pattern, and the sentence that is wrong names the trip out loud, so the
 * climber can see which fact the app has wrong and go and fix it.
 *
 * Corroborating from the log was the first design and it failed on the
 * measurement: `Session.mode` is the obvious signal and **nothing in the app
 * writes it** (see the note in PLAN.md) — every session a climber logs by
 * hand is `'indoor'`, whichever session type they picked. Building the gate
 * on it would have produced a feature that never fires.
 */

import type { Objective } from './objectives';
import { daysBetween, isDateKey } from './dates';

/**
 * How far either side of the target date still counts as being on the trip.
 *
 * A judgement, and named here rather than buried because it is the one number
 * in this module that nothing measures. `targetDate` documents itself as
 * *"when you intend to be on it"* — one day somewhere inside a trip, which
 * might be the flight out, the first day on, or the day of the route. Ten
 * days either side covers a fortnight whichever of those the climber meant,
 * and stops short of the month that a fourteen would make.
 */
export const TRIP_WINDOW_DAYS = 10;

/**
 * The trip the climber is on, or null.
 *
 * `shelved` is the only status excluded: it is the one that means *abandoned*.
 * A trip marked `sent` on day three is still a trip on day four, and one left
 * on `training` because nobody updates an objective from a campsite is the
 * common case rather than the odd one.
 *
 * The nearest target wins when two are in range, which is the one a climber
 * with a fortnight in Spain and a project weekend after it would mean.
 */
/**
 * Trips with a real date on them, and the one rule about which ones count.
 *
 * `shelved` is the only status excluded: it is the one that means
 * *abandoned*. A trip marked `sent` on day three is still a trip on day
 * four, and one left on `training` because nobody updates an objective from
 * a campsite is the common case rather than the odd one.
 *
 * One condition for the date rather than an `undefined` check and then a
 * shape check: `isDateKey('')` is false, so the empty string stands in for
 * the absent date and narrows the type at the same time. The battery found
 * the two halves were the same check written twice.
 *
 * And `isDateKey` before any arithmetic, because a half-typed date reaches
 * the store from a text field, `fromKey` of one is an Invalid Date, and its
 * arithmetic is NaN — `NaN > 10` is false, so the bug would be every
 * malformed objective reading as a trip rather than a throw.
 *
 * **Named once** because M188 gave it a second reader: `tripRecently` asks a
 * different question through a different window and had a copy of this
 * filter, which is the shape M169 named and the battery found again here.
 */
function datedTrips(
  objectives: readonly Objective[] | undefined,
): { objective: Objective; target: string }[] {
  const out: { objective: Objective; target: string }[] = [];
  for (const objective of objectives ?? []) {
    if (objective.kind !== 'trip' || objective.status === 'shelved') continue;
    const target = objective.targetDate ?? '';
    if (!isDateKey(target)) continue;
    out.push({ objective, target });
  }
  return out;
}

export function tripNow(
  objectives: readonly Objective[] | undefined,
  today: string,
): Objective | null {
  let best: Objective | null = null;
  let closest = Number.POSITIVE_INFINITY;
  for (const { objective, target } of datedTrips(objectives)) {
    const away = Math.abs(daysBetween(today, target));
    if (away > TRIP_WINDOW_DAYS) continue;
    if (away < closest) {
      closest = away;
      best = objective;
    }
  }
  return best;
}

/**
 * How long after a trip the trip still explains a quiet week (PLAN.md M188).
 *
 * Longer than `TRIP_WINDOW_DAYS`, and for a different question. That window
 * asks *are you on it* and is tight because the answer changes the advice for
 * today. This asks *have you just been on one*, and the honest span is the
 * one a climber takes to get home, catch up on sleep and let skin grow back
 * — which is a week or so after a trip that was itself a week or two.
 *
 * Three weeks rather than four, because at a month the same silence really
 * has become a layoff and the app should say so.
 */
export const TRIP_RECENT_DAYS = 21;

/**
 * A trip in the recent past, or null.
 *
 * The same reading as `tripNow` through a wider, one-sided window: a trip
 * whose date has passed and has not yet passed out of relevance. A future
 * trip explains nothing about a quiet week that already happened, which is
 * why this does not take the absolute value the way `tripNow` does.
 */
export function tripRecently(
  objectives: readonly Objective[] | undefined,
  today: string,
): Objective | null {
  let best: Objective | null = null;
  let closest = Number.POSITIVE_INFINITY;
  for (const { objective, target } of datedTrips(objectives)) {
    // Signed, not absolute: days *since* the target, so a trip still to come
    // is negative and falls out.
    const since = daysBetween(target, today);
    if (since < 0 || since > TRIP_RECENT_DAYS) continue;
    if (since < closest) {
      closest = since;
      best = objective;
    }
  }
  return best;
}
