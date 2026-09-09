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
 */
export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  children: ReactNode;
  /** Pull the target back out of the layout so a 44px box does not push
   *  neighbours around. On by default; off inside a toolbar. */
  inline?: boolean;
  tone?: 'default' | 'danger' | 'accent';
}

const TONE = {
  default: 'text-ink-soft hover:text-ink',
  danger: 'text-danger',
  accent: 'text-accent',
} as const;

export function IconButton({
  label,
  children,
  inline = true,
  tone = 'default',
  className = '',
  ...rest
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`focus-ring inline-flex items-center justify-center rounded-lg shrink-0 w-11 h-11 transition-colors disabled:opacity-40 disabled:pointer-events-none ${
        inline ? '-m-2.5' : ''
      } ${TONE[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
