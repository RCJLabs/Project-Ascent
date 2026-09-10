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

/**
 * Seven more, drafted with `scripts/theme-draft.ts` and checked with
 * `npm run themes:check` (PLAN.md M61).
 *
 * The judgement in a theme is its character — which hues, how warm, how
 * dark. The arithmetic that keeps twenty-six colours above their contrast
 * floors is arithmetic, and guessing at it is how this app shipped an accent
 * at 4.31:1 for months. So the character is authored in the drafter's specs
 * and the numbers are solved.
 *
 * The last two are not moods. **High Contrast** exists for reading in
 * sunlight or with low vision, and its two chart series are separated by
 * lightness as well as hue — on a white ground both were being darkened to
 * reach 3:1 until they were 25 apart under simulation, against a floor of
 * 40. **Midnight** is true black, which on an OLED screen is a battery
 * setting as much as a look.
 */
const LIMESTONE: Theme = {
  id: 'limestone',
  name: 'Limestone',
  blurb: 'Pale grey-buff, the colour of a sunny crag.',
  light: {
    bg: '#f5f3f0',
    surface: '#fdfdfc',
    sunken: '#ece9e4',
    ink: '#2e2a24',
    inkSoft: '#6b6357',
    line: '#e0dbd2',
    accent: '#1d6ca5',
    accentStrong: '#1879bf',
    accentInk: '#ffffff',
    positive: '#22774a',
    warn: '#8d5f11',
    danger: '#a52b27',
    viz1: '#2967ae',
    viz2: '#ab8621',
    vizGrid: '#e4e0d8',
  },
  dark: {
    bg: '#242019',
    surface: '#27231c',
    sunken: '#2a261d',
    ink: '#e4e1dd',
    inkSoft: '#bab4ab',
    line: '#4e4636',
    accent: '#3c9add',
    accentStrong: '#49a6e9',
    accentInk: '#152028',
    positive: '#4dcb88',
    warn: '#eab253',
    danger: '#dc6e6a',
    viz1: '#5a95d8',
    viz2: '#e0bd5c',
    vizGrid: '#484132',
  },
};

const GRITSTONE: Theme = {
  id: 'gritstone',
  name: 'Gritstone',
  blurb: 'Dark, coarse and warm — northern rock.',
  light: {
    bg: '#efedeb',
    surface: '#ffffff',
    sunken: '#e6e2e0',
    ink: '#2e2724',
    inkSoft: '#6b5e57',
    line: '#d9d3ce',
    accent: '#a74820',
    accentStrong: '#bc4b1a',
    accentInk: '#ffffff',
    positive: '#217347',
    warn: '#885c11',
    danger: '#a52b27',
    viz1: '#2974ae',
    viz2: '#ab7d21',
    vizGrid: '#ddd8d4',
  },
  dark: {
    bg: '#1d1916',
    surface: '#282320',
    sunken: '#221e1b',
    ink: '#e4dfdd',
    inkSoft: '#bab0ab',
    line: '#453c36',
    accent: '#da6d3e',
    accentStrong: '#e77a4b',
    accentInk: '#281b15',
    positive: '#4dcb88',
    warn: '#eab253',
    danger: '#db6a66',
    viz1: '#5aa1d8',
    viz2: '#e0b45c',
    vizGrid: '#3f3731',
  },
};

const VOLCANIC: Theme = {
  id: 'volcanic',
  name: 'Volcanic',
  blurb: 'Black rock with an ember in it.',
  light: {
    bg: '#efeef1',
    surface: '#ffffff',
    sunken: '#e5e3e8',
    ink: '#28242e',
    inkSoft: '#5f576b',
    line: '#d5d3d9',
    accent: '#b63616',
    accentStrong: '#c7340f',
    accentInk: '#ffffff',
    positive: '#217347',
    warn: '#885c11',
    danger: '#a52b27',
    viz1: '#2981ae',
    viz2: '#ab8b21',
    vizGrid: '#dad8de',
  },
  dark: {
    bg: '#141316',
    surface: '#201f23',
    sunken: '#19171c',
    ink: '#e0dde4',
    inkSoft: '#b1abba',
    line: '#37343d',
    accent: '#e65733',
    accentStrong: '#f16441',
    accentInk: '#281915',
    positive: '#4dcb88',
    warn: '#eab253',
    danger: '#da6662',
    viz1: '#5aaed8',
    viz2: '#e0c15c',
    vizGrid: '#322f37',
  },
};

