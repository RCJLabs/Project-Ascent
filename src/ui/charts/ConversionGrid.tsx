import { fromKey } from '@/engine/dates';
import type { ConversionTrend, GradeConversion } from '@/engine/conversion';
import { ENOUGH_TRIES, drawable } from '@/engine/conversion';
import type { GradeScale } from '@/engine/grades';

/**
 * Conversion per grade, block by block (PLAN.md M83).
 *
 * **Gaps stay gaps**, the rule `loadTrend` already sets: a block with fewer
 * than `ENOUGH_TRIES` at a grade is drawn empty, not as a zero. Zero is a
 * real reading — you tried it eight times and sent none — and a climber who
 * simply did not touch that grade that month must not be shown it.
 *
 * **Filled by conversion, and captioned by count.** The bar says the rate
 * at a glance and the title says what it came from, because the rate alone
 * is the misleading half: one in two from two tries and one in two from
 * twenty are the same bar and different facts.
 *
 * **A picture, not a control.** Six columns inside a 288px card is a 44px
 * cell, which would pass as a target — but there is nothing behind a cell
 * to open. The grades are the climber's own ladder and the sessions behind
 * them are reachable from the calendar.
 *
 * **A grade that never reached the threshold gets no row.** Six empty cells
 * say nothing; the sentence beneath says "V7, 4 tries in six months", which
 * is the same fact as a finding.
 */

const W = 320;
const PAD_L = 34;
const PAD_R = 6;
const ROW = 20;
const GAP = 3;
const HEAD = 12;

/** Track behind each cell, so an empty block still reads as a block. */
const TRACK = 0.12;

function monthOf(date: string): string {
  return fromKey(date).toLocaleDateString(undefined, { month: 'short' });
}

export function ConversionGrid({
  trend,
  label,
}: {
  trend: ConversionTrend;
  label: (scale: GradeScale, grade: string) => string;
}) {
  const columns = trend.edges.length;
  // Only grades that reached the threshold in at least one block. A row of
  // six empty cells is not a finding; `describeConversion` names those
  // grades and their try count in the sentence instead.
  const rows = drawable(trend);
  const height = HEAD + rows.length * (ROW + GAP);
  const plotW = W - PAD_L - PAD_R;
  const cell = (plotW - GAP * (columns - 1)) / columns;

  const x = (i: number) => PAD_L + i * (cell + GAP);
  const y = (i: number) => HEAD + i * (ROW + GAP);

  const title = (grade: GradeConversion, i: number): string => {
    const block = grade.blocks[i]!;
    const tries = block.sends + block.attempts;
    const when = `${monthOf(block.from)}–${monthOf(block.to)}`;
    const name = label(trend.scale, grade.grade);
    if (tries === 0) return `${name}, ${when}: not climbed`;
    if (block.conversion === null) {
      return `${name}, ${when}: ${block.sends} from ${tries} — under ${ENOUGH_TRIES} tries, so not counted`;
    }
    return `${name}, ${when}: ${block.sends} from ${tries}`;
  };

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${Math.max(HEAD + ROW, height)}`}
        className="w-full h-auto block"
        role="img"
        aria-label={`Sends as a share of tries, per grade, over ${columns} four-week blocks: ${rows
          .map((grade) => {
            const said = grade.blocks
              .map((b, i) => (b.conversion === null ? null : title(grade, i)))
              .filter((s): s is string => s !== null);
            return said.length === 0
              ? `${label(trend.scale, grade.grade)}, never enough tries in one block`
              : said.join('; ');
          })
          .join('. ')}`}
      >
        {trend.edges.map((edge, i) => (
          <text
            key={edge.from}
            x={x(i) + cell / 2}
            y={HEAD - 4}
            textAnchor="middle"
            className="fill-ink-soft"
            style={{ fontSize: 8 }}
          >
            {monthOf(edge.to)}
          </text>
        ))}

        {rows.map((grade, r) => (
          <g key={grade.grade}>
            <text
              x={PAD_L - 5}
              y={y(r) + ROW / 2}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-soft"
              style={{ fontSize: 9 }}
            >
              {label(trend.scale, grade.grade)}
            </text>
            {grade.blocks.map((block, i) => (
              <g key={block.from}>
                <rect
                  x={x(i)}
                  y={y(r)}
                  width={cell}
                  height={ROW}
                  rx={3}
                  className="fill-ink-soft"
                  opacity={TRACK}
                />
                {block.conversion !== null && (
                  <rect
                    x={x(i)}
                    y={y(r) + ROW - Math.max(2, ROW * block.conversion)}
                    width={cell}
                    height={Math.max(2, ROW * block.conversion)}
                    rx={3}
                    className="fill-viz-1"
                  />
                )}
                <title>{title(grade, i)}</title>
              </g>
            ))}
          </g>
        ))}
      </svg>
      <p className="text-2xs text-ink-soft mt-1.5 leading-relaxed">
        Taller is more sends per try. A blank block is one with fewer than {ENOUGH_TRIES} tries at
        that grade — too few to read, which is not the same as none sent.
      </p>
    </figure>
  );
}
