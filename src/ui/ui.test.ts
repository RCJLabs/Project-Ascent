import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The design system, enforced at the source rather than by review.
 *
 * M13 exists because there were 95 bare `<button>` elements against 20
 * files importing `Button`, 76 raw form controls, the same input class
 * string copied into ten files and the selected-chip pattern written out
 * thirty times across sixteen. Every one of those was a chance to forget a
 * focus ring, a hit target, an accessible name or a pressed state — and
 * reviewing for it by eye is exactly what let it reach ninety-five.
 *
 * So these are the milestone's "done when", executable. They will also stop
 * it coming back, which is the part a one-off cleanup never does.
 */

const UI = 'src/ui';
const FEATURES = 'src/features';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const componentFiles = (dir: string): { path: string; source: string }[] =>
  walk(dir)
    .filter((p) => p.endsWith('.tsx') && !p.endsWith('.test.tsx'))
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

const FEATURE_FILES = componentFiles(FEATURES);
const UI_FILES = componentFiles(UI);

/** Occurrences of `needle`, as `path:line` for a readable failure. */
function findAll(
  files: { path: string; source: string }[],
  test: (line: string) => boolean,
): string[] {
  return files.flatMap(({ path, source }) =>
    source
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => test(line))
      .map(({ line, n }) => `${path}:${n} ${line.trim().slice(0, 70)}`),
  );
}

describe('feature files use the primitives', () => {
  it('styles no bare buttons', () => {
    // `ui/` owns the element; features compose Button, IconButton or Chip.
    expect(findAll(FEATURE_FILES, (l) => l.includes('<button'))).toEqual([]);
  });

  it('styles no bare form controls', () => {
    expect(
      findAll(FEATURE_FILES, (l) => /<(input|select|textarea)(\s|\/|>|$)/.test(l)),
    ).toEqual([]);
  });

  it('does not re-declare the control class string', () => {
    expect(findAll(FEATURE_FILES, (l) => l.includes('bg-sunken border border-line rounded'))).toEqual(
      [],
    );
  });

  it('does not hand-roll the selected-chip state', () => {
    expect(findAll(FEATURE_FILES, (l) => l.includes('border-accent bg-accent/10'))).toEqual([]);
  });

  it('does not hand-roll a progress bar', () => {
    expect(
      findAll(FEATURE_FILES, (l) => /rounded-full bg-sunken overflow-hidden/.test(l)),
    ).toEqual([]);
  });
});

describe('the primitives are safe to use', () => {
  it('gives every interactive element in ui/ a focus ring', () => {
    const offences: string[] = [];
    for (const { path, source } of UI_FILES) {
      // Count the elements that take focus against the rings declared.
      const interactive = (source.match(/<(button|input|select|textarea)(\s|\/|>)/g) ?? []).length;
      if (interactive === 0) continue;
      const rings = (source.match(/focus-ring/g) ?? []).length;
      if (rings === 0) offences.push(`${path}: ${interactive} focusable, no focus-ring`);
    }
    expect(offences).toEqual([]);
  });

  it('defines the focus ring once, in CSS, on :focus-visible only', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toContain('.focus-ring:focus-visible');
    // :focus would leave a ring after a mouse click, which reads as a bug
    // and trains people to dislike focus rings.
    expect(css).not.toMatch(/\.focus-ring:focus\s*\{/);
  });

  it('keeps every button size at or above the 24px WCAG target floor', () => {
    const button = readFileSync('src/ui/Button.tsx', 'utf8');
    const heights = [...button.matchAll(/min-h-(\d+)/g)].map((m) => Number(m[1]));
    expect(heights.length).toBeGreaterThanOrEqual(3);
    // Tailwind's scale is quarter-rem: min-h-9 is 36px, min-h-11 is 44px.
    for (const h of heights) expect(h * 4).toBeGreaterThanOrEqual(24);
  });

  it('requires an accessible name on an icon button', () => {
    const source = readFileSync('src/ui/IconButton.tsx', 'utf8');
    // `label: string`, not `label?: string` — a screen reader cannot infer
    // one from an SVG.
    expect(source).toMatch(/\blabel: string/);
    expect(source).not.toMatch(/\blabel\?: string/);
  });

  it('makes a chip announce whether it is on', () => {
    const source = readFileSync('src/ui/Chip.tsx', 'utf8');
    expect((source.match(/aria-pressed/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('makes a meter readable without seeing it', () => {
    const source = readFileSync('src/ui/Meter.tsx', 'utf8');
    for (const attribute of ['role="progressbar"', 'aria-valuenow', 'aria-valuetext', 'aria-label']) {
      expect(source).toContain(attribute);
    }
  });
});
