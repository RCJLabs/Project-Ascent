import { Children, type ReactNode } from 'react';
import { CardBoundary } from './ErrorBoundary';

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
export function PageGrid({
  children,
  className = '',
  single = false,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Stay one column however wide the screen is (PLAN.md M240).
   *
   * A prop rather than an `lg:grid-cols-1` in `className`: both land in the
   * same class attribute and which one wins is decided by Tailwind's own
   * ordering of the stylesheet, not by the order they are written in. That
   * is the trap `SelectableCard`'s `padded` prop is documented for, and the
   * photo grid already lost a quarter of every thumbnail to it.
   *
   * For a grid that is already inside a column — Home's rail — where a
   * second split would make cards a third of the window wide.
   */
  single?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-3 lg:items-start ${single ? '' : 'lg:grid-cols-2'} ${className}`}
    >
      {/* Every card gets its own boundary, which is M20's "done when": one
          record of the wrong shape costs the card that reads it, not the
          page. Doing it here rather than at ~100 call sites also means a new
          card cannot forget to have one.

          A boundary renders no DOM of its own, so the grid's children are
          still the cards themselves — `Wide`'s `lg:col-span-2` keeps working.
          When one does fail, its ErrorCard becomes that grid cell. */}
      {Children.map(children, (child) => (
        <CardBoundary label="This card">{child}</CardBoundary>
      ))}
    </div>
  );
}
