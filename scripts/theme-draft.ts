/**
 * Draft a palette that passes, from a description of what it should feel
 * like (PLAN.md M61).
 *
 * Twenty-six colours per theme, each of which has to clear a contrast rule
 * against three surfaces, is not a thing to guess at — the app already
 * shipped an accent at 4.31:1 for months by guessing. The judgement in a
 * theme is its *character*: which hues, how warm, how dark. The arithmetic
 * is arithmetic, so this does the arithmetic.
 *
 * Give it hues and a mood; it solves each foreground's lightness until the
 * rule clears with a margin, and prints the literal to paste into themes.ts.
 *
 * Run: vite-node scripts/theme-draft.ts
 */
import { contrast, CVD, distance, rgb } from '@/ui/contrast';
import { STATUS } from '@/ui/themes';

type Hsl = [number, number, number];

function hex([h, s, lightness]: Hsl): string {
  // Clamped, because the solvers walk lightness past both ends and a value
  // over 100 produced a three-character channel and a nonsense colour —
  // which the contrast maths then happily measured.
  const l = Math.max(0, Math.min(100, lightness));
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * Math.max(0, Math.min(1, c)))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Walk lightness until the pair clears its rule, from the end that suits the
 * mode: a light theme darkens its text, a dark one lightens it.
 */
function solve(hsl: Hsl, against: string[], need: number, dark: boolean): string {
  let [h, s, l] = hsl;
  for (let i = 0; i < 200; i += 1) {
    const candidate = hex([h, s, l]);
    if (against.every((bg) => contrast(candidate, bg) >= need)) return candidate;
    l += dark ? 1 : -1;
    if (l > 99 || l < 1) break;
  }
  return hex([h, s, Math.max(1, Math.min(99, l))]);
}

/** A line has to be seen and must not read as a border of a card. */
function solveLine(hsl: Hsl, surface: string, dark: boolean): string {
  let [h, s, l] = hsl;
  for (let i = 0; i < 200; i += 1) {
    const candidate = hex([h, s, l]);
    const ratio = contrast(candidate, surface);
    if (ratio >= 1.2 && ratio < 2.6) return candidate;
    l += ratio < 1.2 ? (dark ? 1 : -1) : dark ? -1 : 1;
    if (l > 99 || l < 1) break;
  }
  return hex([h, s, l]);
}

export interface Spec {
  id: string;
  name: string;
  blurb: string;
  /** Hue and saturation of the page itself. */
  ground: [number, number];
  /** How dark the light mode's page is, and how light the dark mode's is. */
  lightness: { light: number; dark: number };
  /** The accent's hue and saturation. */
  accent: [number, number];
  /** Chart hues. Kept far apart in blue/yellow, which survives every CVD. */
  viz: [number, number];
  /**
   * Where the two series sit in lightness, when hue alone is not enough.
   *
   * On a near-white ground both series get darkened to reach 3:1 and
   * converge — which is exactly what happened to the high-contrast theme,
   * whose two series ended 25 apart under simulation against a floor of 40.
   * Separating them by lightness as well as hue is what fixes it, and it is
   * also the thing that helps a reader who sees no hue at all.
   */
  vizLightness?: { light: [number, number]; dark: [number, number] };
  /** Warmth of the text, as a hue. */
  ink: number;
}

