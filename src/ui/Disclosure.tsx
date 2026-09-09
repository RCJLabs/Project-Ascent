import type { ReactNode } from 'react';

/**
 * A header that opens the thing under it.
 *
 * Four places had hand-rolled this — the guide sections, the skill trees,
 * the training-state reset and the settings groups — and between them they
 * managed three different sets of the attributes that make it work. The
 * ones that matter are `aria-expanded` (so it is announced as collapsed
 * rather than as a mystery) and a focus ring on a target that is usually
 * the full width of a card.
 *
 * Deliberately unstyled beyond that: the four call sites look nothing like
 * each other and forcing a common look would be worse than the duplication.
 */
export function DisclosureButton({
  open,
  onToggle,
  children,
  className = '',
  label,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  /** Only needed when the visible content is not a usable name. */
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      {...(label === undefined ? {} : { 'aria-label': label })}
      className={`focus-ring w-full text-left ${className}`}
    >
      {children}
    </button>
  );
}
