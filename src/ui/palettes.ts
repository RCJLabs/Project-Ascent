/**
 * The palettes a climber can choose, beyond the two the first load carries
 * (PLAN.md M363).
 *
 * `themes.ts` holds Alpine, which `index.css` paints before any JavaScript
 * runs, and High Contrast, which the system can ask for on any launch. These
 * eight are only ever needed by a climber who picked one, and by the sheet
 * they are picked from, so they are a chunk of their own: 1.6KB of the first
 * load in a trial build, for colours nine climbers in ten never see.
 *
 * A climber who did pick one is painted from a snapshot of it on the very
 * first frame (`store/settings.ts`), and this module replaces the snapshot
 * when it arrives, so the colours on screen are always these in the end.
 */

import { ALPINE, CONTRAST, type Theme } from './themes';

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
    bg: '#f4f4f4',
    surface: '#ffffff',
    sunken: '#e9e9e9',
    ink: '#000000',
    inkSoft: '#3d4854',
    line: '#d9d9d9',
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
    bg: '#faf1e2',
    surface: '#fffbf2',
    sunken: '#f2e8d5',
    ink: '#2a211a',
    inkSoft: '#665c52',
    line: '#e6d8bd',
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
    bg: '#f2efe6',
    surface: '#fdfcf7',
    sunken: '#ece8dd',
    ink: '#2e2a24',
    inkSoft: '#6b6357',
    line: '#dcd5c3',
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
    bg: '#ebe7e3',
    surface: '#fcfaf8',
    sunken: '#e7e2de',
    ink: '#2e2724',
    inkSoft: '#6b5e57',
    line: '#d3ccc5',
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
    bg: '#edeaf4',
    surface: '#fcfaff',
    sunken: '#e5e1ef',
    ink: '#28242e',
    inkSoft: '#5f576b',
    line: '#d2cde1',
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
    bg: '#f9eae1',
    surface: '#fffaf5',
    sunken: '#efe0d2',
    ink: '#2e2624',
    inkSoft: '#6b5c57',
    line: '#e3cab6',
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
    bg: '#e3f2f7',
    surface: '#f8fdff',
    sunken: '#dcedf3',
    ink: '#24292e',
    inkSoft: '#57616b',
    line: '#c2e0ea',
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

const MIDNIGHT: Theme = {
  id: 'midnight',
  name: 'Midnight',
  blurb: 'True black. On an OLED screen it is a battery setting as much as a look.',
  light: {
    bg: '#e9e9fa',
    surface: '#fcfbff',
    sunken: '#ebeaf7',
    ink: '#24272e',
    inkSoft: '#575e6b',
    line: '#d2d1ea',
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

/** A palette by id, or Alpine for one this version does not have. */
export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? ALPINE;
}
