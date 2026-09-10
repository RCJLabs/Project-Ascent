import { Link } from 'wouter';
import type { HeatDay, HeatGrid } from '@/engine/consistency';
import { fromKey } from '@/engine/dates';

/**
 * A year of days, as a grid (PLAN.md M23).
 *
 * Columns are weeks, rows are weekdays. That shape is worth the pixels: a
 * climber who never trains on a Friday sees an empty row, and a fortnight
 * off is a hole rather than a dip in a monthly total.
 *
 * **The labels are HTML, the grid is SVG.** The first version put the month
 * names inside the SVG, which scales with it — at 320px that is a 2.5px
 * smear, and illegible text is worse than none. Only the squares scale; the
 * text stays at a real, `rem`-based size that M15's text-size setting can
 * still move.
 *
 * **Not interactive, on purpose.** Fifty-three columns inside a 288px card is
 * a 3.9px cell — measured — and WCAG 2.5.8 asks 24px of any target. Rather
 * than ship a row of targets a sixth the required size, the grid is a picture
 * and a link beneath it goes to the calendar, which is where a specific day
 * is actually reachable.
 *
 * Colour comes from `--heat-*`, generated from the palette in `themes.ts` and
 * tested under three colour-blindness simulations: one hue, so lightness
 * carries the scale.
 */

/** Cell colour. Level 0 splits into "rested" and "nothing at all". */
function fill(day: HeatDay): string {
  if (day.future) return 'transparent';
  if (day.sessions === 0) return 'var(--c-sunken)';
  if (day.rested) return 'var(--heat-1)';
  return `var(--heat-${Math.min(5, day.level + 1)})`;
}

function title(day: HeatDay): string {
  const when = fromKey(day.date).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  if (day.future) return when;
  if (day.sessions === 0) return `${when}: nothing logged`;
  if (day.rested) return `${when}: rest day`;
  const bits = [`${day.sessions} session${day.sessions === 1 ? '' : 's'}`];
  if (day.outdoor) bits.push('outdoors');
  if (day.deload) bits.push('deload');
  return `${when}: ${bits.join(', ')}`;
}

const CELL = 10;
const GAP = 2;
const PITCH = CELL + GAP;

export function ConsistencyGrid({ grid }: { grid: HeatGrid }) {
  const columns = grid.weeks.length;
  const width = columns * PITCH - GAP;
  const height = 7 * PITCH - GAP;
  // Every other month. Twelve labels fit at 1280px and collide at 320; six
  // are legible at both, and a grid does not need a ruler to be read.
  const marks = grid.months.filter((_, i) => i % 2 === 0);

  return (
    <figure className="m-0">
      <div className="relative h-4 text-2xs text-ink-soft" aria-hidden>
        {marks.map((mark) => (
          <span
            key={`${mark.label}-${mark.column}`}
            className="absolute top-0 whitespace-nowrap"
            style={{ left: `${(mark.column / columns) * 100}%` }}
          >
            {mark.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block"
        role="img"
        aria-label={`Days trained in the year to ${fromKey(grid.to).toLocaleDateString()}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {grid.weeks.map((week, column) =>
          week.map((day, row) => (
            <rect
              key={day.date}
              x={column * PITCH}
              y={row * PITCH}
              width={CELL}
              height={CELL}
              rx={2}
              fill={fill(day)}
            >
              <title>{title(day)}</title>
            </rect>
          )),
        )}
      </svg>

      {/* The same information, for anyone who cannot read the picture. Only
          the logged days: 371 rows of "nothing logged" is not an
          alternative, it is a denial-of-service on a screen reader. */}
      <div className="sr-only">
        <table>
          <caption>Days trained, most recent first</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">What was logged</th>
            </tr>
          </thead>
          <tbody>
            {grid.weeks
              .flat()
              .filter((d) => d.sessions > 0)
              .reverse()
              .map((day) => (
                <tr key={day.date}>
                  <th scope="row">{day.date}</th>
                  <td>{title(day)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * What the shades mean, without printing numbers.
 *
 * The scale is quantiles of this climber's own loads, so "12.4" would be a
 * number that means nothing next year. Lighter and heavier is the honest
 * amount to claim.
 */
export function ConsistencyLegend() {
  return (
    <div className="flex items-center gap-1.5 text-2xs text-ink-soft">
      <span>Rest</span>
      <div className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className="size-2.5 rounded-[2px]"
            style={{ background: `var(--heat-${step})` }}
          />
        ))}
      </div>
      <span>Hardest</span>
    </div>
  );
}

/** The grid, its sentence and its legend, as one card body. */
export function ConsistencyBody({ grid, summary }: { grid: HeatGrid; summary: string }) {
  return (
    <>
      <ConsistencyGrid grid={grid} />
      <p className="text-sm text-ink-soft mt-2.5 leading-relaxed">
        {summary} <span className="text-ink-soft">Rows run Sunday to Saturday.</span>
      </p>
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
        <ConsistencyLegend />
        <Link href="/calendar" className="focus-ring text-xs font-semibold text-accent">
          Open the calendar
        </Link>
      </div>
    </>
  );
}
