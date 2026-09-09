/**
 * The altimeter's mountain, filling as you climb.
 *
 * One ridgeline, clipped, with a level rising through it. The numbers beside
 * it carry the meaning — the silhouette is there because a bar cannot make
 * volume feel like a journey and this can.
 */

const RIDGE =
  'M 0 160 L 38 98 L 60 120 L 94 58 L 128 106 L 156 86 L 196 24 L 234 94 L 258 72 L 290 120 L 320 160 Z';

export function MountainMeter({
  fraction,
  caption,
  height = 120,
}: {
  fraction: number;
  caption: string;
  height?: number;
}) {
  const level = Math.max(0, Math.min(1, fraction));
  const y = 160 - level * 160;

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 320 160"
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={caption}
      >
        <defs>
          <clipPath id="ridge-clip">
            <path d={RIDGE} />
          </clipPath>
        </defs>
        {/* The whole mountain, unfilled, so the shape reads at zero. */}
        <path d={RIDGE} className="fill-sunken" />
        <rect x={0} y={y} width={320} height={160 - y} className="fill-accent" clipPath="url(#ridge-clip)" />
        {/* The waterline, so the level is legible without comparing fills.
            Clipped to the ridge, or it reads as a horizon behind the peak. */}
        {level > 0 && level < 1 && (
          <line
            x1={0}
            x2={320}
            y1={y}
            y2={y}
            className="stroke-accent-strong"
            strokeWidth={2}
            clipPath="url(#ridge-clip)"
          />
        )}
        <path d={RIDGE} className="fill-none stroke-line" strokeWidth={1.5} />
      </svg>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}
