import type { ReactNode } from 'react';

/**
 * A page's stack of cards, which becomes two columns when there is room.
 *
 * Used only where the cards are independent readings — a dashboard, a list,
 * a set of settings. **Not** on a form, an editor, or anything with a
 * reading order: the logger's sections depend on each other, the finder is
 * a sequence of questions, and the program page walks phases in order.
 * Splitting those into columns would turn "next" into "look right, then
 * back left and down", which is worse than scrolling.
 *
 * `items-start` because a grid row is as tall as its tallest cell by
 * default, and a short card stretched to match a long one beside it looks
 * like a rendering fault.
 */
export function PageGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start ${className}`}>
      {children}
    </div>
  );
}

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
