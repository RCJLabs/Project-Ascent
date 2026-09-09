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
 * the only honest way to keep a duplicate.
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
const ALPINE: Theme = {
  id: 'alpine',
  name: 'Alpine',
  blurb: 'Glacier blue on paper. The original.',
  light: {
    bg: '#f6f8fa',
    surface: '#ffffff',
    sunken: '#eef1f4',
    ink: '#17222b',
    inkSoft: '#55646f',
    line: '#dde3e9',
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

/**
 * Slate — maximum contrast, minimum colour.
 *
 * For anyone who finds the default too low-contrast, in bright sun, or on a
 * cheap phone screen. Every pair clears AAA (7:1) rather than AA.
 */
const SLATE: Theme = {
  id: 'slate',
  name: 'Slate',
  blurb: 'Maximum contrast. For bright sun and tired eyes.',
  light: {
    bg: '#ffffff',
    surface: '#ffffff',
    sunken: '#f0f2f4',
    ink: '#000000',
    inkSoft: '#3d4854',
    line: '#c3cbd3',
    accent: '#12507c',
    accentStrong: '#0c3a5b',
    accentInk: '#ffffff',
    positive: '#15582f',
    warn: '#6f4413',
    danger: '#8c1d18',
    viz1: '#12507c',
    viz2: '#9c3d10',
    vizGrid: '#d7dde3',
  },
  dark: {
    bg: '#000000',
    surface: '#12171c',
    sunken: '#000000',
    ink: '#ffffff',
    inkSoft: '#c3ccd4',
    line: '#3a444e',
    accent: '#8ec6ee',
    accentStrong: '#b3daf5',
    accentInk: '#000000',
    positive: '#79d69c',
    warn: '#e8bd7a',
    danger: '#f0918c',
    viz1: '#8ec6ee',
    viz2: '#f0a06b',
    vizGrid: '#2a333c',
  },
};

/**
 * Sandstone — warm, for anyone who finds blue-grey cold.
 *
 * The accent is the rock rather than the ice. Same contrast rules apply.
 */
const SANDSTONE: Theme = {
  id: 'sandstone',
  name: 'Sandstone',
  blurb: 'Desert rock. Warm rather than clinical.',
  light: {
    bg: '#faf7f2',
    surface: '#fffdfa',
    sunken: '#f2ece3',
    ink: '#2a211a',
    inkSoft: '#665c52',
    line: '#e5dccf',
    accent: '#9c4a1c',
    accentStrong: '#7d3a14',
    accentInk: '#fffdfa',
    positive: '#2f6b3c',
    warn: '#8a5a10',
    danger: '#a33028',
    viz1: '#9c4a1c',
    viz2: '#2f6470',
    vizGrid: '#ebe3d6',
  },
  dark: {
    bg: '#1a1512',
    surface: '#241d18',
    sunken: '#120e0c',
    ink: '#f2ebe3',
    inkSoft: '#b3a597',
    line: '#3a2f26',
    accent: '#e09a63',
    accentStrong: '#eeb586',
    accentInk: '#120e0c',
    positive: '#78c48c',
    warn: '#dcb063',
    danger: '#e88a80',
    viz1: '#e09a63',
    viz2: '#6fb5c4',
    vizGrid: '#33291f',
  },
};

export const THEMES: Theme[] = [ALPINE, SLATE, SANDSTONE];

export const DEFAULT_THEME_ID = ALPINE.id;

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? ALPINE;
}

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
}

/** Every surface a foreground colour can legitimately be painted on. */
export const SURFACES = ['bg', 'surface', 'sunken'] as const;

/** Foregrounds that must clear AA against every surface above. */
export const FOREGROUNDS = ['ink', 'inkSoft', 'accent', 'positive', 'warn', 'danger'] as const;
