import type { Session } from '@/db/sessions';
import { type AwayPeriod, awayName, awayOverlapping } from './away';
import { addDays, daysBetween } from './dates';
import { changesBetween, totalsFor, type Change, type Totals } from './yearReview';

/**
 * The last four weeks against the four before them (PLAN.md M28).
 *
 * `yearReview` compares one year against the last and is careful about
 * part-finished ones. The Progress page had no comparison at all — every
 * card on it describes the present. "Am I actually training more than I was
 * a month ago?" is the question a climber asks far more often than the
 * annual one, and nothing answered it.
 *
 * Four weeks against four, because that is the window the training-load
 * model already uses and a shorter one is noise: one missed week out of two
 * is a fifty per cent collapse, and it usually means a head cold.
 */

export const BLOCK_DAYS = 28;

export interface BlockCompare {
  now: Totals;
  /** Null when the log does not cover the earlier window — see below. */
  before: Totals | null;
  nowFrom: string;
  nowTo: string;
  beforeFrom: string;
  beforeTo: string;
  /** Days from the first logged session to the end of the window. */
  historyDays: number;
  /** Days of the earlier window the log actually covers. */
  coveredDays: number;
  /** Marked stretches touching the recent window, most days first. */
  nowAway: BlockAway[];
  /** The same for the earlier window. */
  beforeAway: BlockAway[];
}

/** A marked stretch, and how much of one window it covers. */
export interface BlockAway {
  period: AwayPeriod;
  days: number;
}

/** The same, once one window has been picked to explain the change. */
export interface BlockAside extends BlockAway {
  window: 'now' | 'before';
}

export interface BlockInput {
  sessions: readonly Session[];
  to: string;
  days?: number;
  /**
   * Stretches the climber said they were away (PLAN.md M305).
   *
   * Optional, and absent is the ordinary case: a climber who has never
   * marked one gets exactly the card they got before. Nothing here reads
   * `wasClimbing` — a fortnight in Font and a fortnight with flu are both
   * reasons a month is quieter than the one before it, and which one it
   * was is the climber's word, printed rather than interpreted.
   */
  away?: readonly AwayPeriod[];
}

/** Marked stretches over a window, by how much of it each covers. */
function awayIn(
  periods: readonly AwayPeriod[] | undefined,
  from: string,
  to: string,
): BlockAway[] {
  return awayOverlapping(periods, from, to)
    .map((period) => {
      // Days of the *window*, not days of the period: a month in Spain
      // either side of these four weeks covers all of them, and it is the
      // window this card is about.
      const start = period.from > from ? period.from : from;
      const end = period.to < to ? period.to : to;
      return { period, days: daysBetween(start, end) + 1 };
    })
    .sort((a, b) => b.days - a.days || a.period.from.localeCompare(b.period.from));
}

export function compareBlocks(input: BlockInput): BlockCompare {
  const days = input.days ?? BLOCK_DAYS;
  const nowFrom = addDays(input.to, -(days - 1));
  const beforeTo = addDays(nowFrom, -1);
  const beforeFrom = addDays(beforeTo, -(days - 1));

  const sessions = [...input.sessions];
  const dated = sessions.filter((s) => s.completed).map((s) => s.date);
  const earliest = dated.length === 0 ? null : dated.reduce((a, b) => (a < b ? a : b));

  const historyDays =
    earliest === null
      ? 0
      : Math.max(0, Math.round((Date.parse(input.to) - Date.parse(earliest)) / 86_400_000) + 1);
  const coveredDays =
    earliest === null
      ? 0
      : Math.max(
          0,
          Math.min(days, Math.round((Date.parse(beforeTo) - Date.parse(earliest)) / 86_400_000) + 1),
        );

  return {
    now: totalsFor(sessions, nowFrom, input.to),
    // The comparison is offered only when the log covers the *whole* earlier
    // window. A climber who installed the app five weeks ago has an earlier
    // window that is mostly days before they arrived, and comparing against
    // it would report the act of installing as a training improvement.
    before: coveredDays >= days ? totalsFor(sessions, beforeFrom, beforeTo) : null,
    nowFrom,
    nowTo: input.to,
    beforeFrom,
    beforeTo,
    historyDays,
    coveredDays,
    nowAway: awayIn(input.away, nowFrom, input.to),
    beforeAway: coveredDays >= days ? awayIn(input.away, beforeFrom, beforeTo) : [],
  };
}

/** The same rows, in the same order, as the year comparison. */
export function blockChanges(compare: BlockCompare): Change[] {
  return changesBetween(compare.now, compare.before);
}

