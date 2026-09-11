import { fromKey } from '@/engine/dates';
import type { CheckInHistory } from '@/engine/checkIns';
import {
  FINGER_CHIP,
  FINGER_LABEL,
  SLEEP_CHIP,
  SLEEP_LABEL,
  type FingerFeel,
  type SleepFeel,
} from '@/engine/readiness';

/**
 * Every check-in in the window, on the dates they were given (PLAN.md M82).
 *
 * **Why a mark per answer and not a slot per day.** M82 proposed putting
 * these on the load-trend line, which gives 288 units to 90 days — 3.2 a
 * day, measured from its own constants — and the consistency grid is
 * tighter still at 4.5px cells. Two categorical dimensions at that pitch is
 * a smear. Here only an answered day gets a mark, so a climber with a
 * dozen check-ins sees a dozen marks on a three-month axis and the runs are
 * visible as clusters, which is the whole reason to draw it rather than
 * count it.
 *
 * **Two rows, because the two questions are independent.** The engine's own
 * note says a second question only earns its place if it changes the answer
 * by itself; sore fingers on a good night and fresh fingers on no sleep are
 * different days. One row each keeps them that way.
 *
 * **A picture, not a control.** Marks land wherever the dates put them and
 * can sit a pixel apart, which is under any reasonable target size, so
 * there is nothing here to tap — the list of dates lives in the card
 * beneath it, where a day is reachable at full size.
 */

const W = 320;
const ROW = 14;
// Room under the second row for the date labels: at +16 the "Sleep" caption
// and the "Jun 14" beneath it sat close enough to scan as one phrase, seen
// in a browser at 430px.
const H = ROW * 2 + 22;
const PAD_L = 42;
const PAD_R = 6;
const R = 3.5;

/** How hard each answer is drawn. "Fine" is present but quiet. */
const FINGER_TONE: Record<FingerFeel, { className: string; opacity: number }> = {
  good: { className: 'fill-ink-soft', opacity: 0.35 },
  tender: { className: 'fill-warn', opacity: 0.9 },
  sore: { className: 'fill-danger', opacity: 0.95 },
};

const SLEEP_TONE: Record<SleepFeel, { className: string; opacity: number }> = {
  good: { className: 'fill-ink-soft', opacity: 0.35 },
  short: { className: 'fill-warn', opacity: 0.9 },
  none: { className: 'fill-danger', opacity: 0.95 },
};

function when(date: string): string {
  return fromKey(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function CheckInStrip({ history }: { history: CheckInHistory }) {
  const span = history.days.length;
  const plotW = W - PAD_L - PAD_R;

  // Position by date across the window, not by index: three answers in one
  // week and three across three months are the thing the strip exists to
  // tell apart, and an index axis draws them identically.
  const from = fromKey(history.from).getTime();
  const to = fromKey(history.to).getTime();
  const reach = Math.max(1, to - from);
  const x = (date: string) => PAD_L + ((fromKey(date).getTime() - from) / reach) * plotW;

  const rows = [
    {
      key: 'fingers' as const,
      label: 'Fingers',
      y: 8 + ROW / 2,
      tone: (d: (typeof history.days)[number]) => FINGER_TONE[d.checkIn.fingers],
      said: (d: (typeof history.days)[number]) => FINGER_LABEL[d.checkIn.fingers],
      chip: (d: (typeof history.days)[number]) => FINGER_CHIP[d.checkIn.fingers],
    },
    {
      key: 'sleep' as const,
      label: 'Sleep',
      y: 8 + ROW + ROW / 2,
      tone: (d: (typeof history.days)[number]) => SLEEP_TONE[d.checkIn.sleep],
      said: (d: (typeof history.days)[number]) => SLEEP_LABEL[d.checkIn.sleep],
      chip: (d: (typeof history.days)[number]) => SLEEP_CHIP[d.checkIn.sleep],
    },
  ];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto block"
        role="img"
        aria-label={`${span} check-in${span === 1 ? '' : 's'} over the last three months, by date: ${history.days
          .map((d) => `${when(d.date)}, fingers ${FINGER_CHIP[d.checkIn.fingers].toLowerCase()}, slept ${SLEEP_CHIP[d.checkIn.sleep].toLowerCase()}`)
          .join('; ')}`}
      >
        {rows.map((row) => (
          <g key={row.key}>
            <line
              x1={PAD_L}
              y1={row.y}
              x2={W - PAD_R}
              y2={row.y}
              className="stroke-viz-grid"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 6}
              y={row.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-soft"
              style={{ fontSize: 9 }}
            >
              {row.label}
            </text>
            {history.days.map((day) => {
              const tone = row.tone(day);
              return (
                <circle
                  key={`${day.sessionId}-${row.key}`}
                  cx={x(day.date)}
                  cy={row.y}
                  r={R}
                  className={tone.className}
                  opacity={tone.opacity}
                >
                  <title>{`${when(day.date)}: ${row.said(day)}`}</title>
                </circle>
              );
            })}
          </g>
        ))}
        <text
          x={PAD_L}
          y={H - 2}
          className="fill-ink-soft"
          style={{ fontSize: 9 }}
        >
          {when(history.from)}
        </text>
        <text
          x={W - PAD_R}
          y={H - 2}
          textAnchor="end"
          className="fill-ink-soft"
          style={{ fontSize: 9 }}
        >
          {when(history.to)}
        </text>
      </svg>
      {/* Three tones and nothing saying what they meant — measured in a
          browser, where the runs read clearly and the severity did not.
          Worded from the answers rather than from the colours, because
          "amber" is not what the climber typed. */}
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-ink-soft mt-1.5">
        <li>
          <span className="inline-block size-2 rounded-full bg-ink-soft/35 mr-1" aria-hidden />
          fine
        </li>
        <li>
          <span className="inline-block size-2 rounded-full bg-warn mr-1" aria-hidden />
          tender · slept short
        </li>
        <li>
          <span className="inline-block size-2 rounded-full bg-danger mr-1" aria-hidden />
          sore · barely slept
        </li>
      </ul>
    </figure>
  );
}
