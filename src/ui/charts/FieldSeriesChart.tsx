import { fromKey } from '@/engine/dates';
import { ENOUGH_POINTS, type FieldSeries } from '@/engine/sessionFields';

/**
 * One answered question, over the window (PLAN.md M88).
 *
 * **A dot per answer, not a line through them.** These are sparse by
 * construction — a field is only asked on the session types that declare it,
 * and only answered if the climber bothers — so joining two points a month
 * apart would draw a trend across a gap where nothing was asked. The same
 * rule `loadTrend` applies to its own gaps, for the same reason.
 *
 * **The axis starts at the bottom of what was answered, not at zero**, for
 * every field except a scale. "Climbs done" between 18 and 24 is a flat line
 * against a zero axis and a visible spread against its own range; a 1-10
 * pump scale is the opposite, because the ends of it are the meaning.
 */

const W = 320;
const H = 64;
const PAD_L = 30;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 12;
const R = 3;

function when(date: string): string {
  return fromKey(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function FieldSeriesChart({ series, from, to }: { series: FieldSeries; from: string; to: string }) {
  const { spec, points } = series;
  const scale = spec.kind === 'scale';
  const lo = scale ? 1 : Math.min(series.min, series.max);
  const hi = scale ? 10 : series.max;
  // A single answer, or several identical ones, has no range to draw
  // against — it sits on the middle line rather than at an arbitrary end.
  const flat = hi <= lo;

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const start = fromKey(from).getTime();
  const reach = Math.max(1, fromKey(to).getTime() - start);
  const x = (date: string) => PAD_L + ((fromKey(date).getTime() - start) / reach) * plotW;
  const y = (value: number) =>
    flat ? PAD_T + plotH / 2 : PAD_T + plotH - ((value - lo) / (hi - lo)) * plotH;

  const label = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <figure className="m-0">
      <figcaption className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-sm font-semibold">{spec.label}</span>
        <span className="text-2xs text-ink-soft tabular-nums">
          {points.length} {points.length === 1 ? 'answer' : 'answers'}
          {/* "typically 5 burns", not "5 typical burns" — the adjective was
              landing on the unit rather than on the number. */}
          {series.solid ? ` · typically ${label(series.mean)}${spec.unit ? ` ${spec.unit}` : ''}` : ''}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-label={`${spec.label}, ${points.length} answers between ${when(from)} and ${when(to)}: ${points
          .map((p) => `${when(p.date)} ${label(p.value)}`)
          .join(', ')}`}
      >
        {/* One line when every answer was the same number: there is no
            range to draw, and rendering a hidden second copy of it gave two
            children the same key — `hi` and `lo` are equal here. */}
        {(flat ? [lo] : [hi, lo]).map((edge, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              y1={y(edge)}
              x2={W - PAD_R}
              y2={y(edge)}
              className="stroke-viz-grid"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 4}
              y={y(edge)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-soft"
              style={{ fontSize: 8 }}
            >
              {label(edge)}
            </text>
          </g>
        ))}

        {points.map((point) => (
          <circle
            key={point.sessionId}
            cx={x(point.date)}
            cy={y(point.value)}
            r={R}
            className="fill-viz-1"
          >
            <title>{`${when(point.date)}: ${label(point.value)}${spec.unit ? ` ${spec.unit}` : ''}`}</title>
          </circle>
        ))}
      </svg>
      {!series.solid && (
        <p className="text-2xs text-ink-soft mt-0.5 leading-relaxed">
          Fewer than {ENOUGH_POINTS} answers — the dots are what there is, not a trend.
        </p>
      )}
    </figure>
  );
}
