import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * An icon-only button.
 *
 * `label` is required and not optional-by-convention: an icon button with
 * no accessible name is a button a screen reader announces as "button".
 * Making it a required prop is the only way to be sure, and it costs one
 * word at each call site.
 *
 * The pattern this replaces was `p-2.5 -m-1.5` written out by hand — a 34px
 * target with a negative margin to stop it disturbing the layout. That is
 * past WCAG 2.2's 24px floor but short of the 44px every platform guideline
 * asks for, so this is 44 with the negative margin doing the same job.
 *
 * `lg` is 56, and exists for gym mode (PLAN.md M74): a cold chalky hand on
 * glass between burns is not the hand 44 was measured for. A named size
 * rather than a className on the call site, because the width is in the base
 * class string and Tailwind's ordering decides which of two widths wins —
 * the M30 bug, where `p-0` lost to `p-3`.
 */

const SIZE = { md: 'w-11 h-11', lg: 'w-14 h-14 rounded-2xl' } as const;
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  children: ReactNode;
  /** Pull the target back out of the layout so a 44px box does not push
   *  neighbours around. On by default; off inside a toolbar. */
  inline?: boolean;
  size?: keyof typeof SIZE;
  tone?: keyof typeof TONE;
}

/**
 * Colour belongs here, not on the call site.
 *
 * `onAccent` exists because gym mode wanted a filled primary target and
 * reached for `className="bg-accent text-accent-ink"` — which rendered the
 * icon in `ink-soft` at **1.12:1** against the accent, because two utilities
 * setting `color` are resolved by the order Tailwind generated them in and
 * not by the order they appear in the attribute. That is the M30 bug, and
 * the only reliable fix is for the primitive to own the pairing. It matches
 * `Button`'s primary variant so there is one definition of a filled accent
 * control.
 */
const TONE = {
  default: 'text-ink-soft hover:text-ink',
  danger: 'text-danger',
  accent: 'text-accent',
  onAccent: 'bg-accent text-accent-ink hover:bg-accent-strong',
} as const;

export function IconButton({
  label,
  children,
  inline = true,
  size = 'md',
  tone = 'default',
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`focus-ring inline-flex items-center justify-center rounded-lg shrink-0 transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        SIZE[size]
      } ${inline ? '-m-2.5' : ''} ${TONE[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
