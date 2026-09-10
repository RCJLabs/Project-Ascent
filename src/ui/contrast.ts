/**
 * Colour maths, in one place (PLAN.md M61).
 *
 * These lived inside `themes.test.ts`, which was fine while the only
 * question was "does the palette pass". Authoring a *new* theme is a
 * different job: it needs the same numbers before the test runs, and by how
 * much each pair fails rather than only that it does. A second copy of a
 * contrast formula is how the report and the check start disagreeing, so
 * there is one copy and both read it.
 */

export type Rgb = [number, number, number];

export function rgb(hex: string): Rgb {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
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
export const CVD: Record<string, (c: Rgb) => Rgb> = {
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
export function distance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}
