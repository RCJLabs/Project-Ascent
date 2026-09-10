import type { ReactNode } from 'react';

/**
 * The selected/unselected toggle, in its two shapes.
 *
 * Before M13 the selected state (`border-accent bg-accent/10`) was written
 * out thirty times across sixteen feature files, which is thirty chances
 * for the two shapes to drift apart and thirty places where a screen reader
 * was told nothing about whether the thing was on.
 *
 * Both shapes set `aria-pressed`, because that is the difference between a
 * button that does something and a button that *is* something.
 */

const BASE = 'focus-ring border transition-colors text-left disabled:opacity-40 disabled:pointer-events-none';
const ON = 'border-accent bg-accent/10 font-semibold text-ink';
const OFF = 'border-line bg-sunken text-ink-soft hover:text-ink';

/**
 * The chip's look, for something that navigates rather than toggles.
 *
 * A `Chip` inside a `Link` would be a button inside an anchor: invalid, and
 * announced as two overlapping controls. A link that looks like a chip is
 * the honest version.
 */
export const CHIP_LINK = `${BASE} ${OFF} rounded-lg px-3 py-2 text-sm min-h-11 inline-flex items-center`;

/** A single word or two: a filter, a scale, a status. */
export function Chip({
  active,
  onClick,
  children,
  className = '',
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={`${BASE} ${active ? ON : OFF} rounded-lg px-3 py-2 text-sm min-h-11 ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * A chip with room to explain itself — a severity, an objective kind, an
 * onboarding answer. The blurb is part of the label rather than a title
 * attribute, so it is read out with the option rather than after it.
 */
export function OptionCard({
  active,
  onClick,
  label,
  blurb,
  className = '',
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: ReactNode;
  blurb?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={`${BASE} ${active ? ON : `${OFF} text-ink`} rounded-xl px-3 py-2.5 ${className}`}
    >
      <span className="block font-semibold text-sm">{label}</span>
      {blurb !== undefined && (
        <span className="block text-xs font-normal text-ink-soft mt-0.5">{blurb}</span>
      )}
    </button>
  );
}

/**
 * A selectable region with arbitrary content inside it — a weekly layout
 * preview, a photo thumbnail, anything where the choice *is* the picture.
 *
 * `label` is required for the same reason it is on IconButton: whatever is
 * inside may be a grid of coloured squares or an `<img>`, and neither gives
 * a screen reader a name to read.
 */
export function SelectableCard({
  selected,
  onClick,
  label,
  children,
  padded = true,
  disabled = false,
  className = '',
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
  /**
   * Off for a card whose child fills it — a photo thumbnail, say.
   *
   * A prop rather than a `p-0` in `className`: both land in the same class
   * attribute, and which one wins is decided by Tailwind's own ordering of
   * the stylesheet rather than by the order they are written in. The photo
   * grid passed `p-0` and got `p-3`, losing a quarter of every thumbnail.
   */
  padded?: boolean;
  /** For a card that is shown but cannot be chosen — a locked kit, say. */
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      className={`${BASE} ${selected ? ON : `${OFF} text-ink`} rounded-xl ${padded ? 'p-3' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * A colour swatch that can be selected — the avatar's skin tones and kit.
 *
 * Its own component because the visible label *is* the colour, so `label`
 * has to carry the whole accessible name, and because a 36px square was
 * short of a comfortable target. The ring sits outside the swatch so it
 * does not eat into the colour being chosen.
 */
export function Swatch({
  active,
  onClick,
  label,
  color,
  className = '',
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`focus-ring w-11 h-11 rounded-lg border-2 transition-colors ${
        active ? 'border-accent' : 'border-line'
      } ${className}`}
      style={{ background: color }}
    />
  );
}