const DESERT: Theme = {
  id: 'desert',
  name: 'Desert',
  blurb: 'Red rock and a hard blue sky.',
  light: {
    bg: '#f4eeec',
    surface: '#ffffff',
    sunken: '#ece3df',
    ink: '#2e2624',
    inkSoft: '#6b5c57',
    line: '#e1d2cc',
    accent: '#b63925',
    accentStrong: '#ba311c',
    accentInk: '#ffffff',
    positive: '#217347',
    warn: '#885c11',
    danger: '#a52b27',
    viz1: '#2986ae',
    viz2: '#ab8221',
    vizGrid: '#e5d8d2',
  },
  dark: {
    bg: '#231915',
    surface: '#2d201b',
    sunken: '#2a1e19',
    ink: '#e4dfdd',
    inkSoft: '#baafab',
    line: '#50392f',
    accent: '#dc6856',
    accentStrong: '#e4624e',
    accentInk: '#281815',
    positive: '#4dcb88',
    warn: '#eab253',
    danger: '#da6662',
    viz1: '#5ab2d8',
    viz2: '#e0b85c',
    vizGrid: '#4a352b',
  },
};

const ICE: Theme = {
  id: 'ice',
  name: 'Ice',
  blurb: 'Cold blue, first light on a glacier.',
  light: {
    bg: '#f3f5f7',
    surface: '#fcfdfd',
    sunken: '#e6ebef',
    ink: '#24292e',
    inkSoft: '#57616b',
    line: '#d3dde3',
    accent: '#167188',
    accentStrong: '#138fae',
    accentInk: '#ffffff',
    positive: '#22774a',
    warn: '#8d5f11',
    danger: '#a52b27',
    viz1: '#2962ae',
    viz2: '#ab8b21',
    vizGrid: '#dae2e7',
  },
  dark: {
    bg: '#161d22',
    surface: '#1c252b',
    sunken: '#1a2228',
    ink: '#dde0e4',
    inkSoft: '#abb3ba',
    line: '#32424e',
    accent: '#3abedf',
    accentStrong: '#47caeb',
    accentInk: '#152428',
    positive: '#4dcb88',
    warn: '#eab253',
    danger: '#db6a66',
    viz1: '#5a91d8',
    viz2: '#e0c15c',
    vizGrid: '#2e3d48',
  },
};

const CONTRAST: Theme = {
  id: 'contrast',
  name: 'High Contrast',
  blurb: 'Maximum legibility, for reading in the sun or with low vision.',
  light: {
    bg: '#ffffff',
    surface: '#ffffff',
    sunken: '#f5f5f5',
    ink: '#2e2424',
    inkSoft: '#6b5757',
    line: '#e7e4e4',
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

const MIDNIGHT: Theme = {
  id: 'midnight',
  name: 'Midnight',
  blurb: 'True black. On an OLED screen it is a battery setting as much as a look.',
  light: {
    bg: '#f7f7f8',
    surface: '#ffffff',
    sunken: '#ebedef',
    ink: '#24272e',
    inkSoft: '#575e6b',
    line: '#dbdde1',
    accent: '#1d719a',
    accentStrong: '#1a86bc',
    accentInk: '#ffffff',
    positive: '#22774a',
    warn: '#8d5f11',
    danger: '#a52b27',
    viz1: '#2974ae',
    viz2: '#ab9021',
    vizGrid: '#e0e2e6',
  },
  dark: {
    bg: '#050506',
    surface: '#101113',
    sunken: '#090a0b',
    ink: '#dddfe4',
    inkSoft: '#abb0ba',
    line: '#25272d',
    accent: '#3ea6da',
    accentStrong: '#4bb3e7',
    accentInk: '#152228',
    positive: '#4dcb88',
    warn: '#eab253',
    danger: '#da6662',
    viz1: '#5aa1d8',
    viz2: '#e0c65c',
    vizGrid: '#22252a',
  },
};

export const THEMES: Theme[] = [
  ALPINE,
  SLATE,
  SANDSTONE,
  LIMESTONE,
  GRITSTONE,
  VOLCANIC,
  DESERT,
  ICE,
  CONTRAST,
  MIDNIGHT,
];

export const DEFAULT_THEME_ID = ALPINE.id;

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? ALPINE;
}

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
