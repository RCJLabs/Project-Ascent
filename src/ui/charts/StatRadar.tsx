import { MAX_STAT, STAT_LABELS, type StatId } from '@/engine/stats';
import { axisPoints, polygonPath, radarPoints, strongestIndex, weakestIndex } from '@/engine/radar';

/**
 * The five stats as a shape (PLAN.md M24).
 *
 * They were five bars, which is five numbers stacked up. The shape is the
 * point: a climber who is all fingers and no endurance should *look*
 * lopsided rather than have to compare "78" against "31" four rows apart.
 *
 * **The weakest axis is named, not just drawn.** M24's "done when" is that it
 * is obvious without reading a number, and a dip in a pentagon is only
 * obvious once you know which corner is which — so the low corner carries a
 * ring and its label goes bold, and the caption says the name. Three cues,
 * none of them colour, because colour alone fails the M15 rule and a spike
 * chart is exactly where that bites.
 */

const AXES: StatId[] = ['STR', 'END', 'TEC', 'MEN', 'AGI'];
const RINGS = [0.25, 0.5, 0.75, 1];
const R = 100;
/**
 * Room outside the web for the axis labels.
 *
 * Not the label's distance from the centre but the distance *plus its own
 * width*: a label anchored `start` on the right runs outward from its
 * vertex, so 34 clipped "END" to "EN" and "AGI" to "AGI" with its left edge
 * cut. Measured at the widest label and the largest text size.
 */
const PAD = 50;

export function StatRadar({
  values,
  then,
  thenLabel,
}: {
  values: Record<StatId, number>;
  /** The same five, six months ago. Absent for a climber too new to compare. */
  then?: Record<StatId, number> | undefined;
  thenLabel?: string;
}) {
  const now = AXES.map((id) => values[id]);
  const past = then ? AXES.map((id) => then[id]) : null;
  const weakest = weakestIndex(now);
  const strongest = strongestIndex(now);
  const outer = axisPoints(AXES.length, R);
  const labelAt = axisPoints(AXES.length, R + 20);
  const size = (R + PAD) * 2;

  return (
    <figure className="m-0">
      <svg
        viewBox={`${-(R + PAD)} ${-(R + PAD)} ${size} ${size}`}
        className="w-full h-auto block max-w-72 mx-auto"
        role="img"
        aria-label={`Your five stats as a shape. Weakest: ${STAT_LABELS[AXES[weakest]!].name}.`}
      >
        {RINGS.map((ring) => (
          <path
            key={ring}
            d={polygonPath(axisPoints(AXES.length, R * ring))}
            className="fill-none stroke-line"
            strokeWidth={1}
          />
        ))}

        {outer.map((point, i) => (
          <line
            key={AXES[i]}
            x1={0}
            y1={0}
            x2={point.x}
            y2={point.y}
            className="stroke-line"
            strokeWidth={1}
          />
        ))}

        {/* Six months ago: outline only, dashed, behind. A second filled
            shape would fight the first and neither would read. */}
        {past && (
          <path
            d={polygonPath(radarPoints(past, R, MAX_STAT))}
            className="fill-none stroke-ink-soft"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.55}
          />
        )}

        <path
          d={polygonPath(radarPoints(now, R, MAX_STAT))}
          className="fill-accent stroke-accent"
          fillOpacity={0.18}
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* A ring on the low corner. Position and shape, not colour. */}
        {weakest >= 0 && (
          <circle
            cx={radarPoints(now, R, MAX_STAT)[weakest]!.x}
            cy={radarPoints(now, R, MAX_STAT)[weakest]!.y}
            r={5}
            className="fill-surface stroke-ink"
            strokeWidth={2}
          />
        )}

        {labelAt.map((point, i) => (
          <text
            key={AXES[i]}
            x={point.x}
            y={point.y}
            textAnchor={point.x > 1 ? 'start' : point.x < -1 ? 'end' : 'middle'}
            dominantBaseline={point.y > 1 ? 'hanging' : point.y < -1 ? 'auto' : 'middle'}
            className={i === weakest ? 'fill-ink' : 'fill-ink-soft'}
            style={{ fontSize: 13, fontWeight: i === weakest ? 800 : 600 }}
          >
            {AXES[i]}
          </text>
        ))}
      </svg>

      <div className="sr-only">
        <table>
          <caption>
            Your five stats out of {MAX_STAT}
            {thenLabel ? `, against ${thenLabel}` : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col">Stat</th>
              <th scope="col">Now</th>
              {past && <th scope="col">{thenLabel ?? 'Before'}</th>}
            </tr>
          </thead>
          <tbody>
            {AXES.map((id, i) => (
              <tr key={id}>
                <th scope="row">{STAT_LABELS[id].name}</th>
                <td>{now[i]}</td>
                {past && <td>{past[i]}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <figcaption className="text-sm text-ink-soft mt-2 leading-relaxed text-center">
        Strongest <span className="font-semibold text-ink">{STAT_LABELS[AXES[strongest]!].name}</span>,
        weakest <span className="font-semibold text-ink">{STAT_LABELS[AXES[weakest]!].name}</span>
        {thenLabel ? <> · dashed is {thenLabel}</> : null}.
      </figcaption>
    </figure>
  );
}
