import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { blockChanges, type BlockCompare as Compare } from '@/engine/blockCompare';
import { fromKey } from '@/engine/dates';
import type { Change } from '@/engine/yearReview';

/**
 * The last four weeks against the four before them (PLAN.md M28).
 *
 * Every other card on the Progress page describes the present. This is the
 * only one that answers "am I actually training more than I was?", which is
 * the question a climber asks far more often than the annual one.
 *
 * **Neutral on purpose.** Up is not painted green and down is not painted
 * red, because the app has no idea which is good: a deload block is
 * *supposed* to show as a decline, and so is the four weeks after a comp.
 * The direction is an arrow and a signed number — shape and text, which also
 * happens to be what M15's rule requires — and the caption says outright
 * that a quieter month is not a worse one.
 */

function Row({ change }: { change: Change }) {
  const flat = change.delta === 0;
  const Icon = flat ? ArrowRight : change.delta > 0 ? ArrowUp : ArrowDown;
  const sign = change.delta > 0 ? '+' : '';
  const round = (n: number) => (Number.isInteger(n) ? n : n.toFixed(1));

  return (
    <tr className="border-t border-line">
      <th scope="row" className="font-normal text-left py-1.5 pr-2">
        {change.label}
      </th>
      <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
        {round(change.now)}
        {change.unit}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums text-ink-soft">
        {round(change.then)}
        {change.unit}
      </td>
      <td className="py-1.5 pl-2 text-right tabular-nums text-ink-soft whitespace-nowrap">
        <Icon size={12} className="inline align-[-1px] mr-0.5" aria-hidden />
        {flat ? 'same' : `${sign}${round(change.delta)}${change.unit}`}
      </td>
    </tr>
  );
}

function label(from: string, to: string): string {
  const short = (key: string) =>
    fromKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${short(from)} – ${short(to)}`;
}

export function BlockCompareTable({ compare }: { compare: Compare }) {
  const rows = blockChanges(compare);
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <caption className="sr-only">
          The last four weeks against the four before them
        </caption>
        <thead>
          <tr className="text-2xs uppercase tracking-wide text-ink-soft">
            <th scope="col" className="text-left font-semibold py-1 pr-2">
              &nbsp;
            </th>
            <th scope="col" className="text-right font-semibold py-1 px-2">
              {label(compare.nowFrom, compare.nowTo)}
            </th>
            <th scope="col" className="text-right font-semibold py-1 px-2">
              {label(compare.beforeFrom, compare.beforeTo)}
            </th>
            <th scope="col" className="text-right font-semibold py-1 pl-2">
              Change
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((change) => (
            <Row key={change.label} change={change} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
