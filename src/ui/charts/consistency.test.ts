import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * M23's "done when": the last twelve months fit one screen, and a gap is
 * visible without counting.
 *
 * The maths is tested in `engine/consistency.test.ts` and the colour ramp
 * under three colour-blindness simulations in `ui/themes.test.ts`. These are
 * the decisions in the drawing that a cleanup could quietly undo.
 */

const SRC = readFileSync('src/ui/charts/ConsistencyGrid.tsx', 'utf8');

describe('a year fits one screen', () => {
  it('does not scroll sideways to fit', () => {
    // Scrolling would be the easy way out and would lose the whole point:
    // the shape of a year is only readable when you can see all of it.
    expect(SRC).not.toContain('overflow-x');
  });

  it('scales the squares rather than fixing their size', () => {
    expect(SRC).toContain('viewBox');
    expect(SRC).toContain('w-full h-auto');
  });
});

describe('the labels stay readable', () => {
  it('draws no text inside the scaled SVG', () => {
    // The first version did, and the SVG scales with the card: at 320px the
    // month names were a 2.5px smear, which is worse than no labels.
    const svg = SRC.slice(SRC.indexOf('<svg'), SRC.indexOf('</svg>'));
    expect(svg).not.toContain('<text');
  });

  it('sizes them in rem, so the text-size setting still moves them', () => {
    expect(SRC).toContain('text-2xs');
    expect(SRC).not.toMatch(/fontSize:\s*\d/);
  });
});

describe('the grid is a picture, not a control', () => {
  it('puts no handler on a cell', () => {
    // Fifty-three columns in a 288px card is a 3.9px cell — measured — and
    // WCAG 2.5.8 asks 24px of any target. A row of 4px buttons is worse than
    // no buttons.
    const svg = SRC.slice(SRC.indexOf('<svg'), SRC.indexOf('</svg>'));
    expect(svg).not.toContain('onClick');
    expect(svg).not.toContain('<button');
  });

  it('still offers a way to reach a day', () => {
    expect(SRC).toContain('href="/calendar"');
  });
});

describe('what a screen reader gets', () => {
  it('is a table, not a description of squares', () => {
    expect(SRC).toContain('role="img"');
    expect(SRC).toContain('<caption>');
  });

  it('lists the logged days only', () => {
    // 371 rows of "nothing logged" is not an alternative, it is a
    // denial-of-service on a screen reader.
    expect(SRC).toContain('.filter((d) => d.sessions > 0)');
  });

  it('wraps the table rather than hiding the table element', () => {
    // A table treats a specified width as a minimum and expands anyway, so
    // `sr-only` on the table itself pushes the page sideways (M14).
    expect(SRC).toMatch(/<div className="sr-only">\s*<table>/);
  });
});

describe('the shades come from one place', () => {
  it('reads the generated ramp rather than picking colours', () => {
    expect(SRC).toContain('var(--heat-');
    // No literal colours in the chart: the ramp is generated from the
    // palette in themes.ts and tested there.
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it('draws a rest day differently from an untouched one', () => {
    expect(SRC).toContain('day.rested');
    expect(SRC).toContain('day.sessions === 0');
  });
});
