/**
 * Chart primitives, hand-built as inline SVG.
 *
 * No charting library: these forms are simple, and a hundred kilobytes of
 * dependency is a poor trade in an offline-first app. Building them by hand
 * also makes the mark specs exact — capped bar thickness, 4px rounded
 * data-ends square at the baseline, 2px lines, ≥8px markers ringed in the
 * surface colour, hairline solid gridlines.
 *
 * Series colours come from the validated `--viz-*` slots, never the UI
 * accent, and never from status colours. Text always wears text tokens.
 */

import { useState } from 'react';

const BAR_MAX_THICKNESS = 24;
const SURFACE_GAP = 2;
/** Vertical room reserved inside the plot for direct labels. */
const LABEL_ROOM = 14;

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

/** Vertical bars over time. One series, so no legend — the title names it. */
/**
 * The numbers behind a chart, for anyone who cannot see it.
 *
 * `role="img"` with an `aria-label` gives a screen reader the chart's
 * *title* and nothing else — "Daily training load over the last 28 days"
 * and then silence. The picture is the affordance for sighted readers; this
 * table is the same information for everyone else, and PyramidBars was
 * already built this way, which is what made the gap obvious.
 */
function DataTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: [string, string];
  rows: [string, string][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{head[0]}</th>
          <th scope="col">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LoadBars({
  data,
  label,
  formatValue = (n) => String(Math.round(n)),
}: {
  data: { date: string; value: number; muted?: boolean }[];
  label: string;
  formatValue?: (n: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const width = 320;
  const height = 120;
  const max = niceCeil(Math.max(1, ...data.map((d) => d.value)));
  const slot = width / Math.max(1, data.length);
  const barWidth = Math.min(BAR_MAX_THICKNESS, Math.max(2, slot - SURFACE_GAP));
  const shown = active !== null ? data[active] : null;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{label}</figcaption>
      <div className="flex items-baseline justify-between mb-1.5 min-h-5">
        <span className="text-xs text-ink-soft">
          {shown ? new Date(`${shown.date}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
        </span>
        <span className="text-xs font-semibold tabular-nums">{shown ? formatValue(shown.value) : ''}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="presentation" aria-hidden>
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={width}
            y1={height - height * f}
            y2={height - height * f}
            className="stroke-viz-grid"
            strokeWidth={1}
          />
        ))}
        {data.map((d, i) => {
          const h = d.value <= 0 ? 0 : Math.max(2, (d.value / max) * (height - 6));
          const x = i * slot + (slot - barWidth) / 2;
          return (
            <g key={d.date}>
              {h > 0 && (
                <rect
                  x={x}
                  y={height - h}
                  width={barWidth}
                  height={h}
                  rx={Math.min(4, barWidth / 2)}
                  className={d.muted ? 'fill-viz-2' : 'fill-viz-1'}
                  opacity={active === null || active === i ? 1 : 0.45}
                />
              )}
              {/* Hit target far larger than the mark. */}
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
              />
            </g>
          );
        })}
      </svg>
      <DataTable
        caption={label}
        head={['Day', 'Load']}
        rows={data.map((d) => [
          new Date(`${d.date}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          d.muted ? `${formatValue(d.value)} (deload)` : formatValue(d.value),
        ])}
      />
    </figure>
  );
}

type LinePoint = { value: number | null };

function nextKnown(points: LinePoint[], from: number): number | null {
  for (let i = from + 1; i < points.length; i++) {
    const v = points[i]?.value;
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function prevKnown(points: LinePoint[], from: number): number | null {
  for (let i = from - 1; i >= 0; i--) {
    const v = points[i]?.value;
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/** A single line over time with gaps where nothing was logged. */
export function ProgressionLine({
  points,
  label,
  formatValue,
}: {
  points: { week: string; value: number | null; display: string | null }[];
  label: string;
  formatValue: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const width = 320;
  const height = 130;
  const pad = 8;
  const known = points.filter((p) => p.value !== null) as { value: number }[];
  if (known.length === 0) return null;

  const min = Math.min(...known.map((p) => p.value));
  const max = Math.max(...known.map((p) => p.value));
  const span = Math.max(1, max - min);
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (width - pad * 2);
  // Keep the extremes off the frame edges so their direct labels have a side
  // to sit on. Without this the highest and lowest points are flush against
  // the top and bottom, and every label lands on the stroke.
  const top = pad + LABEL_ROOM;
  const bottom = height - pad - LABEL_ROOM;
  const y = (v: number) => bottom - ((v - min) / span) * (bottom - top);

  // Break the path wherever a week has no data rather than bridging it.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length > 1) segments.push(current.join(' '));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`);
  });
  if (current.length > 1) segments.push(current.join(' '));

  const lastKnown = [...points].reverse().find((p) => p.value !== null);
  const lastIndex = lastKnown ? points.lastIndexOf(lastKnown) : -1;
  const firstIndex = points.findIndex((p) => p.value !== null);
  const shown = active !== null ? points[active] : null;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{label}</figcaption>
      <div className="flex items-baseline justify-between mb-1.5 min-h-5">
        <span className="text-xs text-ink-soft">
          {shown?.value !== null && shown
            ? new Date(`${shown.week}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : ''}
        </span>
        <span className="text-xs font-semibold">{shown?.display ?? ''}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="presentation" aria-hidden>
        <line x1={0} x2={width} y1={height - pad} y2={height - pad} className="stroke-viz-grid" strokeWidth={1} />
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" className="stroke-viz-1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {points.map((p, i) =>
          p.value === null ? null : (
            <circle
              key={p.week}
              cx={x(i)}
              cy={y(p.value)}
              r={i === lastIndex ? 5 : 4}
              className="fill-viz-1 stroke-surface"
              strokeWidth={2}
            />
          ),
        )}
        {/* Label the first and last known points only — enough to read the
            chart without hovering, without a number on every dot. Each label
            goes on the side the line is *not* heading, so it never sits on
            the stroke, then flips back if that would leave the frame. */}
        {[firstIndex, lastIndex].map((i, n) => {
          const p = i >= 0 ? points[i] : undefined;
          if (!p || p.value === null || p.display === null) return null;
          if (n === 1 && firstIndex === lastIndex) return null;
          const neighbour = n === 0 ? nextKnown(points, i) : prevKnown(points, i);
          let above = neighbour === null || p.value >= neighbour;
          if (above && y(p.value) < pad + 14) above = false;
          else if (!above && y(p.value) > height - pad - 14) above = true;
          return (
            <text
              key={`label-${i}`}
              x={Math.min(width - 14, Math.max(14, x(i)))}
              y={above ? y(p.value) - 10 : y(p.value) + 18}
              textAnchor={n === 0 ? 'start' : 'end'}
              className="fill-ink text-[11px] font-semibold"
            >
              {p.display}
            </text>
          );
        })}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.week}`}
            x={x(i) - 14}
            y={0}
            width={28}
            height={height}
            fill="transparent"
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
          />
        ))}
      </svg>
      {lastKnown && (
        <p className="text-xs text-ink-soft mt-1">
          Latest: <span className="font-semibold text-ink">{formatValue(lastKnown.value!)}</span>
        </p>
      )}
      <DataTable
        caption={label}
        head={['Week', 'Hardest grade']}
        rows={points.map((p) => [
          new Date(`${p.week}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          p.display ?? 'nothing logged',
        ])}
      />
    </figure>
  );
}

/**
 * Horizontal pyramid: sends and attempts per grade, two categorical series.
 * Values are printed beside every row, so the numbers are readable without
 * hovering and the chart is not the only way to read the data.
 */
export function PyramidBars({
  rows,
}: {
  rows: { grade: string; sends: number; attempts: number; conversion: number | null }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.sends + r.attempts));

  return (
    <figure className="m-0">
      <div className="flex items-center gap-4 mb-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-viz-1" aria-hidden />
          <span className="text-ink-soft">Sent</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-viz-2" aria-hidden />
          <span className="text-ink-soft">Tried, not sent</span>
        </span>
      </div>
      <table className="w-full border-collapse">
        <caption className="sr-only">Sends and attempts by grade</caption>
        <tbody>
          {rows.map((row) => {
            const total = row.sends + row.attempts;
            const sendPct = (row.sends / max) * 100;
            const attemptPct = (row.attempts / max) * 100;
            return (
              <tr key={row.grade}>
                <th scope="row" className="text-left text-sm font-bold w-12 py-1 align-middle">
                  {row.grade}
                </th>
                <td className="py-1 align-middle w-full">
                  <div className="flex items-center gap-0.5 h-5">
                    {row.sends > 0 && (
                      <div
                        className="bg-viz-1 h-full rounded-r"
                        style={{ width: `${sendPct}%`, borderRadius: '0 4px 4px 0' }}
                      />
                    )}
                    {row.attempts > 0 && (
                      <div
                        className="bg-viz-2 h-full"
                        style={{ width: `${attemptPct}%`, borderRadius: '0 4px 4px 0' }}
                      />
                    )}
                    {total === 0 && <div className="h-px w-2 bg-viz-grid" />}
                  </div>
                </td>
                <td className="text-right text-xs text-ink-soft tabular-nums pl-2 py-1 align-middle whitespace-nowrap">
                  {row.sends}
                  {row.attempts > 0 && <span className="opacity-70"> / {total}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </figure>
  );
}
