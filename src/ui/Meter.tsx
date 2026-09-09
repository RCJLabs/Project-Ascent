/**
 * A progress bar.
 *
 * `h-1.5 rounded-full bg-sunken overflow-hidden` plus an inner fill was
 * written out in the objectives list, the objective detail, the career
 * page, the altimeter and the level bar — with the heights already drifting
 * between 1, 1.5 and 2.
 *
 * The accessibility part is the reason it is a component rather than a
 * class string: a bar that shows a number to a sighted reader and nothing
 * to anyone else is half a control. `role="progressbar"` with a value and a
 * text form gives both, and `label` is required so it can never be an
 * anonymous "progress bar".
 */
export function Meter({
  value,
  label,
  valueText,
  size = 'md',
  tone = 'accent',
  className = '',
}: {
  /** 0..1. Clamped, because a derived fraction can exceed 1 on a completed goal. */
  value: number;
  label: string;
  /** How the value should be read out, when a percentage is not the point
   *  ("4 of 8 days"). Defaults to the percentage. */
  valueText?: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'accent' | 'positive' | 'warn';
  className?: string;
}) {
  const fraction = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const percent = Math.round(fraction * 100);
  const height = size === 'sm' ? 'h-1' : size === 'lg' ? 'h-2.5' : 'h-1.5';
  const fill = tone === 'positive' ? 'bg-positive' : tone === 'warn' ? 'bg-warn' : 'bg-accent';

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText ?? `${percent}%`}
      className={`${height} rounded-full bg-sunken overflow-hidden ${className}`}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
