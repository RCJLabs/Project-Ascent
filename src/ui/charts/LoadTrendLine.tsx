import { ACWR_BOUNDS } from '@/engine/derive';
import { fromKey, shortLabel } from '@/engine/dates';
import { trendCeiling, type LoadTrend } from '@/engine/loadTrend';
import { WEEK_LABEL, type PeakPlan } from '@/engine/peak';

/**
 * The acute:chronic ratio over time, with the bands it is judged against
 * (PLAN.md M25).
 *
 * The app showed this as one number. A ratio has no meaning on its own — a
 * climber at 0.99 who arrived from 1.6 is coming down off a spike, and one
 * who arrived from 0.6 is building back, and those are opposite situations
 * with the same reading. The line is the same data saying which.
 *
 * **The bands are the chart.** Without them the line is a number nobody can
 * place; with them, "inside the shaded strip" is the whole message and the
 * exact value stops mattering. They are drawn as filled regions rather than
 * threshold lines because a band is a place to be and a line is a thing to
 * cross, and the first is what the model actually means.
 *
 * **Gaps stay gaps.** Before three weeks of history there is no ratio, and
 * drawing a zero there would tell a climber they were detraining during a
 * period the app knows nothing about.
 *
 * **The plan, when there is one (M73), is drawn dashed and on the far side
 * of a divider.** Same axis and same bands, because the whole value of
 * seeing it here is watching the planned ramp stay inside the strip the
 * history is judged against — but never the same stroke: one of these lines
 * is what happened and the other is what was suggested, and a reader who
 * cannot tell them apart has been handed a forecast.
 */

const W = 320;
const H = 132;
const PAD_L = 26;
const PAD_R = 6;
const PAD_T = 6;
const PAD_B = 16;

/**
 * Which band edges to label, given how tight the scale is.
 *
 * All three collide once a spike pushes the ceiling up: at a ceiling of 2.2
 * the gap between 1.3 and 1.5 is ten pixels, and the two labels sat on top
 * of each other — measured. The two that define "in the band" and "in the
 * red" are placed first, and the third only if it still has room, because a
 * label nobody can read is worse than a missing one and the legend below
 * names all three anyway.
 */
const MIN_LABEL_GAP = 11;

/** How strongly the three bands tint their strip. See the note at the rects. */
const BAND_ALPHA = 0.26;

function gridValues(y: (value: number) => number): number[] {
  const kept: number[] = [];
  // Priority order, not value order: 1.3 is the one the legend can replace.
  for (const value of [ACWR_BOUNDS.optimalFrom, ACWR_BOUNDS.cautionTo, ACWR_BOUNDS.optimalTo]) {
    if (kept.every((other) => Math.abs(y(other) - y(value)) >= MIN_LABEL_GAP)) kept.push(value);
  }
  return kept.sort((a, b) => a - b);
}

