/**
 * A whole page's worth of skeleton (PLAN.md M345).
 *
 * Out of `Skeleton.tsx`, whose cards Home shows at boot. Twelve lazy pages
 * use this one, and none of them is Home.
 */

import { SkeletonBlock, SkeletonCard } from './Skeleton';

/**
 * A whole page's worth, for the four routes that rendered nothing.
 *
 * Takes the page title when there is one, because the title is known before
 * the data is — a page that can say "Projects" while it loads is a page the
 * climber can tell they arrived at.
 */
/**
 * `SkeletonBlock` stays private: it is `SkeletonCard`'s own part.
 *
 * Both were exported once and neither was used outside this file, which is
 * the pattern `ui/wired.test.ts` exists to catch and it caught them on its
 * first run. `SkeletonCard` is exported again because M183 gave it a second
 * caller, which is the only reason that check accepts.
 */
export function PageSkeleton({ title, cards = 2 }: { title?: string; cards?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" aria-label={title ? `Loading ${title}` : 'Loading'}>
      {title === undefined ? (
        <SkeletonBlock className="h-7 w-40 mb-5" />
      ) : (
        <h1 className="text-2xl font-black tracking-tight mb-5">{title}</h1>
      )}
      <div className="grid grid-cols-1 gap-3">
        {Array.from({ length: cards }, (_, i) => (
          <SkeletonCard key={i} lines={i === 0 ? 3 : 2} />
        ))}
      </div>
    </div>
  );
}
