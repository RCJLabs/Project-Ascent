import type { Session } from '@/db/sessions';
import { addDays } from './dates';
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
}

export interface BlockInput {
  sessions: readonly Session[];
  to: string;
  days?: number;
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
  };
}

/** The same rows, in the same order, as the year comparison. */
export function blockChanges(compare: BlockCompare): Change[] {
  return changesBetween(compare.now, compare.before);
}

/**
 * One sentence, and no verdict.
 *
 * Training less is not a failure — a deload block is *supposed* to show as a
 * decline, and the app has no idea whether the last four weeks were a taper,
 * an illness or a holiday. It reports the direction of the biggest mover and
 * stops there.
 */
export function describeBlocks(compare: BlockCompare): string {
  if (compare.before === null) {
    const short = BLOCK_DAYS * 2 - compare.historyDays;
    return compare.historyDays === 0
      ? 'Nothing logged yet.'
      : `${short} more days of log and this compares your last four weeks with the four before them.`;
  }
  if (compare.now.sessions === 0 && compare.before.sessions === 0) {
    return 'Nothing logged in either period.';
  }
  const sessions = compare.now.sessions - compare.before.sessions;
  const hours = Math.round((compare.now.hours - compare.before.hours) * 10) / 10;
  if (sessions === 0 && Math.abs(hours) < 0.5) {
    return 'Almost exactly the same amount of training as the four weeks before.';
  }
  const direction = sessions > 0 ? 'more' : sessions < 0 ? 'fewer' : 'the same number of';
  const count = Math.abs(sessions);
  const head =
    sessions === 0
      ? `The same number of sessions, ${hours > 0 ? 'longer' : 'shorter'} ones`
      : `${count} ${direction} session${count === 1 ? '' : 's'} than the four weeks before`;
  return `${head}.`;
}
