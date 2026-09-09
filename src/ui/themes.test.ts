import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CSS_VAR,
  STATUS,
  STATUS_VAR,
  DEFAULT_THEME_ID,
  FOREGROUNDS,
  SURFACES,
  THEMES,
  getTheme,
  type Palette,
} from './themes';

/**
 * The check the comment in index.css claimed existed.
 *
 * It said the palette was "validated for colour-vision deficiency against
 * the chart surface (validate_palette.js, all checks pass in both modes)".
 * There was no such script. Three colours were failing WCAG AA in light mode
 * the entire time — the accent at 4.31:1 while being used as text, warn at
 * 3.82:1 on every injury flag, and positive at 3.74:1 on sunken.
 *
 * This is that check, for real, over every theme and both modes.
 */

// ── Colour maths ──────────────────────────────────────────────────────────

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Brettel-style simulation of the three common kinds of colour blindness,
 * via the standard LMS transform.
 *
 * Approximate — a simulation is not an experience — but it is enough to
 * catch the actual failure mode, which is two chart series that are only
 * distinguishable by a red/green difference.
 */
const CVD: Record<string, (c: Rgb) => Rgb> = {
  protanopia: ([r, g, b]) => [
    0.567 * r + 0.433 * g,
    0.558 * r + 0.442 * g,
    0.242 * g + 0.758 * b,
  ],
  deuteranopia: ([r, g, b]) => [
    0.625 * r + 0.375 * g,
    0.7 * r + 0.3 * g,
    0.3 * g + 0.7 * b,
  ],
  tritanopia: ([r, g, b]) => [
    0.95 * r + 0.05 * g,
    0.433 * g + 0.567 * b,
    0.475 * g + 0.525 * b,
  ],
};

/** Perceptual-ish distance, good enough to say "these two look the same". */
function distance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

const MODES = ['light', 'dark'] as const;
const each = (fn: (theme: (typeof THEMES)[number], mode: 'light' | 'dark', palette: Palette) => void) => {
  for (const theme of THEMES) for (const mode of MODES) fn(theme, mode, theme[mode]);
};

// ── The checks ────────────────────────────────────────────────────────────

