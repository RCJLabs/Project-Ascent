/**
 * A big number with a label under it.
 *
 * Defined separately in ProgressPage and YearPage with different markup for
 * the same thing; the career and altimeter pages hand-rolled a third
 * variant. One definition, so the type scale stays put.
 */
export function Stat({
  label,
  value,
  sub,
  className = '',
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-ink-soft uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-black tabular-nums leading-none mt-1">{value}</div>
      {sub !== undefined && <div className="text-xs text-ink-soft mt-1">{sub}</div>}
    </div>
  );
}