export function LoadTrendLine({ trend, plan }: { trend: LoadTrend; plan?: PeakPlan }) {
  const weeks = plan?.weeks ?? [];
  // No allowance made for the plan: `trendCeiling` already floors at the
  // danger band plus headroom, and a planned week never reaches it — the
  // build weeks are held under the top of the sweet spot by construction.
  // A max() over the plan here was code no mutation could kill.
  const ceiling = trendCeiling(trend);
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  // The axis carries the history in days and the plan in weeks, at seven
  // days to the week, so a planned week is as wide on screen as a lived one.
  const today = trend.points.length - 1;
  const span = Math.max(1, today + weeks.length * 7);
  const x = (i: number) => PAD_L + (i / span) * plotW;
  const y = (value: number) => PAD_T + plotH - Math.min(1, value / ceiling) * plotH;

  // One path per unbroken run of known values. A single path across a gap
  // would draw a straight line through days that have no ratio.
  const runs: { i: number; acwr: number }[][] = [];
  let run: { i: number; acwr: number }[] = [];
  trend.points.forEach((point, i) => {
    if (point.acwr === null) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push({ i, acwr: point.acwr });
    }
  });
  if (run.length > 0) runs.push(run);

  const band = (from: number, to: number) => ({
    y: y(Math.min(to, ceiling)),
    height: Math.max(0, y(Math.min(from, ceiling)) - y(Math.min(to, ceiling))),
  });
  const optimal = band(ACWR_BOUNDS.optimalFrom, ACWR_BOUNDS.optimalTo);
  const caution = band(ACWR_BOUNDS.optimalTo, ACWR_BOUNDS.cautionTo);
  const danger = band(ACWR_BOUNDS.cautionTo, ceiling);

  const last = trend.points[trend.points.length - 1];
  const lastKnown = [...trend.points].reverse().find((p) => p.acwr !== null);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-label={
          weeks.length > 0
            ? `Acute to chronic load ratio over the last ${trend.points.length} days, and the ${weeks.length} planned weeks after it`
            : `Acute to chronic load ratio over the last ${trend.points.length} days`
        }
      >
        {/* One opacity for both themes, chosen against the dark one. At 0.1
            the caution and danger bands were all but invisible on a dark
            surface — a light red at 10% over near-black is nothing — while
            reading fine on white. Raised until both hold. */}
        <rect x={PAD_L} y={danger.y} width={plotW} height={danger.height} className="fill-danger" opacity={BAND_ALPHA} />
        <rect x={PAD_L} y={caution.y} width={plotW} height={caution.height} className="fill-warn" opacity={BAND_ALPHA} />
        <rect x={PAD_L} y={optimal.y} width={plotW} height={optimal.height} className="fill-positive" opacity={BAND_ALPHA} />

        {gridValues(y).map((value) => (
          <g key={value}>
            <line
              x1={PAD_L}
              y1={y(value)}
              x2={W - PAD_R}
              y2={y(value)}
              className="stroke-viz-grid"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 4}
              y={y(value)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-soft"
              style={{ fontSize: 9 }}
            >
              {value.toFixed(1)}
            </text>
          </g>
        ))}

        {runs.map((points) => (
          <path
            key={points[0]!.i}
            d={points
              .map((p, n) => `${n === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.acwr).toFixed(1)}`)
              .join(' ')}
            className="fill-none stroke-viz-1"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {weeks.length > 0 && lastKnown?.acwr != null && (
          <>
            <line
              x1={x(today)}
              y1={PAD_T}
              x2={x(today)}
              y2={PAD_T + plotH}
              className="stroke-ink-soft"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <path
              d={[{ i: today, acwr: lastKnown.acwr }, ...weeks.map((w, n) => ({ i: today + (n + 1) * 7, acwr: w.acwr }))]
                .map((p, n) => `${n === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.acwr).toFixed(1)}`)
                .join(' ')}
              className="fill-none stroke-viz-2"
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* An easy week sits under the band on purpose, so it is marked
                rather than left looking like the plan falls apart at the end. */}
            {weeks.map((week, n) =>
              week.kind === 'taper' || week.kind === 'deload' ? (
                <circle
                  key={week.ends}
                  cx={x(today + (n + 1) * 7)}
                  cy={y(week.acwr)}
                  r={3}
                  className="fill-surface stroke-viz-2"
                  strokeWidth={2}
                />
              ) : null,
            )}
          </>
        )}

        {/* Where the climber stands today, ringed in the surface colour so
            it separates from the line and the band behind it. */}
        {lastKnown?.acwr != null && (
          <circle
            cx={x(trend.points.indexOf(lastKnown))}
            cy={y(lastKnown.acwr)}
            r={4}
            className="fill-viz-1 stroke-surface"
            strokeWidth={2}
          />
        )}

        <text x={PAD_L} y={H - 4} className="fill-ink-soft" style={{ fontSize: 9 }}>
          {shortLabel(trend.from)}
        </text>
        <text x={W - PAD_R} y={H - 4} textAnchor="end" className="fill-ink-soft" style={{ fontSize: 9 }}>
          {weeks.length > 0
            ? shortLabel(weeks[weeks.length - 1]!.ends)
            : last
              ? shortLabel(last.date)
              : ''}
        </text>
      </svg>

      {/* Bands named in words as well as shaded, because a colour key that
          is only a colour fails the same rule the status ramp does. */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-soft mt-1.5">
        <li>
          <span className="inline-block size-2 rounded-[2px] bg-positive/40 mr-1" aria-hidden />
          {ACWR_BOUNDS.optimalFrom}–{ACWR_BOUNDS.optimalTo} sweet spot
        </li>
        <li>
          <span className="inline-block size-2 rounded-[2px] bg-warn/40 mr-1" aria-hidden />
          to {ACWR_BOUNDS.cautionTo} ramping fast
        </li>
        <li>
          <span className="inline-block size-2 rounded-[2px] bg-danger/40 mr-1" aria-hidden />
          above {ACWR_BOUNDS.cautionTo} spiking
        </li>
        {weeks.length > 0 && (
          <li>
            {/* Wide enough for the dashes to read as dashes. At 12px the
                gaps fell between the rendered pixels and the key for "this
                one is dashed" was drawn solid. */}
            <span className="inline-block w-5 border-t-2 border-dashed border-viz-2 mr-1 align-middle" aria-hidden />
            dashed: the plan, not what happened
          </li>
        )}
      </ul>

      {/* The numbers, weekly rather than daily: ninety rows is not an
          alternative to a chart, it is a wall. */}
      <div className="sr-only">
        <table>
          <caption>
            Acute to chronic load ratio, one reading a week
            {weeks.length > 0 ? ', then the planned weeks' : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col">Week ending</th>
              <th scope="col">Ratio</th>
            </tr>
          </thead>
          <tbody>
            {trend.points
              .filter((_, i) => (trend.points.length - 1 - i) % 7 === 0)
              .map((point) => (
                <tr key={point.date}>
                  <th scope="row">
                    {fromKey(point.date).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </th>
                  <td>{point.acwr === null ? 'not enough history' : point.acwr.toFixed(2)}</td>
                </tr>
              ))}
            {weeks.map((week) => (
              <tr key={week.ends}>
                <th scope="row">
                  {fromKey(week.ends).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </th>
                <td>
                  {week.acwr.toFixed(2)} — planned, {WEEK_LABEL[week.kind].toLowerCase()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
