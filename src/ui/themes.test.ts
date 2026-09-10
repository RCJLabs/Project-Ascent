import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CSS_VAR,
  HEAT_STOPS,
  STATUS,
  STATUS_VAR,
  DEFAULT_THEME_ID,
  FOREGROUNDS,
  SURFACES,
  THEMES,
  heatRamp,
  getTheme,
  type Palette,
} from './themes';
import { CVD, contrast, distance, luminance, rgb } from './contrast';
import { checkTheme, failed } from './paletteRules';
import type { Theme } from './themes';

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

describe('the themes on offer', () => {
  // `getTheme` falls back to Alpine for an id it does not know, so renaming
  // one silently resets every climber who had chosen it — with no error and
  // nothing in the log. The list is pinned for that reason.
  it('keeps every id that has ever shipped', () => {
    const ids = THEMES.map((t) => t.id);
    for (const id of [
      'alpine',
      'slate',
      'sandstone',
      'limestone',
      'gritstone',
      'volcanic',
      'desert',
      'ice',
      'contrast',
      'midnight',
    ]) {
      expect(ids, `${id} has gone missing`).toContain(id);
    }
  });

  // The tool an author tunes a palette with has to be trustworthy, and its
  // own failure mode is silence: a comparison written the wrong way round
  // reports "0 failing" for a palette that fails everything.
  it('has a report that actually reports', () => {
    const broken: Theme = {
      id: 'broken',
      name: 'Broken',
      blurb: 'Deliberately unreadable.',
      light: { ...THEMES[0]!.light, ink: '#f4f4f4', accent: '#f0f0f0' },
      dark: THEMES[0]!.dark,
    };
    const bad = checkTheme(broken).filter(failed);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.map((c) => c.rule).join(' ')).toMatch(/ink on/);
  });

  it('agrees with this suite about what passes', () => {
    for (const theme of THEMES) {
      expect(checkTheme(theme).filter(failed), theme.id).toEqual([]);
    }
  });

  it('has one implementation of the contrast maths, not two', () => {
    // The report tool and this suite have to agree about what passes, and
    // two copies of a luminance formula is how they stop agreeing.
    const source = readFileSync('src/ui/themes.test.ts', 'utf8');
    expect(source).not.toMatch(/function (contrast|luminance)\(/);
    // The report reads the shared rules, which read the shared maths.
    expect(readFileSync('scripts/theme-report.ts', 'utf8')).toContain("from '@/ui/paletteRules'");
    expect(readFileSync('src/ui/paletteRules.ts', 'utf8')).toContain("from './contrast'");
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

  it('carries the consistency ramp for both modes', () => {
    // Without these the very first paint has no `--heat-*` at all, and an
    // SVG `fill: var(--heat-3)` that resolves to nothing is not transparent
    // — it is black. The whole grid rendered as a solid block until this
    // was generated rather than only set by applyPalette.
    const root = block(':root {');
    heatRamp(alpine.light).forEach((color, i) => {
      expect(root, `--heat-${i + 1} in :root`).toContain(`--heat-${i + 1}: ${color}`);
    });
    for (const start of ["[data-theme='dark'] {", ":root:not([data-theme='light']) {"]) {
      const chunk = css.slice(css.indexOf(start), css.indexOf(start) + 1400);
      heatRamp(alpine.dark).forEach((color, i) => {
        expect(chunk, `--heat-${i + 1} in ${start}`).toContain(`--heat-${i + 1}: ${color}`);
      });
    }
  });

  it('is generated rather than hand-kept', () => {
    // scripts/gen-theme-css.mjs writes these blocks from themes.ts; the
    // tests above are what make the duplicate safe.
    expect(readFileSync('scripts/gen-theme-css.mjs', 'utf8')).toContain('src/ui/themes.ts');
  });
});

describe('the consistency ramp reads as a scale', () => {
  /** The empty cell, then the five steps: rested, then loads 1–4. */
  const steps = (palette: Palette) => [palette.sunken, ...heatRamp(palette)];

  it('has a step for a rested day as well as the four loads', () => {
    expect(HEAT_STOPS).toHaveLength(5);
    each((theme, mode, palette) => {
      expect(steps(palette), `${theme.id}/${mode}`).toHaveLength(6);
    });
  });

  it('gets lighter or darker in one direction, never back on itself', () => {
    // A grid is read by comparing hundreds of four-pixel squares at a
    // glance. If step 3 is lighter than step 2 the scale means nothing.
    each((theme, mode, palette) => {
      const lums = steps(palette).map((c) => luminance(rgb(c)));
      const rising = lums.every((l, i) => i === 0 || l >= lums[i - 1]!);
      const falling = lums.every((l, i) => i === 0 || l <= lums[i - 1]!);
      expect(rising || falling, `${theme.id}/${mode} ramp is not monotonic`).toBe(true);
    });
  });

  it('separates every neighbouring step, colour-blind or not', () => {
    // One hue mixed toward the empty colour, so lightness carries the whole
    // scale — which is the point: a ramp that needs hue discrimination is
    // unreadable to roughly one man in twelve.
    each((theme, mode, palette) => {
      const ramp = steps(palette);
      for (const [kind, simulate] of Object.entries(CVD)) {
        for (let i = 1; i < ramp.length; i++) {
          const gap = distance(simulate(rgb(ramp[i - 1]!)), simulate(rgb(ramp[i]!)));
          expect(gap, `${theme.id}/${mode} ${kind}: step ${i - 1}→${i}`).toBeGreaterThan(6);
        }
      }
    });
  });

  it('tells a rested day from an untouched one', () => {
    // The pair most at risk, because it is the smallest step in the ramp and
    // the two facts are opposites.
    each((theme, mode, palette) => {
      const [empty, rested] = steps(palette) as [string, string];
      for (const [kind, simulate] of Object.entries(CVD)) {
        const gap = distance(simulate(rgb(empty)), simulate(rgb(rested)));
        expect(gap, `${theme.id}/${mode} ${kind}`).toBeGreaterThan(6);
      }
    });
  });

  it('makes the busiest day clearly different from an empty one', () => {
    each((theme, mode, palette) => {
      const ramp = steps(palette);
      const gap = distance(rgb(ramp[0]!), rgb(ramp[ramp.length - 1]!));
      expect(gap, `${theme.id}/${mode}`).toBeGreaterThan(60);
    });
  });
});
