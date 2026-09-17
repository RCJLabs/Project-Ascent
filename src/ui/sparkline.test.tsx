// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Sparkline, describeRun } from './Sparkline';

/**
 * Eight weeks at the size of a word (PLAN.md M239).
 *
 * A picture with no axes and no labels is only honest if the line itself is
 * right, so what is checked is the geometry: which way is up, where a flat
 * run sits, and that one reading is not drawn as a trend.
 */

afterEach(cleanup);

const points = (): { x: number; y: number }[] => {
  const raw = document.querySelector('polyline')?.getAttribute('points') ?? '';
  return raw
    .split(' ')
    .filter(Boolean)
    .map((p) => {
      const [x, y] = p.split(',').map(Number);
      return { x: x!, y: y! };
    });
};

describe('the line', () => {
  /**
   * SVG y grows downward, so a bigger number is a *smaller* y. Getting this
   * backwards draws every improving run as a decline, and nothing else in
   * the component would fail.
   */
  it('puts the bigger number higher up', () => {
    render(<Sparkline values={[1, 9]} label="Load" />);
    const [a, b] = points();
    expect(b!.y).toBeLessThan(a!.y);
  });

  it('runs left to right, oldest first', () => {
    render(<Sparkline values={[1, 5, 3, 8]} label="Load" />);
    const xs = points().map((p) => p.x);
    expect([...xs].sort((m, n) => m - n)).toEqual(xs);
    expect(xs).toHaveLength(4);
  });

  /**
   * A week that never moved is a fact about the training, not an absence of
   * it, so a flat run draws down the middle rather than along the floor —
   * where it reads as eight weeks of nothing.
   */
  it('draws a flat run through the middle', () => {
    render(<Sparkline values={[7, 7, 7]} label="Load" height={24} />);
    for (const p of points()) expect(p.y).toBeCloseTo(12, 1);
  });

  /** One reading has no run behind it, and a line through it invents one. */
  it('draws nothing for a single reading', () => {
    const { container } = render(<Sparkline values={[7]} label="Load" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('marks where the line has got to', () => {
    render(<Sparkline values={[1, 5, 3]} label="Load" />);
    const dot = document.querySelector('circle')!;
    const last = points().at(-1)!;
    expect(Number(dot.getAttribute('cx'))).toBeCloseTo(last.x, 1);
    expect(Number(dot.getAttribute('cy'))).toBeCloseTo(last.y, 1);
  });
});

describe('what a reader is told instead', () => {
  /**
   * A sentence, not a table (PLAN.md M239). Three of these on the front door
   * would be three hidden tables of eight rows on the one screen the app
   * opens on, and the number beside each is already text.
   */
  it('says where the run ended and which way it came', () => {
    expect(describeRun([5, 9], 'Sends', String)).toBe('Sends over 2 weeks: 9, up from 5.');
    expect(describeRun([9, 5], 'Sends', String)).toBe('Sends over 2 weeks: 5, down from 9.');
    expect(describeRun([7, 7], 'Sends', String)).toBe('Sends over 2 weeks: 7, level with 7.');
  });

  it('reads the values the way the caller writes them', () => {
    expect(describeRun([0.8, 1.1], 'A : C', (v) => v.toFixed(2))).toContain('1.10, up from 0.80');
  });

  it('puts that sentence on the picture', () => {
    render(<Sparkline values={[1, 4]} label="Week load" />);
    const svg = document.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Week load over 2 weeks: 4, up from 1.');
  });
});
