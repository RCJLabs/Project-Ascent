/**
 * Eight weeks under a number, at the size of a word (PLAN.md M239).
 *
 * Not a chart, and deliberately not one. `Charts.tsx` draws the real ones —
 * axes, direct labels, a `DataTable` underneath — and those belong on
 * Progress, where a climber has gone to look at the numbers. This is the
 * shape of a series next to the number it belongs to, so that *1,240* reads
 * as a week in a run of weeks rather than as a figure with no history.
 *
 * ## Why it carries a sentence and not a table
 *
 * M140's rule is that a chart hands a screen reader a table instead of the
 * SVG, and three of these on the front door would be three hidden tables of
 * eight rows before anything else is read — on the one screen the app opens
 * on. The number itself is already text a reader gets; what the picture adds
 * is the *direction*, so that is what the label says, in a sentence. The
 * full series is a tap away on Progress, in a chart that does carry its
 * table.
 */

export interface SparklineProps {
  /** Oldest first. Fewer than two points draws nothing. */
  values: readonly number[];
  /** What the series is, for the label: "Week load". */
  label: string;
  /** How one value reads, for the label's first and last. */
  format?: (value: number) => string;
  height?: number;
  className?: string;
}

/** Describes the run in a sentence, which is what the picture is for. */
export function describeRun(
  values: readonly number[],
  label: string,
  format: (value: number) => string,
): string {
  const first = values[0]!;
  const last = values.at(-1)!;
  const way = last > first ? 'up from' : last < first ? 'down from' : 'level with';
  return `${label} over ${values.length} weeks: ${format(last)}, ${way} ${format(first)}.`;
}

export function Sparkline({
  values,
  label,
  format = (v) => String(v),
  height = 24,
  className = '',
}: SparklineProps) {
  // One point is a dot with no run behind it, which is the case a new
  // climber is in for their first fortnight. Nothing is better than a line
  // drawn through a single reading.
  if (values.length < 2) return null;

  const w = 100;
  const h = height;
  const pad = 2.5;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // A flat run draws down the middle rather than along the floor: every
  // week the same is a fact about the training, not an absence of it.
  const span = hi - lo;
  const x = (i: number) => (i / (values.length - 1)) * (w - pad * 2) + pad;
  const y = (v: number) =>
    span === 0 ? h / 2 : h - pad - ((v - lo) / span) * (h - pad * 2);

  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      // `preserveAspectRatio="none"` so the line stretches to the tile's
      // width: the x axis is "eight weeks" whatever that measures in pixels,
      // and letterboxing it would leave the line short of its own number.
      preserveAspectRatio="none"
      width="100%"
      height={h}
      role="img"
      aria-label={describeRun(values, label, format)}
      className={`block overflow-visible ${className}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(last)} cy={y(values[last]!)} r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