describe('every theme is complete', () => {
  it('defines every key in both modes', () => {
    const keys = Object.keys(CSS_VAR) as (keyof Palette)[];
    each((theme, mode, palette) => {
      for (const key of keys) {
        expect(palette[key], `${theme.id}/${mode} missing ${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    });
  });

  it('has a unique id, a name and a blurb', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const theme of THEMES) {
      expect(theme.name).toBeTruthy();
      expect(theme.blurb).toBeTruthy();
    }
    expect(getTheme(DEFAULT_THEME_ID).id).toBe(DEFAULT_THEME_ID);
    expect(getTheme('nonsense').id).toBe(DEFAULT_THEME_ID);
  });
});

describe('text contrast clears WCAG AA', () => {
  it('for every foreground on every surface it is painted on', () => {
    const failures: string[] = [];
    each((theme, mode, palette) => {
      for (const fg of FOREGROUNDS) {
        for (const surface of SURFACES) {
          const ratio = contrast(palette[fg], palette[surface]);
          if (ratio < 4.5) {
            failures.push(`${theme.id}/${mode}: ${fg} on ${surface} is ${ratio.toFixed(2)}:1`);
          }
        }
      }
    });
    expect(failures).toEqual([]);
  });

  it('for the label on a primary button', () => {
    const failures: string[] = [];
    each((theme, mode, palette) => {
      const ratio = contrast(palette.accentInk, palette.accent);
      if (ratio < 4.5) failures.push(`${theme.id}/${mode}: accentInk on accent is ${ratio.toFixed(2)}:1`);
    });
    expect(failures).toEqual([]);
  });

  it('for the focus ring, which needs 3:1 as a non-text indicator', () => {
    const failures: string[] = [];
    each((theme, mode, palette) => {
      for (const surface of SURFACES) {
        const ratio = contrast(palette.accentStrong, palette[surface]);
        if (ratio < 3) failures.push(`${theme.id}/${mode}: ring on ${surface} is ${ratio.toFixed(2)}:1`);
      }
    });
    expect(failures).toEqual([]);
  });

  it('for a border, which needs 3:1 to be a boundary rather than a hint', () => {
    // `line` is deliberately allowed to be quieter than 3:1 — it separates
    // cards that already differ in fill, and is not the only cue for
    // anything. Asserted so the exception is a decision, not an oversight.
    const failures: string[] = [];
    each((theme, mode, palette) => {
      if (contrast(palette.line, palette.surface) >= 3) {
        failures.push(`${theme.id}/${mode}: line is unexpectedly strong`);
      }
    });
    expect(failures).toEqual([]);
  });
});

describe('charts survive colour blindness', () => {
  it('keeps the two series apart under every simulation', () => {
    const failures: string[] = [];
    each((theme, mode, palette) => {
      for (const [kind, simulate] of Object.entries(CVD)) {
        const gap = distance(simulate(rgb(palette.viz1)), simulate(rgb(palette.viz2)));
        // 60 is roughly "obviously different at a glance" on this scale.
        if (gap < 60) {
          failures.push(`${theme.id}/${mode}: viz1 vs viz2 under ${kind} is ${gap.toFixed(0)}`);
        }
      }
    });
    expect(failures).toEqual([]);
  });

  it('keeps every series readable against the chart surface', () => {
    const failures: string[] = [];
    each((theme, mode, palette) => {
      for (const key of ['viz1', 'viz2'] as const) {
        // 3:1 — these are shapes, not text.
        const ratio = contrast(palette[key], palette.surface);
        if (ratio < 3) failures.push(`${theme.id}/${mode}: ${key} on surface is ${ratio.toFixed(2)}:1`);
      }
    });
    expect(failures).toEqual([]);
  });

  it('orders severity by prominence, not only by hue', () => {
    // The original ramp put `serious` and `critical` a distance of 2 apart
    // under simulated deuteranopia — identical. Ordering by lightness as
    // well as hue is what makes it degrade rather than collapse.
    for (const mode of MODES) {
      const ramp = [STATUS[mode].good, STATUS[mode].warning, STATUS[mode].serious, STATUS[mode].critical];
      const lums = ramp.map((c) => luminance(rgb(c)));
      const ascending = lums.every((l, i) => i === 0 || l > (lums[i - 1] ?? 0));
      const descending = lums.every((l, i) => i === 0 || l < (lums[i - 1] ?? 1));
      expect(ascending || descending, `${mode}: severity ramp wanders`).toBe(true);
    }
  });

  it('keeps the severity ramp as separable as four hues can be', () => {
    // 14 is what this design achieves, not a target: four levels cannot be
    // told apart by colour alone, which is why every use pairs them with an
    // icon and a word (asserted below).
    const failures: string[] = [];
    for (const mode of MODES) {
      const ramp = [STATUS[mode].good, STATUS[mode].warning, STATUS[mode].serious, STATUS[mode].critical];
      for (const [kind, simulate] of Object.entries(CVD)) {
        for (let i = 0; i < ramp.length; i += 1) {
          for (let j = i + 1; j < ramp.length; j += 1) {
            const gap = distance(simulate(rgb(ramp[i] as string)), simulate(rgb(ramp[j] as string)));
            if (gap < 14) failures.push(`${mode}: ${i} vs ${j} under ${kind} is ${gap.toFixed(0)}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('stays legible on every surface any theme paints it on', () => {
    // Graphics rather than text, so 3:1 is the bar.
    const failures: string[] = [];
    each((theme, mode, palette) => {
      for (const [name, colour] of Object.entries(STATUS[mode])) {
        for (const surface of SURFACES) {
          const ratio = contrast(colour, palette[surface]);
          if (ratio < 3) failures.push(`${theme.id}/${mode}: ${name} on ${surface} is ${ratio.toFixed(2)}:1`);
        }
      }
    });
    expect(failures).toEqual([]);
  });

  it('never leaves colour as the only cue', () => {
    // WCAG 1.4.1, and the reason the ramp does not have to be perfect: the
    // training-state card and the board both pair a status with an icon.
    const training = readFileSync('src/features/progress/TrainingState.tsx', 'utf8');
    expect(training).toMatch(/Icon:/);
    expect(training).toMatch(/headline/);
  });
});

describe('the CSS default matches the data', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const alpine = getTheme('alpine');

  /** Read a custom property out of a named block of index.css. */
  const block = (start: string): string => {
    const from = css.indexOf(start);
    expect(from, `index.css has no ${start} block`).toBeGreaterThan(-1);
    return css.slice(from, css.indexOf('}', from));
  };

  it('carries Alpine light for the first frame', () => {
    // index.css exists so the very first paint is right before any script
    // runs; it is a duplicate, and this is the only honest way to keep one.
    const root = block(':root {');
    for (const [key, variable] of Object.entries(CSS_VAR)) {
      expect(root, `${variable} in :root`).toContain(`${variable}: ${alpine.light[key as keyof Palette]}`);
    }
  });

  it('carries Alpine dark for both the attribute and the media query', () => {
    for (const start of ["[data-theme='dark'] {", ":root:not([data-theme='light']) {"]) {
      const from = css.indexOf(start);
      expect(from, `index.css has no ${start}`).toBeGreaterThan(-1);
      const chunk = css.slice(from, from + 1400);
      for (const [key, variable] of Object.entries(CSS_VAR)) {
        expect(chunk, `${variable} in ${start}`).toContain(`${variable}: ${alpine.dark[key as keyof Palette]}`);
      }
    }
  });

  it('carries the status ramp for both modes', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    for (const [key, variable] of Object.entries(STATUS_VAR)) {
      expect(root).toContain(`${variable}: ${STATUS.light[key as keyof (typeof STATUS)['light']]}`);
    }
  });

  it('is generated rather than hand-kept', () => {
    // scripts/gen-theme-css.mjs writes these blocks from themes.ts; the
    // tests above are what make the duplicate safe.
    expect(readFileSync('scripts/gen-theme-css.mjs', 'utf8')).toContain('src/ui/themes.ts');
  });
});