/**
 * Fewer days than this and a marked stretch is not why a month reads
 * differently (PLAN.md M305).
 *
 * **Not `EXPLAINS_FRACTION`.** That one is about a gap, where the gap is the
 * whole span being explained and half of it is the bar. This window is a
 * fixed four weeks whatever happened in it, so a fraction of it would make
 * the bar fourteen days and throw away every long weekend. Three, because
 * two days out of twenty-eight cannot be the reason and naming them would
 * be the app blaming a quiet month on a Tuesday.
 */
export const MIN_ASIDE_DAYS = 3;

/**
 * The marked stretch worth naming beside the change, or null.
 *
 * **Which window depends on which way the change went.** Training down is
 * explained by what happened in the last four weeks; training up is
 * explained by what happened in the four before them — a climber coming back
 * from three weeks with flu is not improving, they are recovering, and that
 * is the reading nothing on this page has ever offered.
 *
 * Nothing when the two windows are level: the caption under the table
 * already says a quieter month is not a worse one, and a card with no change
 * on it has nothing to explain.
 */
export function blockAside(compare: BlockCompare): BlockAside | null {
  if (compare.before === null) return null;
  const sessions = compare.now.sessions - compare.before.sessions;
  // The same rounded figure the sentence below uses, rather than a second
  // idea of flat: two thresholds for one word is how a card ends up saying
  // "almost exactly the same" and then explaining a change.
  const hours = Math.round((compare.now.hours - compare.before.hours) * 10) / 10;
  // Silence in both windows is about the recent one, which is the window the
  // climber is looking at.
  const quiet = compare.now.sessions === 0 && compare.before.sessions === 0;
  if (!quiet && sessions === 0 && Math.abs(hours) < 0.5) return null;
  const down = quiet || sessions < 0 || (sessions === 0 && hours < 0);
  const window = down ? 'now' : 'before';
  const best = (down ? compare.nowAway : compare.beforeAway)[0];
  return best && best.days >= MIN_ASIDE_DAYS ? { ...best, window } : null;
}

/**
 * One sentence, and no verdict — and a second one when the climber has
 * already written down what happened.
 *
 * Training less is not a failure, so this reports the direction of the
 * biggest mover and stops there. It used to say the app *"has no idea
 * whether the last four weeks were a taper, an illness or a holiday"*, which
 * had been two-thirds wrong since M275: an illness and a holiday are both an
 * `AwayPeriod` with a kind and a note on it, and `ProgressPage` has had the
 * list in scope twelve lines above this call ever since — passed to the heat
 * grid and to nothing else.
 *
 * **A taper is still a guess**, and deliberately left as one: `deloadWeeks`
 * is a property of the program rather than of the log, and the only thing
 * that writes it onto a session is `PreSession`, so a deload week rested
 * through leaves no trace a reader here could find. Naming that is its own
 * milestone; claiming it here would be the same wrong sentence pointing the
 * other way.
 */
export function describeBlocks(compare: BlockCompare): string {
  const aside = blockAside(compare);
  const said = (head: string): string => {
    if (aside === null) return head;
    const name = awayName(aside.period);
    // Always plural: `MIN_ASIDE_DAYS` is three, so a one-day form here would
    // be a branch nothing can reach.
    return aside.window === 'now'
      ? `${head} ${aside.days} of those days are marked ${name}.`
      : `${head} The earlier four weeks have ${aside.days} days marked ${name}.`;
  };
  if (compare.before === null) {
    const short = BLOCK_DAYS * 2 - compare.historyDays;
    return compare.historyDays === 0
      ? 'Nothing logged yet.'
      : `${short} more days of log and this compares your last four weeks with the four before them.`;
  }
  if (compare.now.sessions === 0 && compare.before.sessions === 0) {
    return said('Nothing logged in either period.');
  }
  const sessions = compare.now.sessions - compare.before.sessions;
  const hours = Math.round((compare.now.hours - compare.before.hours) * 10) / 10;
  if (sessions === 0 && Math.abs(hours) < 0.5) {
    return said('Almost exactly the same amount of training as the four weeks before.');
  }
  const direction = sessions > 0 ? 'more' : sessions < 0 ? 'fewer' : 'the same number of';
  const count = Math.abs(sessions);
  const head =
    sessions === 0
      ? `The same number of sessions, ${hours > 0 ? 'longer' : 'shorter'} ones`
      : `${count} ${direction} session${count === 1 ? '' : 's'} than the four weeks before`;
  return said(`${head}.`);
}