function palette(spec: Spec, mode: 'light' | 'dark'): Record<string, string> {
  const dark = mode === 'dark';
  const [gh, gs] = spec.ground;
  const base = dark ? spec.lightness.dark : spec.lightness.light;

  const bg = hex([gh, gs, base]);
  /**
   * The surface is solved, not chosen.
   *
   * `STATUS` is shared by every theme on purpose — a climber who changes
   * theme should not have to relearn what danger looks like — so a theme
   * cannot tune the ramp to fit its surface and has to fit the ramp instead.
   * Six of the first seven drafts failed on `good` alone, between 4.05 and
   * 4.43 against a floor of 4.5, purely because their card was a shade too
   * close to it. This walks the card away until every step of the ramp
   * clears.
   */
  const ramp = Object.values(STATUS[mode]);
  let lift = dark ? 5 : 3;
  let surface = hex([gh, Math.max(0, gs - 1), base + lift]);
  for (let i = 0; i < 40; i += 1) {
    if (ramp.every((step) => contrast(step, surface) >= 4.6)) break;
    lift += dark ? -1 : 1;
    surface = hex([gh, Math.max(0, gs - 1), base + lift]);
  }
  const sunken = hex([gh, gs, dark ? base + 2 : base - 4]);
  const surfaces = [bg, surface, sunken];

  const [ah, as] = spec.accent;
  const accent = solve([ah, as, dark ? 55 : 45], surfaces, 4.5, dark);
  const accentStrong = solve([ah, Math.min(100, as + 8), dark ? 60 : 42], surfaces, 3, dark);
  const accentInk = contrast('#ffffff', accent) >= 4.5 ? '#ffffff' : solve([ah, 30, 12], [accent], 4.5, false);

  return {
    bg,
    surface,
    sunken,
    ink: solve([spec.ink, 12, dark ? 88 : 16], surfaces, 4.5, dark),
    inkSoft: solve([spec.ink, 10, dark ? 70 : 38], surfaces, 4.5, dark),
    line: solveLine([gh, Math.max(4, gs), dark ? base + 14 : base - 10], surface, dark),
    accent,
    accentStrong,
    accentInk,
    positive: solve([148, 55, dark ? 55 : 34], surfaces, 4.5, dark),
    warn: solve([38, 78, dark ? 62 : 34], surfaces, 4.5, dark),
    danger: solve([2, 62, dark ? 62 : 40], surfaces, 4.5, dark),
    viz1: solve([spec.viz[0], 62, (spec.vizLightness?.[mode] ?? (dark ? [60, 62] : [42, 40]))[0]], [surface], 3, dark),
    viz2: solve([spec.viz[1], 68, (spec.vizLightness?.[mode] ?? (dark ? [60, 62] : [42, 40]))[1]], [surface], 3, dark),
    vizGrid: solveLine([gh, Math.max(4, gs), dark ? base + 12 : base - 8], surface, dark),
  };
}

export function draft(spec: Spec): string {
  const body = (mode: 'light' | 'dark') => {
    const p = palette(spec, mode);
    const lines = Object.entries(p).map(([k, v]) => `    ${k}: '${v}',`);
    return `  ${mode}: {\n${lines.join('\n')}\n  },`;
  };
  return `const ${spec.id.toUpperCase().replace(/-/g, '_')}: Theme = {
  id: '${spec.id}',
  name: '${spec.name}',
  blurb: '${spec.blurb}',
${body('light')}
${body('dark')}
};`;
}

/** How far apart the two chart series stay under simulated colour blindness. */
export function vizGap(spec: Spec, mode: 'light' | 'dark'): number {
  const p = palette(spec, mode);
  return Math.min(
    ...Object.values(CVD).map((sim) => distance(sim(rgb(p['viz1']!)), sim(rgb(p['viz2']!)))),
  );
}

export const SPECS: Spec[] = [
  { id: 'limestone', name: 'Limestone', blurb: 'Pale grey-buff, the colour of a sunny crag.', ground: [40, 18], lightness: { light: 95, dark: 12 }, accent: [205, 70], viz: [212, 44], ink: 35 },
  { id: 'gritstone', name: 'Gritstone', blurb: 'Dark, coarse and warm — northern rock.', ground: [24, 12], lightness: { light: 93, dark: 10 }, accent: [18, 68], viz: [206, 40], ink: 22 },
  { id: 'volcanic', name: 'Volcanic', blurb: 'Black rock with an ember in it.', ground: [260, 8], lightness: { light: 94, dark: 8 }, accent: [12, 78], viz: [200, 46], ink: 265 },
  { id: 'desert', name: 'Desert', blurb: 'Red rock and a hard blue sky.', ground: [18, 26], lightness: { light: 94, dark: 11 }, accent: [8, 66], viz: [198, 42], ink: 15 },
  { id: 'ice', name: 'Ice', blurb: 'Cold blue, first light on a glacier.', ground: [205, 22], lightness: { light: 96, dark: 11 }, accent: [192, 72], viz: [214, 46], ink: 210 },
  { id: 'contrast', name: 'High Contrast', blurb: 'Maximum legibility, for reading in the sun or with low vision.', ground: [0, 0], lightness: { light: 100, dark: 4 }, accent: [214, 90], viz: [222, 32], ink: 0, vizLightness: { light: [26, 46], dark: [58, 76] } },
  { id: 'midnight', name: 'Midnight', blurb: 'True black. On an OLED screen it is a battery setting as much as a look.', ground: [220, 10], lightness: { light: 97, dark: 2 }, accent: [200, 68], viz: [206, 48], ink: 218 },
];

for (const spec of SPECS) {
  console.log(draft(spec));
  console.log(`// viz gap: light ${vizGap(spec, 'light').toFixed(0)}, dark ${vizGap(spec, 'dark').toFixed(0)}\n`);
}
