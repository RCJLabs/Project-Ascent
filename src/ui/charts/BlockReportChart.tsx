import type { AssessmentResult, BlockReport } from '@/engine/blockReport';
import { movementLabel } from '@/engine/blockReport';

/**
 * The block's assessments, on the one axis they honestly share (M84).
 *
 * **Percent change from baseline, and nothing else on this axis.** A hang in
 * seconds and a pull-up count are both ratio-scale quantities, so percent is
 * a real comparison between them — which is what M84 asked for. Grades are
 * ordinal, pass/fail is not a quantity, one assessed metric is free text,
 * and a baseline of zero has no percentage: those are listed under the chart
 * in their own units rather than forced onto it. `blockReport` decides which
 * is which; this only draws what it is handed.
 *
 * **Right is better, on both kinds of scale.** Two assessed metrics are
 * `higherIsBetter: false`, so the sign comes from the engine already flipped
 * and a bar to the right always means the block worked.
 *
 * **The axis is symmetric and clamped.** One metric that doubled would
 * otherwise squash every other bar to a sliver, so the scale runs to the
 * largest change or a floor, whichever is bigger, and a bar past the end is
 * drawn to the edge with its real number in the label beside it.
 */

const W = 320;
const ROW = 18;
const GAP = 4;
const PAD_T = 12;
const PAD_B = 4;
const LABEL_W = 104;

/**
 * Longest label the gutter holds, in characters.
 *
 * SVG text does not wrap and does not clip to a width — it just runs off
 * the side of the viewBox, which is how "Weighted Pull-Ups 3RM" shipped as
 * "/eighted Pull-Ups 3RM" until a browser showed it. Measured against the
 * widest label in any catalogue battery at this font size. The full name
 * stays in the row's title.
 */
const LABEL_CHARS = 19;

function fit(label: string): string {
  return label.length <= LABEL_CHARS ? label : `${label.slice(0, LABEL_CHARS - 1).trimEnd()}…`;
}

/** The smallest the axis may be, so a 2% move does not fill the card. */
const FLOOR = 25;

/** Widest the axis will grow. Past this the bars stop and the labels speak. */
const CEILING = 200;

export function BlockReportChart({ report }: { report: BlockReport }) {
  const rows = [...report.comparable].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  if (rows.length === 0) return null;

  const largest = Math.max(...rows.map((r) => Math.abs(r.percent!)));
  const reach = Math.min(CEILING, Math.max(FLOOR, Math.ceil(largest / 5) * 5));
  const height = PAD_T + rows.length * (ROW + GAP) + PAD_B;
  const plotW = W - LABEL_W - 6;
  const mid = LABEL_W + plotW / 2;
  const x = (percent: number) => mid + (Math.max(-reach, Math.min(reach, percent)) / reach) * (plotW / 2);
  const y = (i: number) => PAD_T + i * (ROW + GAP);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full h-auto block"
        role="img"
        aria-label={`Change from baseline for ${rows.length} assessments: ${rows
          .map((r) => `${r.metric.label} ${movementLabel(r)}`)
          .join(', ')}`}
      >
        {[-reach, reach].map((edge) => (
          <text
            key={edge}
            x={x(edge)}
            y={PAD_T - 4}
            textAnchor={edge < 0 ? 'start' : 'end'}
            className="fill-ink-soft"
            style={{ fontSize: 8 }}
          >
            {edge > 0 ? `+${reach}%` : `−${reach}%`}
          </text>
        ))}

        <line
          x1={mid}
          y1={PAD_T - 2}
          x2={mid}
          y2={height - PAD_B}
          className="stroke-viz-grid"
          strokeWidth={1}
        />

        {rows.map((row, i) => {
          const percent = row.percent!;
          const from = Math.min(mid, x(percent));
          const width = Math.max(1.5, Math.abs(x(percent) - mid));
          return (
            <g key={row.metric.id}>
              <text
                x={LABEL_W - 6}
                y={y(i) + ROW / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-ink-soft"
                style={{ fontSize: 9 }}
              >
                {fit(row.metric.label)}
              </text>
              <rect
                x={from}
                y={y(i) + 3}
                width={width}
                height={ROW - 6}
                rx={2}
                className={row.moved === 'worse' ? 'fill-danger' : 'fill-positive'}
                opacity={row.moved === 'flat' ? 0.3 : 0.85}
              />
              <title>{`${row.metric.label}: ${movementLabel(row)} (${percent > 0 ? '+' : ''}${percent.toFixed(0)}%)`}</title>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/**
 * Everything the axis cannot honestly carry, in its own terms.
 *
 * Listed rather than dropped: a grade that went up two steps is the most
 * interesting line in most batteries, and leaving it off the report because
 * it has no percentage would be the chart deciding what counts as progress.
 */
export function BlockReportRest({ report }: { report: BlockReport }) {
  const rest = report.results.filter((r) => r.percent === null);
  if (rest.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-1.5 mt-3 border-t border-line pt-3 text-sm">
      {rest.map((row) => (
        <li key={row.metric.id} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate">{row.metric.label}</span>
          <span className={`shrink-0 tabular-nums font-semibold ${toneOf(row)}`}>{restLabel(row)}</span>
        </li>
      ))}
    </ul>
  );
}

function toneOf(row: AssessmentResult): string {
  if (row.moved === 'better') return 'text-positive';
  if (row.moved === 'worse') return 'text-danger';
  return 'text-ink-soft';
}

function restLabel(row: AssessmentResult): string {
  if (row.gap === 'never-tested') return 'not taken';
  if (row.gap === 'once-only') return 'baseline only';
  if (row.gap === 'not-a-number') return 'not a number';
  return movementLabel(row);
}
