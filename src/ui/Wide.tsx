/**
 * A card that spans the page grid (PLAN.md M345).
 *
 * Out of `PageGrid.tsx`, whose grid Home is laid out in. Home has no wide
 * card; four lazy pages do.
 */

import type { ReactNode } from 'react';

/**
 * A child that keeps the full width when the grid splits.
 *
 * Two things a column break ruins. A control that governs the cards below
 * it — a Boulder/Routes toggle landing in the right column while the charts
 * it switches sit in the left reads as belonging to nothing, and leaves a
 * hole where a card should be. And a row of figures laid out horizontally,
 * which a half-width column wraps into a ragged block.
 */
export function Wide({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`lg:col-span-2 ${className}`}>{children}</div>;
}
