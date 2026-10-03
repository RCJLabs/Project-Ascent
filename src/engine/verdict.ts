/**
 * Whether a change between two readings is a change (PLAN.md M373).
 *
 * The block review judged against the coach's bands (M367, M370) and, for an
 * added-load test with a weight at both readings, against bodyweight (M371).
 * The benchmark card beside each result and the coach's praise tip did
 * neither: a dead hang from 60 to 62 seconds was green on the card and
 * *held* in the review, and a single extra pull-up was *"improved"* in the
 * tip and *light progress* in the review. One climber, one pair of
 * readings, three answers.
 *
 * This is the one answer, and all three read it. It lives on its own rather
 * than in `blockReport.ts` because `blockReport` already imports
 * `assessmentStatus`, and the card's `changeOf` lives there.
 */

import type { Metric } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { isAddedWeight } from './units';

export type Band = 'held' | 'edge' | 'beyond';

/**
 * Where a change falls against the metric's band for noise (PLAN.md M367,
 * M370).
 *
 * Every difference used to count: 40 to 40.5 lbs on a max hang *improved*,
 * 60 to 59 seconds on a dead hang *went the other way*, and the counts, the
 * share card, the coach's file and the order of what comes next all
 * followed. The coach's answer was that small changes are held, and the
 * bands are theirs (`content/metrics.ts`). Inside the band is `held`.
 * Exactly the band's width — one plate, one rep — is the `edge`, which the
 * coach called light progress, or a light decline (M370); M367 had held it.
 * Grades and pass/fail have no band — one step on a ladder, or a pass where
 * there was a fail, is already the smallest real change — and a number
 * metric without one counts any change.
 */
export function bandFor(metric: Metric, baseline: number, delta: number): Band {
  const size = Math.abs(delta);
  const within = bandWidth(metric, baseline);
  if (within === null) return size === 0 ? 'held' : 'beyond';
  // Readings are decimals, so the edge is a tolerance rather than equality:
  // 33 × 10% is 3.3, and 36.3 − 33 is 3.2999999999999972.
  if (size === 0) return 'held';
  if (within > 0 && Math.abs(size - within) < 1e-9) return 'edge';
  return size < within ? 'held' : 'beyond';
}

/** A change inside the band, which reads as held. */
export function held(metric: Metric, baseline: number, delta: number): boolean {
  return bandFor(metric, baseline, delta) === 'held';
}

/**
 * How wide the band is at this baseline, in the metric's own units, or null
 * for a metric that has none.
 */
export function bandWidth(metric: Metric, baseline: number): number | null {
  const band = metric.kind === 'number' ? metric.held : undefined;
  if (band === undefined) return null;
  return 'abs' in band ? band.abs : Math.max(band.atLeast, (Math.abs(baseline) * band.pct) / 100);
}

export interface Verdict {
  band: Band;
  /** Which way, against the band: `flat` inside it. */
  moved: 'better' | 'worse' | 'flat';
  /** Exactly the band's width: light progress, or a light decline (M370). */
  light: boolean;
  /**
   * How many bands the change is, for ranking one against another. Null
   * where there is no band to count in, or it is zero wide.
   */
  bands: number | null;
  /**
   * Read against bodyweight (M371), when the switch is on and both readings
   * of an added-load test carry one. The percentage is of what was held over
   * bodyweight, and `relative` is the plate as a share of bodyweight.
   */
  weighed: { percent: number; relative: { from: number; to: number } } | null;
}

/**
 * The verdict on `to` against `from`.
 *
 * With a weight at both readings, what the fingers held is the climber plus
 * the plate, so the measure is that load over bodyweight. The change is that
 * ratio's change times the first bodyweight, because that is what the
 * coach's band is in: five pounds is still five pounds, now of a climber who
 * may weigh something else.
 */
export function verdictOf(metric: Metric, from: MetricEntry, to: MetricEntry, bodyweight: boolean): Verdict {
  const added = isAddedWeight(metric.unit);
  const then = bodyweight && added ? from.bodyweight : undefined;
  const now = bodyweight && added ? to.bodyweight : undefined;
  if (then !== undefined && now !== undefined && then > 0 && now > 0) {
    const before = (then + from.value) / then;
    const after = (now + to.value) / now;
    return judged(metric, from.value, (after - before) * then, {
      percent: ((after - before) / before) * 100 * (metric.higherIsBetter ? 1 : -1),
      relative: { from: (from.value / then) * 100, to: (to.value / now) * 100 },
    });
  }
  return judged(metric, from.value, to.value - from.value, null);
}

function judged(metric: Metric, baseline: number, delta: number, weighed: Verdict['weighed']): Verdict {
  const band = bandFor(metric, baseline, delta);
  const signed = metric.higherIsBetter ? delta : -delta;
  const within = bandWidth(metric, baseline);
  return {
    band,
    moved: band === 'held' ? 'flat' : signed > 0 ? 'better' : 'worse',
    light: band === 'edge',
    bands: within !== null && within > 0 ? Math.abs(delta) / within : null,
    weighed,
  };
}
