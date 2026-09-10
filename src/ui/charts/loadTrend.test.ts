import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * M25's "done when": the number turns into a trajectory.
 *
 * The maths is tested in `engine/loadTrend.test.ts` and the sliding window
 * it rides on in `engine/zone.test.ts`. These are the drawing decisions.
 */

const SRC = readFileSync('src/ui/charts/LoadTrendLine.tsx', 'utf8');

describe('the bands are the chart', () => {
  it('draws them as regions, not threshold lines', () => {
    // A band is a place to be; a line is a thing to cross. The first is
    // what the model actually means.
    expect(SRC.match(/<rect x=\{PAD_L\}/g)?.length).toBe(3);
  });

  it('takes their edges from the engine rather than repeating them', () => {
    // A chart with its own copy of 0.8 keeps drawing the old band the day
    // the model is retuned.
    const bands = SRC.slice(SRC.indexOf('const optimal = band('), SRC.indexOf('const last ='));
    expect(bands).toContain('ACWR_BOUNDS.optimalFrom');
    expect(bands).toContain('ACWR_BOUNDS.optimalTo');
    expect(bands).toContain('ACWR_BOUNDS.cautionTo');
    expect(bands).not.toMatch(/\d\.\d/);
  });

  it('names them in words as well as colour', () => {
    // A key that is only a colour fails the same rule the status ramp does.
    expect(SRC).toContain('sweet spot');
    expect(SRC).toContain('ramping fast');
    expect(SRC).toContain('spiking');
  });
});

describe('a gap stays a gap', () => {
  it('breaks the line rather than joining across missing days', () => {
    // Drawing through them would say "you were detraining" about a period
    // the app knows nothing about.
    expect(SRC).toContain('point.acwr === null');
    expect(SRC).toContain('runs.push(run)');
    expect(SRC).toMatch(/runs\.map/);
  });

  it('marks today only where today has a value', () => {
    expect(SRC).toContain("find((p) => p.acwr !== null)");
  });
});

describe('the axis stays readable', () => {
  it('drops a label that would collide', () => {
    // At a ceiling of 2.2 the gap between 1.3 and 1.5 is ten pixels, and
    // the two sat on top of each other — measured.
    expect(SRC).toContain('MIN_LABEL_GAP');
    expect(SRC).toContain('gridValues(');
  });

  it('keeps the two that define in-the-band and in-the-red', () => {
    const fn = SRC.slice(SRC.indexOf('function gridValues'), SRC.indexOf('export function'));
    expect(fn.indexOf('optimalFrom')).toBeLessThan(fn.indexOf('optimalTo'));
    expect(fn.indexOf('cautionTo')).toBeLessThan(fn.indexOf('optimalTo'));
  });
});

describe('what a screen reader gets', () => {
  it('offers a table, weekly rather than daily', () => {
    // Ninety rows is not an alternative to a chart, it is a wall.
    expect(SRC).toContain('<caption>');
    expect(SRC).toContain('% 7 === 0');
  });

  it('says "not enough history" rather than a nought', () => {
    expect(SRC).toContain("'not enough history'");
  });

  it('wraps the table rather than hiding the table element', () => {
    expect(SRC).toMatch(/<div className="sr-only">\s*<table>/);
  });
});

describe('colour comes from the tokens', () => {
  it('uses no literal hex', () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it('draws the series in a viz slot, not the UI accent', () => {
    expect(SRC).toContain('stroke-viz-1');
  });
});
