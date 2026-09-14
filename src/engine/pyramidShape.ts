/**
 * Reading the pyramid the app has drawn since §5.9 (PLAN.md M165).
 *
 * `PyramidRow[]` has carried sends and attempts per grade for a year, on
 * screen, per mode since M106 — and **nothing has ever compared one row to
 * the next.** `plateau.ts` reads the rows, but only one at a time, looking for
 * a grade with attempts and no sends; `conversion.ts` reads a ratio inside a
 * row. A grep for a comparison between adjacent grades returns nothing. The
 * shape is the whole point of drawing a pyramid, and the app drew it and
 * looked away.
 *
 * ## What is *not* built here, and why
 *
 * The second brainstorm parked *"a thin top of the pyramid"* because it needs
 * a gate or it fires for almost everyone almost always. That is still true and
 * this does not do it. A top band is thin for a month every time a climber
 * starts trying a new grade, which is the healthy case, not the finding.
 *
 * ## The confound this module exists inside, stated first
 *
 * `GradeTally.sends` is the **whole log**, and a climber who improves stops
 * logging what they warm up on. Three years in, the V2 row is fat because V2
 * was once the session; the V6 row is thin because V6 is four goes on a
 * Tuesday. So the bottom of a real pyramid is inflated by history and the top
 * is not, and "more sends at the top than below it" is a statement about a
 * **log** at least as much as about a climber.
 *
 * `angles.ts` states the same rule for wall angle — *"the angle nobody logs is
 * as likely to be the one their gym does not have"* — and this follows it:
 * the sentence never calls the gap a weakness. It says what the log shows,
 * names the two readings, and lets the climber pick the one that is true. That
 * is the difference between a coach's observation and an app's verdict.
 *
 * ## Which is why the gate is where it is
 *
 * The confound is strongest at the bottom of the ladder, where warm-ups go
 * unlogged, and weakest at the top, where every go near the limit is an event
 * worth writing down. So the reading is confined to the working band — the top
 * few grades — and the upper row has to be **established** before its
 * neighbour's thinness means anything.
 */

import type { PyramidRow } from './progress';

/**
 * Sends across the whole log before its shape is worth a sentence.
 *
 * The app's own number, not a new one: `coach.ts`'s `domain:style` waits for
 * `boulder.totalSends + sport.totalSends >= 25` before it will say anything
 * about how a climber sends. A log below that has a handful of rows, and a
 * handful of rows always looks like something.
 */
export const ENOUGH_SENDS = 25;

/**
 * Sends at one grade before that grade is a band rather than an afternoon.
 *
 * `projectHistory` uses three sends as the point where a number stops being an
 * anecdote, and this is the same question about the same unit. Deliberately
 * applied to the **upper** row only: the lower row is allowed to be one send
 * or none, because a zero directly under an established grade is the strongest
 * form of this finding and a floor on it would rule out exactly the case worth
 * reporting.
 */
export const ESTABLISHED = 3;

/**
 * How far below the top to look.
 *
 * The working range — the grades a climber is currently operating in. Beyond
 * it the log's history dominates and an inversion says nothing, which is the
 * confound above. Four is a judgement rather than a measurement and is named
 * here for that reason: it is wide enough to hold a project grade, the grade
 * under it and the two a climber warms up through, and narrow enough that the
 * V2s of three years ago are never one side of the comparison.
 */
export const WORKING_BAND = 4;

export interface PyramidFinding {
  /** The established grade with more sends than the one below it. */
  grade: string;
  sends: number;
  /** The grade immediately below, and how little is under it. */
  below: string;
  belowSends: number;
  /** Nothing at all below, which is the sharper version of the same shape. */
  empty: boolean;
}

/**
 * The one inversion worth reporting, or null.
 *
 * At most one: a list of three is a table, and the highest is the one that
 * matters — an inversion at the top is about the grade being consolidated now.
 * `rows` arrive hardest-first from `pyramid()`, so the first hit is the
 * highest.
 */
export function readPyramid(rows: readonly PyramidRow[], totalSends: number): PyramidFinding | null {
  if (totalSends < ENOUGH_SENDS) return null;
  const band = rows.slice(0, WORKING_BAND);
  for (let i = 0; i < band.length - 1; i += 1) {
    const above = band[i]!;
    const below = band[i + 1]!;
    if (above.sends < ESTABLISHED) continue;
    if (above.sends <= below.sends) continue;
    return {
      grade: above.grade,
      sends: above.sends,
      below: below.grade,
      belowSends: below.sends,
      empty: below.sends === 0,
    };
  }
  return null;
}

/**
 * What the shape shows, without saying what it means.
 *
 * Two readings, both named, because the log cannot tell them apart and
 * pretending otherwise is the failure `angles.ts` is written around. The
 * sentence ends on the climber, which is where the answer actually is.
 *
 * `label` is the grade formatter the page already holds, so a climber reading
 * in Font sees Font here.
 */
export function describePyramid(
  finding: PyramidFinding | null,
  label: (grade: string) => string,
): string | null {
  if (finding === null) return null;
  const grade = label(finding.grade);
  const below = label(finding.below);
  // No singular. `readPyramid` will not report a grade under `ESTABLISHED`,
  // so `sends` is three or more by construction — a `=== 1` branch here was
  // unreachable, and the battery said so by surviving its removal.
  const count = `${finding.sends} sends`;
  const under = finding.empty
    ? `nothing at ${below} at all`
    : `${finding.belowSends} at ${below}`;
  return `Your log has ${count} at ${grade} and ${under}, which is the pyramid the other way up. That is either a grade you moved past before consolidating it, or a grade you stopped writing down — both are common and only you know which. If it is the first, a block of volume at ${below} is the cheapest gain on this page.`;
}
