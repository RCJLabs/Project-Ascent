/**
 * Telling a comedown from a stop (PLAN.md M188).
 *
 * ## The reading that was wrong
 *
 * `coach.ts`'s `detraining` rule reads two things: how long since anything
 * was logged, and where the ratio sits. Neither can tell *stopped* from
 * *came back from a trip*, so a climber seven days out from nine days in
 * Céüse was told **"16 days since you logged anything"** with advice to
 * return at two-thirds volume — and, measured, the board was **identical**
 * to the same log with no trip on it at all.
 *
 * The sharper case is the one where the climber did everything right *and
 * wrote it down*: nine outdoor days logged, then the week off that every
 * coach would prescribe, and the app said **"Training has dropped off — a
 * month is losing what you built."** The evidence was in the log and the
 * rule read the ratio instead, which is M178's shape one rule over.
 *
 * ## What explains a quiet stretch
 *
 * Two things, and the app already holds both.
 *
 * **A peak in the log.** The days before the quiet were well above what came
 * before them. A ratio falling after that is the taper working, not fitness
 * leaving — the same arithmetic `loadSpike` calls a spike on the way up.
 *
 * **A trip on the board.** Nobody logs from a campsite; the file that owns
 * trips says as much. When nothing was logged there is no peak to find, and
 * the objective is the only evidence there is.
 *
 * **And, since M275, the climber saying so.** An away marker of kind `trip`
 * is the sentence both of the above are inferred from, said out loud and with
 * real dates. It wins over both, because it is the only one of the three that
 * is not a guess.
 *
 * The other three kinds deliberately produce nothing here. A comedown is
 * *quiet after load*, and flu is quiet after nothing: naming it would tell a
 * climber three weeks off sick that their ratio falling is a taper. `coach.ts`
 * names those in the layoff tip instead, where the advice underneath is the
 * advice they actually need.
 *
 * Either way the tip still fires, which is M163's rule and worth keeping: a
 * comedown that runs long really does become a layoff, and suppressing the
 * sentence would leave the climber with nothing at the point it starts being
 * true. What changes is what it says.
 */

import type { Session } from '@/db/sessions';
import type { Objective } from './objectives';
import { sessionLoad } from './derive';
import { addDays, daysBetween } from './dates';
import { tripRecently } from './trip';
import { type AwayPeriod, explainsGap, wasClimbing } from './away';

/**
 * A gap shorter than this is a rest day or two and explains itself.
 *
 * Four, so it is asking about the same silence `detraining` is: that rule's
 * own gate is `LAYOFF_DAYS`, ten, and the zone branch under it fires on a
 * week of quiet. Answering below both means a comedown is recognised before
 * either has anything to say about it.
 */
export const QUIET_MIN_DAYS = 4;

/** The stretch that ended — a fortnight, which is the shape of a trip. */
export const PEAK_WINDOW_DAYS = 14;

/** What that stretch is compared against: the month before it, not including it. */
export const BASELINE_WINDOW_DAYS = 28;

/**
 * How far above the earlier baseline the stretch has to sit.
 *
 * 1.3 rather than the 1.5 the ACWR calls `danger`, because this is not
 * looking for a dangerous jump — it is asking whether the quiet has an
 * obvious cause, and a fortnight a third heavier than the month before it is
 * already a block or a trip rather than a normal week.
 */
export const PEAK_RATIO = 1.3;

interface Quiet {
  /** Days since the last day with any load on it. */
  quietDays: number;
  /** The stretch that ended, weekly-equivalent, and what it is measured against. */
  peak: number;
  baseline: number;
}

/**
 * A union rather than one shape with two nullable fields, because the two
 * readings have different evidence and the caller's copy has to differ with
 * it. Written as one interface first, and both branches of the sentence it
 * produced were unreachable: a peak always has a ratio and a trip reading
 * always has a trip. A type that cannot say so invites a guard that cannot
 * fire, which is the shape M143, M158, M167, M178 and M185 each found.
 */
