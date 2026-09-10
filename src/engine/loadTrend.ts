import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import { ACWR_BOUNDS, buildLoadIndex, loadSeries, type AcwrZone, type LoadPoint } from './derive';

/**
 * The acute:chronic ratio, as a trajectory (PLAN.md M25).
 *
 * The app derived a full ACWR history and showed one number from it. A
 * single "0.99" is a figure nobody trusts, because a ratio has no meaning
 * without knowing whether it arrived from 1.6 or from 0.6 — the first is a
 * climber coming down off a spike, the second one building back. The line
 * is the same data saying which.
 */

export interface TrendPoint extends LoadPoint {
  /** True where the ratio cannot be computed — drawn as a gap, not a zero. */
  unknown: boolean;
}

export interface LoadTrend {
  points: TrendPoint[];
  from: string;
  to: string;
  /** The most recent computable ratio, or null. */
  latest: number | null;
  /** The one before a week ago, for "up from" / "down from". */
  weekAgo: number | null;
  /** Highest and lowest computable ratios in the window. */
  peak: number | null;
  trough: number | null;
  /** Days in the window with no ratio at all. */
  unknownDays: number;
}

export interface TrendInput {
  sessions: readonly Session[];
  /** The last day of the window. */
  to: string;
  /** How many days back. Ninety shows a training block and its deloads. */
  days?: number;
}

export const TREND_DAYS = 90;

export function loadTrend(input: TrendInput): LoadTrend {
  const days = input.days ?? TREND_DAYS;
  const from = addDays(input.to, -(days - 1));

  // The index is built from every session, not just the window: the ratio on
  // the first day of the window depends on the 28 days before it, and
  // clipping the input would make the chart start with a fake climb out of
  // nothing.
  const index = buildLoadIndex([...input.sessions]);
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  const points: TrendPoint[] = loadSeries(index, dates).map((point) => ({
    ...point,
    unknown: point.acwr === null,
  }));

  const known = points.filter((p) => p.acwr !== null);
  const values = known.map((p) => p.acwr!);

  return {
    points,
    from,
    to: input.to,
    latest: known.length === 0 ? null : known[known.length - 1]!.acwr,
    weekAgo: points[points.length - 8]?.acwr ?? null,
    peak: values.length === 0 ? null : Math.max(...values),
    trough: values.length === 0 ? null : Math.min(...values),
    unknownDays: points.length - known.length,
  };
}

/**
 * The top of the y axis.
 *
 * At least far enough to show the danger threshold with room above it, so
 * the bands are always all visible — a chart whose scale hides the line
 * you are meant to stay under is worse than no chart. Beyond that it grows
 * with the data, rounded up, so a spike is not clipped flat.
 */
export function trendCeiling(trend: LoadTrend): number {
  const floor = ACWR_BOUNDS.cautionTo + 0.3;
  const peak = trend.peak ?? 0;
  return Math.max(floor, Math.ceil((peak + 0.2) * 5) / 5);
}

const ZONE_WORD: Record<AcwrZone, string> = {
  unknown: 'not enough history',
  detraining: 'detraining',
  optimal: 'in the sweet spot',
  caution: 'ramping fast',
  danger: 'ramping dangerously fast',
};

/**
 * One sentence about the shape of the line.
 *
 * Says where the ratio is and where it came from, and nothing about what to
 * do — the training-state card already gives advice, and two voices telling
 * a climber different things about the same number is worse than one.
 */
export function describeTrend(trend: LoadTrend): string {
  if (trend.latest === null) {
    return 'Three weeks of logged sessions and this becomes meaningful.';
  }
  const now = trend.latest.toFixed(2);
  const zone = ZONE_WORD[trend.points[trend.points.length - 1]!.zone];
  if (trend.weekAgo === null) return `Now ${now} — ${zone}.`;

  const change = trend.latest - trend.weekAgo;
  const direction =
    Math.abs(change) < 0.05 ? 'about where it was' : change > 0 ? 'up from' : 'down from';
  const tail =
    direction === 'about where it was'
      ? 'about where it was a week ago'
      : `${direction} ${trend.weekAgo.toFixed(2)} a week ago`;
  return `Now ${now} — ${zone}, ${tail}.`;
}
