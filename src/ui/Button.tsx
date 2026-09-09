import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-strong border border-transparent',
  outline: 'bg-transparent text-ink border border-line hover:bg-sunken',
  ghost: 'bg-transparent text-ink-soft border border-transparent hover:bg-sunken hover:text-ink',
  danger: 'bg-transparent text-danger border border-line hover:bg-sunken',
};

/**
 * Sizes carry a minimum height as well as padding.
 *
 * WCAG 2.2 asks for 24×24 CSS pixels of target (2.5.8); 44 is the figure
 * every platform guideline lands on and the one a cold hand on a phone
 * actually needs. `sm` is the one compromise, at 36 — it exists for chips
 * and inline actions where 44 would break the line, and it is still well
 * past the requirement.
 */
const SIZE: Record<Size, string> = {
  sm: 'text-sm px-3 py-1.5 rounded-lg min-h-9',
  md: 'text-sm px-4 py-2.5 rounded-xl min-h-11',
  lg: 'text-base px-5 py-3 rounded-xl min-h-12',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * The button.
 *
 * Everything clickable that is not a link should be one of these or an
 * `IconButton`. Before M13 there were ninety-five bare `<button>` elements
 * against twenty files importing this, which meant ninety-five chances to
 * forget a focus ring, a hit target or a disabled state — and this
 * component had no focus style of its own to forget. `guides`-style source
 * tests in ui.test.ts now hold that line.
 */
export function Button({ variant = 'primary', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    />
  );
}
