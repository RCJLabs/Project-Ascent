/**
 * Themes, as data (PLAN.md M15).
 *
 * ## Why this is not just CSS
 *
 * `index.css` used to be the only place the palette existed, and a comment
 * in it claimed the colours were "validated for colour-vision deficiency
 * against the chart surface (validate_palette.js, all checks pass in both
 * modes)". There is no such script in this repository and there never was.
 * Nothing had ever checked the palette, and three colours in light mode were
 * failing WCAG AA the whole time: the accent at 4.31:1 (used as text
 * throughout), warn at 3.82:1 (every injury flag and load warning), and
 * positive at 3.74:1 on sunken.
 *
 * So the palette lives here, where `themes.test.ts` can measure every colour
 * against every surface it is actually painted on, in every theme and both
 * modes, and simulate the three common kinds of colour blindness against the
 * chart series. A claim in a comment is not a check.
 *
 * ## First paint
 *
 * `index.css` still carries Alpine's values so the very first frame is
 * painted before any JavaScript runs. A test asserts the two agree, which is
 * the only honest way to keep a duplicate, and `scripts/gen-theme-css.mjs`
 * writes it from here rather than anyone typing it twice.
 *
 * ## Light mode used to be the accent and nothing else (PLAN.md M125)
 *
 * Every rule above is about whether a palette is *legible*. None of them
 * asked whether two palettes are *different*, and in light mode they were
 * not: **seven of the ten painted `surface` — the card colour, and the
 * most-painted colour in the app — as exactly `#ffffff`.** Measured across
 * the page furniture the mean distance between two themes was 13.5 in light
 * against 25.3 in dark, while the accents were equally far apart in both.
 * Gritstone beside Desert, and Alpine beside Midnight, were 4.9 apart: the
 * same page with a different button on it. It is 20.4 now, with the closest
 * pair at 7.4 against dark's 8.9 — nine of the ten papers are distinct, and
 * the two that share one are the two that are meant to.
 *
 * So the ten light palettes have a paper each now — warm for Sandstone and
 * Desert, cool for Alpine and Ice, grey-brown for Gritstone — and the
 * blurbs above finally describe both modes rather than only the dark one.
 * The tint is in the hue rather than the lightness, because `bg`, `surface`
 * and `sunken` all carry the same AA obligation and `sunken` is the one
 * that binds: every attempt to darken it put `accent`, `positive` or `warn`
 * under 4.5:1 on it. `themes.test.ts` now holds a floor on the separation,
 * which is the half of that milestone that keeps.
 */

export interface Palette {
  bg: string;
  surface: string;
  sunken: string;
  ink: string;
  inkSoft: string;
  line: string;
  accent: string;
  accentStrong: string;
  accentInk: string;
  positive: string;
  warn: string;
  danger: string;
  /** The two chart series. Kept apart from the UI accent so a series never
   *  reads as a status, and vice versa. */
  viz1: string;
  viz2: string;
  vizGrid: string;
}

/**
 * The severity ramp, shared by every theme.
 *
 * Not themed, for the reason the original CSS gave and then did not enforce:
 * a status must never look like a chart series, and a climber who changes
 * theme should not have to relearn what "danger" looks like.
 *
 * Ordered by lightness as well as hue, so severity reads as prominence.
 * That matters because **four levels cannot be told apart by colour alone**
 * — under simulated deuteranopia the original ramp put `serious` and
 * `critical` a distance of 2 apart, which is identical. Spreading the
 * lightness lifts the worst pair to 14 in light and 37 in dark, which is
 * better and still not enough on its own. Every place these are used pairs
 * them with an icon and a word; the test below holds that.
 */
export const STATUS: Record<'light' | 'dark', { good: string; warning: string; serious: string; critical: string }> = {
  light: { good: '#1a853e', warning: '#8f6900', serious: '#a33c00', critical: '#7d1418' },
  dark: { good: '#31a05a', warning: '#e0aa3c', serious: '#f2a271', critical: '#fbd0cd' },
};

export interface Theme {
  id: string;
  name: string;
  blurb: string;
  light: Palette;
  dark: Palette;
}

/** CSS custom property per palette key. */
export const CSS_VAR: Record<keyof Palette, string> = {
  bg: '--c-bg',
  surface: '--c-surface',
  sunken: '--c-sunken',
  ink: '--c-ink',
  inkSoft: '--c-ink-soft',
  line: '--c-line',
  accent: '--c-accent',
  accentStrong: '--c-accent-strong',
  accentInk: '--c-accent-ink',
  positive: '--c-positive',
  warn: '--c-warn',
  danger: '--c-danger',
  viz1: '--viz-1',
  viz2: '--viz-2',
  vizGrid: '--viz-grid',
};

/** The status ramp's variables, set once per mode rather than per theme. */
export const STATUS_VAR = {
  good: '--viz-good',
  warning: '--viz-warning',
  serious: '--viz-serious',
  critical: '--viz-critical',
} as const;

/**
 * Alpine — the original. Light-first, one glacier accent, big numbers.
 *
 * Accent, warn and positive are each a step darker than they shipped: the
 * originals failed AA against the surfaces they are painted on.
 */
