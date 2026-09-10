/**
 * Radar geometry (PLAN.md M24).
 *
 * `stats.ts` defines exactly five axes and the app only ever showed them as
 * five bars. Five bars are five numbers stacked up; a shape is one thing,
 * and the shape is the point — a climber who is all fingers and no endurance
 * should *look* lopsided rather than have to compare "78" against "31".
 *
 * Pure maths, separate from the drawing, because a chart's geometry is
 * exactly the kind of thing that looks plausible and is wrong: an axis
 * rotation out by one step, or a value scaled by the wrong maximum, both
 * produce a picture nobody questions.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Where each axis meets the outer edge, first one pointing straight up.
 *
 * Straight up, then clockwise, because that is how every radar anyone has
 * seen is drawn and a chart that rotates the other way is read wrong before
 * it is read at all. Canvas and SVG both have y growing downward, so "up" is
 * negative.
 */
export function axisPoints(count: number, radius: number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

/**
 * The polygon for a set of values.
 *
 * Values are clamped into `[0, max]`: a stat can exceed its cap through a
 * bonus, and a vertex outside the web reads as a rendering fault rather than
 * as a strength.
 */
export function radarPoints(
  values: readonly number[],
  radius: number,
  max: number,
): Point[] {
  const outer = axisPoints(values.length, radius);
  return values.map((value, i) => {
    const fraction = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
    const point = outer[i]!;
    return { x: point.x * fraction, y: point.y * fraction };
  });
}

/** An SVG path for a closed polygon. Empty for no points. */
export function polygonPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const round = (n: number) => Math.round(n * 100) / 100;
  return `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join(' ')} Z`;
}

/**
 * The lowest axis, which is the one the chart exists to make obvious.
 *
 * Ties go to the first, so the answer is stable frame to frame rather than
 * flickering between two equal axes.
 */
export function weakestIndex(values: readonly number[]): number {
  let best = -1;
  let lowest = Infinity;
  values.forEach((value, i) => {
    if (value < lowest) {
      lowest = value;
      best = i;
    }
  });
  return best;
}

export function strongestIndex(values: readonly number[]): number {
  let best = -1;
  let highest = -Infinity;
  values.forEach((value, i) => {
    if (value > highest) {
      highest = value;
      best = i;
    }
  });
  return best;
}

/**
 * How lopsided the shape is, 0 (a circle) to 1 (a single spike).
 *
 * Reported rather than judged. A specialist's shape is not a worse shape —
 * a boulderer who has trained fingers for a year *should* look spiky — and
 * the app has no idea what the climber is training for.
 */
export function lopsidedness(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const max = Math.max(...values);
  if (max <= 0) return 0;
  const min = Math.min(...values);
  return (max - min) / max;
}