export type Comedown =
  | (Quiet & { because: 'peak'; ratio: number; trip: Objective | null })
  | (Quiet & { because: 'trip'; ratio: number | null; trip: Objective })
  | (Quiet & { because: 'away'; ratio: number | null; period: AwayPeriod });

/**
 * Weekly-equivalent load for the sessions inside a window.
 *
 * **Not `state.load.daily`**, which was the first draft and is wrong for
 * this: that series is truncated to the 28-day chronic window, so the "month
 * before the peak fortnight" was mostly missing and the ratio came out
 * against almost nothing. Measured — a perfectly steady log reported a 3.5×
 * peak, which is how the mistake surfaced.
 *
 * `sessionLoad` is `derive.ts`'s own sRPE, imported rather than rewritten:
 * a second copy of that arithmetic here is the shape M169 named, and it
 * would drift from the ratio this is meant to explain.
 */
function weekly(sessions: readonly Session[], from: string, to: string, span: number): number {
  let total = 0;
  for (const session of sessions) {
    if (!session.completed) continue;
    if (session.date < from || session.date > to) continue;
    total += sessionLoad(session) ?? 0;
  }
  return total / (span / 7);
}

/**
 * Why the last few quiet days are quiet, or null when nothing explains them.
 */
export function comedownNow(
  sessions: readonly Session[],
  objectives: readonly Objective[] | undefined,
  today: string,
  away?: readonly AwayPeriod[],
): Comedown | null {
  const lastTrained = sessions
    .filter((session) => session.completed && (sessionLoad(session) ?? 0) > 0)
    .map((session) => session.date)
    .sort()
    .at(-1);
  if (lastTrained === undefined) return null;

  const quietDays = daysBetween(lastTrained, today);
  if (quietDays < QUIET_MIN_DAYS) return null;

  const trip = tripRecently(objectives, today);

  // The fortnight ending on the last day trained, against the month before
  // that fortnight. The baseline deliberately excludes both the peak and the
  // quiet: `state.load.chronic` includes the quiet days and is dragged down
  // by them, which would report a peak for any week after any rest at all.
  const peakFrom = addDays(lastTrained, -(PEAK_WINDOW_DAYS - 1));
  const baseFrom = addDays(peakFrom, -BASELINE_WINDOW_DAYS);
  const baseTo = addDays(peakFrom, -1);

  const peak = weekly(sessions, peakFrom, lastTrained, PEAK_WINDOW_DAYS);
  const baseline = weekly(sessions, baseFrom, baseTo, BASELINE_WINDOW_DAYS);
  // No baseline is no comparison. A climber whose log starts with the trip
  // has nothing this can be measured against, and a made-up denominator
  // would call every first fortnight a peak.
  const ratio = baseline > 0 ? peak / baseline : null;

  /**
   * The climber's own answer, asked before either inference (PLAN.md M275).
   *
   * Read over the gap itself — the day after the last session through today —
   * rather than over the peak window: this asks what explains the *silence*,
   * and the silence is exactly those days. `explainsGap` is what stops three
   * days of flu accounting for a three-week layoff.
   *
   * After the arithmetic and before the branches, so the reading carries real
   * `peak` and `baseline` figures like the other two. Returning zeroes from
   * an early exit would have put a fabricated pair into a shape whose whole
   * contract is that its numbers are measured.
   */
  const marked = explainsGap(away, addDays(lastTrained, 1), today);
  if (marked !== null && wasClimbing(marked.kind)) {
    return { quietDays, because: 'away', peak, baseline, ratio, period: marked };
  }

  if (ratio !== null && ratio >= PEAK_RATIO) {
    return { quietDays, because: 'peak', peak, baseline, ratio, trip };
  }
  if (trip !== null) {
    return { quietDays, because: 'trip', peak, baseline, ratio: null, trip };
  }
  return null;
}
