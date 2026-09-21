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
 * ## And then it read the padding (PLAN.md M308)
 *
 * `pyramid()` fills every rung between the hardest grade and the easiest so
 * the chart can draw a ladder, and this read those zeros as a gap in ability.
 * On YDS, where a rung is a letter grade, that was **every** reading the card
 * gave: 152 of the 152 days it spoke over the sample climber's year it named
 * a grade with no sends *and no attempts*, and advised a block of volume at
 * it. `progress.ts` states the rule itself about the bottom of the pyramid —
 * *"padding down to V0 would imply a base the climber has never touched,
 * which reads as a gap in ability rather than a gap in the log"* — and the
 * same is true of the padding inside it. So the reading walks the grades a
 * climber has sent at, and `CLEARLY_MORE` below is the half of that fix the
 * zeros had been hiding.
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
 * How far below the top to look, in **grades sent at** (PLAN.md M308).
 *
 * The working range — the grades a climber is currently operating in. Beyond
 * it the log's history dominates and an inversion says nothing, which is the
 * confound above. Four is a judgement rather than a measurement and is named
 * here for that reason: it is wide enough to hold a project grade, the grade
 * under it and the two a climber warms up through, and narrow enough that the
 * V2s of three years ago are never one side of the comparison.
 *
 * It used to count **rungs of the ladder**, which made it a different width
 * on each: four V grades is that working range, and four YDS rungs is 5.11a
 * down to 5.10d — less than one number grade, on a ladder whose letters most
 * gyms and guidebooks never hand out. Counting the grades a climber has
 * actually sent at makes the same number mean the same thing on both.
 */
export const WORKING_BAND = 4;

/**
 * How much more is *more* (PLAN.md M308).
 *
 * Reading only the grades a climber has sent at fixed one fault and exposed
 * another the zeros had been hiding. Adjacent real grades sit close
 * together: the sample climber's rope ladder runs 10 / 22 / 31 / 28, and the
 * last step — thirty-one sends at 5.10a against twenty-eight at 5.9 — is an
 * inversion by a strict reading and a wobble by any other. Worse, it is the
 * confound this module opens by stating: *"a climber who improves stops
 * logging what they warm up on."* A card that fires on that is the app
 * reporting the climber's filing habits as their shape.
 *
 * Half again, so the step has to be a step. A ratio rather than a count
 * because the same claim has to hold for a log of forty sends and one of
 * four hundred, and because `ESTABLISHED` already answers the other half of
 * the question — whether the upper grade is a band at all.
 */
export const CLEARLY_MORE = 1.5;

export interface PyramidFinding {
  /** The established grade with more sends than the one below it. */
  grade: string;
  sends: number;
  /**
   * The nearest grade below that the climber has sent at, and how little is
   * on it — or null when there is no such grade at all (PLAN.md M308).
   *
   * **Nearest sent, not next on the ladder.** `pyramid()` fills every rung
   * between the hardest and the easiest so the chart can draw a ladder, and
   * a rung with no sends and no attempts is a rung nobody has been on. That
   * module says so itself about the bottom of the pyramid — *"padding down
   * to V0 would imply a base the climber has never touched, which reads as a
   * gap in ability rather than a gap in the log"* — and the same is true of
   * the padding inside it.
   */
  below: string | null;
  belowSends: number;
  /** Nothing below carries a send at all, which is the sharper version. */
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
  /**
   * The grades the climber has actually sent at (PLAN.md M308).
   *
   * Two reasons, and the second is why a row with attempts and no sends is
   * not here either. **A rung nobody has been on is not a thin base**: on
   * YDS the band used to fill with letter grades most gyms and guidebooks
   * never hand out, so the card advised a block of volume at a grade with no
   * sends *and no attempts*, on 152 of the 152 days it spoke. And **a grade
   * tried and never sent is `plateau.ts`'s finding**, on the same page: two
   * cards about one fact is the thing `blockCompare` and `venues` both take
   * care not to be.
   */
  const sent = rows.filter((row) => row.sends > 0);
  const band = sent.slice(0, WORKING_BAND);
  const top = band[0];
  if (top === undefined || top.sends < ESTABLISHED) return null;
  // Everything at one grade, which is the starkest version of this shape and
  // the one the band cannot reach by walking pairs.
  if (band.length === 1) {
    return { grade: top.grade, sends: top.sends, below: null, belowSends: 0, empty: true };
  }
  for (let i = 0; i < band.length - 1; i += 1) {
    const above = band[i]!;
    const below = band[i + 1]!;
    if (above.sends < ESTABLISHED) continue;
    if (above.sends < below.sends * CLEARLY_MORE) continue;
    return {
      grade: above.grade,
      sends: above.sends,
      below: below.grade,
      belowSends: below.sends,
      empty: false,
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
  // No singular. `readPyramid` will not report a grade under `ESTABLISHED`,
  // so `sends` is three or more by construction — a `=== 1` branch here was
  // unreachable, and the battery said so by surviving its removal.
  const count = `${finding.sends} sends`;
  const reading =
    'That is either a grade you moved past before consolidating it, or a grade you stopped writing down — both are common and only you know which.';
  // Nothing sent below at all. There is no grade to name, so the sentence
  // does not name one: the old wording pointed at the next rung on the
  // ladder, which was routinely one nobody had been on (PLAN.md M308).
  if (finding.below === null) {
    return `Your log has ${count} and every one of them at ${grade}, which is the pyramid the other way up. ${reading} If it is the first, a block of volume a grade or two below is the cheapest gain on this page.`;
  }
  const below = label(finding.below);
  return `Your log has ${count} at ${grade} and ${finding.belowSends} at ${below}, which is the pyramid the other way up. ${reading} If it is the first, a block of volume at ${below} is the cheapest gain on this page.`;
}
