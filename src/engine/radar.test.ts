import { describe, expect, it } from 'vitest';
import {
  axisPoints,
  lopsidedness,
  polygonPath,
  radarPoints,
  strongestIndex,
  weakestIndex,
} from './radar';

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('where the axes sit', () => {
  it('starts straight up', () => {
    // Every radar anyone has seen starts at the top. One that does not is
    // read wrong before it is read at all. SVG y grows downward, so up is
    // negative.
    const [first] = axisPoints(5, 100);
    near(first!.x, 0);
    near(first!.y, -100);
  });

  it('goes clockwise', () => {
    const [, second] = axisPoints(4, 100);
    near(second!.x, 100);
    near(second!.y, 0);
  });

  it('spaces them evenly', () => {
    const points = axisPoints(5, 100);
    const angles = points.map((p) => Math.atan2(p.y, p.x));
    // atan2 wraps at ±π, so one gap comes back 2π out. Normalise before
    // comparing, or the test fails on correct geometry.
    const gaps = angles
      .slice(1)
      .map((a, i) => ((a - angles[i]! + 2 * Math.PI) % (2 * Math.PI)));
    for (const gap of gaps) near(gap, (2 * Math.PI) / 5);
  });

  it('puts every one on the circle', () => {
    for (const p of axisPoints(5, 100)) near(Math.hypot(p.x, p.y), 100);
  });

  it('makes as many as it is asked for', () => {
    expect(axisPoints(5, 10)).toHaveLength(5);
    expect(axisPoints(3, 10)).toHaveLength(3);
    expect(axisPoints(0, 10)).toEqual([]);
  });
});

describe('plotting values', () => {
  it('puts a maximum value on the edge', () => {
    const [first] = radarPoints([100, 0, 0, 0, 0], 50, 100);
    near(Math.hypot(first!.x, first!.y), 50);
  });

  it('puts a zero at the centre', () => {
    for (const p of radarPoints([0, 0, 0, 0, 0], 50, 100)) {
      near(p.x, 0);
      near(p.y, 0);
    }
  });

  it('scales in between', () => {
    const [first] = radarPoints([50, 0, 0, 0, 0], 100, 100);
    near(Math.hypot(first!.x, first!.y), 50);
  });

  it('does not let a bonus punch through the web', () => {
    // A stat can exceed its cap, and a vertex outside the rings reads as a
    // rendering fault rather than as a strength.
    const [first] = radarPoints([180, 0, 0, 0, 0], 50, 100);
    near(Math.hypot(first!.x, first!.y), 50);
  });

  it('does not let a negative turn the shape inside out', () => {
    const [first] = radarPoints([-40, 0, 0, 0, 0], 50, 100);
    near(first!.x, 0);
    near(first!.y, 0);
  });

  it('survives a maximum of zero', () => {
    expect(() => radarPoints([1, 2, 3], 50, 0)).not.toThrow();
    for (const p of radarPoints([1, 2, 3], 50, 0)) near(Math.hypot(p.x, p.y), 0);
  });

  it('keeps each value on its own axis', () => {
    const points = radarPoints([100, 100, 100, 100, 100], 50, 100);
    const outer = axisPoints(5, 50);
    points.forEach((p, i) => {
      near(p.x, outer[i]!.x);
      near(p.y, outer[i]!.y);
    });
  });
});

describe('the path', () => {
  it('closes the shape', () => {
    expect(polygonPath(radarPoints([50, 50, 50, 50, 50], 50, 100))).toMatch(/ Z$/);
  });

  it('starts with a move and continues with lines', () => {
    const path = polygonPath(radarPoints([50, 60, 70, 80, 90], 50, 100));
    expect(path.startsWith('M')).toBe(true);
    expect(path.match(/L/g)).toHaveLength(4);
  });

  it('is nothing for nothing', () => {
    expect(polygonPath([])).toBe('');
  });

  it('does not emit exponent notation into a path', () => {
    // A tiny float rendered as "1e-15" is a path an SVG parser rejects, and
    // the whole shape disappears.
    const path = polygonPath(radarPoints([0.0000001, 50, 50, 50, 50], 50, 100));
    expect(path).not.toMatch(/e-/i);
  });
});

describe('which axis is the point', () => {
  it('finds the lowest', () => {
    expect(weakestIndex([80, 70, 20, 90, 60])).toBe(2);
  });

  it('finds the highest', () => {
    expect(strongestIndex([80, 70, 20, 90, 60])).toBe(3);
  });

  it('breaks a tie the same way every time', () => {
    // Otherwise the answer flickers between two equal axes.
    expect(weakestIndex([20, 20, 90])).toBe(0);
    expect(strongestIndex([90, 90, 20])).toBe(0);
  });

  it('says nothing about an empty set', () => {
    expect(weakestIndex([])).toBe(-1);
    expect(strongestIndex([])).toBe(-1);
  });
});

describe('how lopsided a shape is', () => {
  it('calls an even shape even', () => {
    expect(lopsidedness([50, 50, 50, 50, 50])).toBe(0);
  });

  it('calls a spike a spike', () => {
    expect(lopsidedness([100, 0, 0, 0, 0])).toBe(1);
  });

  it('sits in between for a lean', () => {
    expect(lopsidedness([100, 50, 50, 50, 50])).toBeCloseTo(0.5, 6);
  });

  it('does not divide by an empty climber', () => {
    expect(lopsidedness([0, 0, 0])).toBe(0);
    expect(lopsidedness([])).toBe(0);
  });
});