export const ALPINE: Theme = {
  id: 'alpine',
  name: 'Alpine',
  blurb: 'Glacier blue on paper. The original.',
  light: {
    bg: '#e9f2fa',
    surface: '#fafdff',
    sunken: '#e5eff7',
    ink: '#17222b',
    inkSoft: '#55646f',
    line: '#ccdcec',
    accent: '#2a6f9f',
    accentStrong: '#215a82',
    accentInk: '#ffffff',
    positive: '#277548',
    warn: '#96601f',
    danger: '#a83a34',
    viz1: '#2a78d6',
    viz2: '#c4521f',
    vizGrid: '#e6eaee',
  },
  dark: {
    bg: '#10181f',
    surface: '#182430',
    sunken: '#0c1319',
    ink: '#e8eef3',
    inkSoft: '#93a4b2',
    line: '#263542',
    accent: '#5aa3d4',
    accentStrong: '#7db8e0',
    accentInk: '#0c1319',
    positive: '#55b380',
    warn: '#d19a52',
    danger: '#d4706a',
    viz1: '#5c9fe8',
    viz2: '#e6874f',
    vizGrid: '#24313d',
  },
};

export const CONTRAST: Theme = {
  id: 'contrast',
  name: 'High Contrast',
  blurb: 'Maximum legibility, for reading in the sun or with low vision.',
  light: {
    bg: '#ffffff',
    surface: '#ffffff',
    sunken: '#f5f5f5',
    ink: '#2e2424',
    inkSoft: '#6b5757',
    line: '#d4d4d4',
    accent: '#0b65da',
    accentStrong: '#025dd4',
    accentInk: '#ffffff',
    positive: '#257e4f',
    warn: '#966613',
    danger: '#a52b27',
    viz1: '#19326b',
    viz2: '#c57b26',
    vizGrid: '#ebeaea',
  },
  dark: {
    bg: '#0a0a0a',
    surface: '#171717',
    sunken: '#0f0f0f',
    ink: '#e4dddd',
    inkSoft: '#baabab',
    line: '#302c2c',
    accent: '#257ef4',
    accentStrong: '#358cfd',
    accentInk: '#121821',
    positive: '#4dcb88',
    warn: '#eab253',
    danger: '#da6662',
    viz1: '#5179d6',
    viz2: '#ebc598',
    vizGrid: '#2a2727',
  },
};

export const DEFAULT_THEME_ID = ALPINE.id;

/**
 * The palette used when the system asks for more contrast.
 *
 * Named rather than inlined, because two places have to agree about it: the
 * code that applies it and the sentence in Settings that tells a climber
 * what will happen.
 */
export const CONTRAST_THEME_ID = CONTRAST.id;

/**
 * The consistency grid's five steps, from one hue (PLAN.md M23).
 *
 * Derived rather than authored, and derived *here* rather than written as a
 * `color-mix` in the stylesheet, so there is one source of truth and a test
 * can measure it. A ramp only checked by eye is how this project shipped
 * three colours failing AA.
 *
 * One hue, mixed toward the empty-cell colour, so **lightness carries the
 * scale**. That is the M15 rule and it matters more here than anywhere else:
 * a grid is read by comparing hundreds of four-pixel squares at a glance,
 * and a scale that needs hue discrimination is unreadable to roughly one man
 * in twelve.
 *
 * A rested day gets the faintest step rather than the empty colour, because
 * "I rested on purpose" and "I did not open the app" are opposite facts and
 * the same square would report the first as the second.
 */
export const HEAT_STOPS = [0.16, 0.34, 0.55, 0.78, 1] as const;

export function heatRamp(palette: Palette): string[] {
  return HEAT_STOPS.map((amount) => mix(palette.sunken, palette.viz1, amount));
}

/** Linear blend of two hex colours, `amount` of `b` over `a`. */
function mix(a: string, b: string, amount: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  const out = [1, 3, 5].map((at) => {
    const value = channel(a, at) + (channel(b, at) - channel(a, at)) * amount;
    return Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  });
  return `#${out.join('')}`;
}

/** `--heat-1` is a rested day; 2–5 are the four load levels. */
export const HEAT_VAR = HEAT_STOPS.map((_, i) => `--heat-${i + 1}`);

/**
 * Paint a palette onto an element as custom properties.
 *
 * Set inline on `<html>` rather than swapped as a stylesheet, so a theme
 * change is one style recalculation and nothing flashes.
 */
export function applyPalette(element: HTMLElement, palette: Palette, mode: 'light' | 'dark'): void {
  for (const [key, variable] of Object.entries(CSS_VAR)) {
    element.style.setProperty(variable, palette[key as keyof Palette]);
  }
  for (const [key, variable] of Object.entries(STATUS_VAR)) {
    element.style.setProperty(variable, STATUS[mode][key as keyof (typeof STATUS)['light']]);
  }
  heatRamp(palette).forEach((color, i) => element.style.setProperty(HEAT_VAR[i]!, color));
}

/** Every surface a foreground colour can legitimately be painted on. */
export const SURFACES = ['bg', 'surface', 'sunken'] as const;

/** Foregrounds that must clear AA against every surface above. */
export const FOREGROUNDS = ['ink', 'inkSoft', 'accent', 'positive', 'warn', 'danger'] as const;
