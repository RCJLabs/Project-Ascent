/**
 * What a page shows while it is reading the database (PLAN.md M22).
 *
 * Four pages returned `null` until their store had hydrated. That is worse
 * than a blank card: with nothing in `main` the page has no height at all,
 * so the layout collapses and then snaps back a frame later, which reads as
 * a fault rather than as loading.
 *
 * These are deliberately dull. A shimmer sweeping across the screen is an
 * animation that says "still working" for the 40ms an IndexedDB read
 * actually takes on a warm database — long enough to notice the movement,
 * too short to learn anything from it. A quiet block that is the right size
 * holds the layout still, which is the whole job.
 *
 * `aria-hidden` with `aria-busy` on the container: a screen reader should be
 * told the region is loading, not read a description of grey rectangles.
 */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-sunken rounded-lg ${className}`} aria-hidden />;
}

/**
 * A card-shaped placeholder, sized to what usually lands there.
 *
 * Exported since M183, which needed one card's worth rather than a page's:
 * Home's coach card moved behind a lazy boundary and a `null` fallback put
 * back exactly the collapse-and-snap this file was written to remove.
 */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-4">
      <SkeletonBlock className="h-3 w-24 mb-3" />
      <div className="grid grid-cols-1 gap-2">
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonBlock
            key={i}
            // The last line short, because a paragraph's last line is.
            className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`}
          />
        ))}
      </div>
    </div>
  );
}
