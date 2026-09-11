import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLOR,
  MIN_STEP,
  appendPoint,
  draftMark,
  MARK_COLORS,
  MAX_MARKS,
  MAX_POINTS,
  addMark,
  arrowHead,
  circleOf,
  colorOf,
  describeMarks,
  distanceTo,
  makeMark,
  nearestMark,
  pointToSegment,
  quantise,
  simplify,
  toPixels,
  type Mark,
} from './marks';

/**
 * The geometry behind drawing on a photo (PLAN.md M71).
 *
 * All of it is pure, because the alternative — reading pixels back off a
 * canvas — is the reason annotation features usually ship with no tests at
 * all.
 */

const mark = (over: Partial<Mark> = {}): Mark => ({
  kind: 'line',
  color: 'gold',
  points: [0, 0, 1, 1],
  ...over,
});

describe('coordinates', () => {
  it('rounds to a precision a finger cannot beat', () => {
    expect(quantise(0.123456)).toBe(0.123);
    expect(quantise(0.1235)).toBe(0.124);
  });

  it('stops a drag at the edge of the photo rather than storing a mark off it', () => {
    expect(quantise(1.4)).toBe(1);
    expect(quantise(-0.2)).toBe(0);
  });

  it('scales x by the width and y by the height, not both by one of them', () => {
    expect(toPixels(mark({ points: [0.5, 0.5] }), 400, 200)).toEqual([200, 100]);
  });
});

describe('distance to a segment', () => {
  it('measures the perpendicular where the foot of it lands on the segment', () => {
    expect(pointToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
  });

  it('measures to the end when the point is past it — the segment is not a line', () => {
    // The infinite line through (0,0)-(10,0) is 3 away; the segment is 5.
    expect(pointToSegment(14, 3, 0, 0, 10, 0)).toBeCloseTo(5, 6);
  });

  it('survives a segment of zero length instead of dividing by it', () => {
    expect(pointToSegment(3, 4, 1, 1, 1, 1)).toBeCloseTo(Math.hypot(2, 3), 6);
  });
});

describe('simplifying a stroke', () => {
  it('drops the points a straight line already accounts for', () => {
    const straight = [0, 0, 0.25, 0, 0.5, 0, 0.75, 0, 1, 0];
    expect(simplify(straight)).toEqual([0, 0, 1, 0]);
  });

  it('keeps the point that carries the shape', () => {
    const bent = [0, 0, 0.5, 0.5, 1, 0];
    expect(simplify(bent)).toEqual(bent);
  });

  it('keeps both ends, whatever it drops in between', () => {
    const wiggle = Array.from({ length: 200 }, (_, i) => [i / 199, Math.sin(i / 3) * 0.3]).flat();
    const out = simplify(wiggle);
    expect(out.slice(0, 2)).toEqual(wiggle.slice(0, 2));
    expect(out.slice(-2)).toEqual(wiggle.slice(-2));
  });

  it('meets the cap by getting coarser, not by stopping halfway up the wall', () => {
    // A dense scribble: every point deviates, so tolerance is the only lever.
    const scribble = Array.from({ length: 900 }, (_, i) => [i / 899, (i % 2) * 0.4]).flat();
    const out = simplify(scribble, 0.0001, 20);
    expect(out.length / 2).toBeLessThanOrEqual(20);
    // The end of the stroke is still the end of the stroke.
    expect(out.slice(-2)).toEqual(scribble.slice(-2));
  });

  it('refuses a cap no stroke could satisfy rather than looping forever', () => {
    expect(() => simplify([0, 0, 1, 1], 0.004, 1)).toThrow();
  });

  it('holds a real drag under the cap at the default tolerance', () => {
    const drag = Array.from({ length: 600 }, (_, i) => {
      const t = i / 599;
      return [t, 0.5 + Math.sin(t * Math.PI * 2) * 0.3];
    }).flat();
    expect(simplify(drag).length / 2).toBeLessThanOrEqual(MAX_POINTS);
  });
});

describe('a drag in progress', () => {
  it('ignores a finger that has not moved, by the same reference', () => {
    const raw = [0.5, 0.5];
    expect(appendPoint(raw, 0.5 + MIN_STEP / 2, 0.5)).toBe(raw);
  });

  it('takes the point once the finger has gone somewhere', () => {
    expect(appendPoint([0.5, 0.5], 0.6, 0.5)).toEqual([0.5, 0.5, 0.6, 0.5]);
  });

  it('always takes the first point of a stroke', () => {
    expect(appendPoint([], 0.5, 0.5)).toEqual([0.5, 0.5]);
  });

  it('previews a line without simplifying it — that runs once, at the end', () => {
    const straight = [0, 0, 0.25, 0, 0.5, 0, 1, 0];
    expect(draftMark('line', 'gold', straight)?.points).toEqual(straight);
    expect(makeMark('line', 'gold', straight)?.points).toEqual([0, 0, 1, 0]);
  });

  it('previews an arrow as an arrow rather than as the squiggle drawing it', () => {
    expect(draftMark('arrow', 'gold', [0, 0, 0.4, 0.9, 0.8, 0.1])?.points).toEqual([0, 0, 0.8, 0.1]);
  });

  it('shows nothing until the drag is a drag', () => {
    expect(draftMark('line', 'gold', [0.5, 0.5])).toBeNull();
  });
});

describe('making a mark', () => {
  it('refuses a tap that never moved — an invisible speck only the eraser can find', () => {
    expect(makeMark('line', 'gold', [0.4, 0.4])).toBeNull();
    expect(makeMark('line', 'gold', [0.4, 0.4, 0.4, 0.4, 0.4, 0.4])).toBeNull();
    expect(makeMark('circle', 'gold', [0.4, 0.4, 0.4, 0.4])).toBeNull();
  });

  it('refuses a gesture with nothing in it rather than inventing coordinates', () => {
    // The two-point kinds read the first and last pair; with no pairs at all
    // that is a shape made of four undefineds, which renders as nothing and
    // erases as nothing and can never be got rid of.
    expect(makeMark('arrow', 'gold', [])).toBeNull();
    expect(makeMark('circle', 'gold', [])).toBeNull();
    expect(makeMark('line', 'gold', [])).toBeNull();
  });

  it('keeps only the ends of an arrow, whatever the hand did in between', () => {
    const arrow = makeMark('arrow', 'red', [0.1, 0.1, 0.5, 0.9, 0.8, 0.2]);
    expect(arrow).toEqual({ kind: 'arrow', color: 'red', points: [0.1, 0.1, 0.8, 0.2] });
  });

  it('takes a circle as the hold you started on and the rim you dragged to', () => {
    const circle = makeMark('circle', 'cyan', [0.5, 0.5, 0.5, 0.6, 0.5, 0.7]);
    expect(circle?.points).toEqual([0.5, 0.5, 0.5, 0.7]);
  });

  it('clamps a drag that left the photo', () => {
    expect(makeMark('arrow', 'gold', [-0.5, 0.2, 1.6, 0.9])?.points).toEqual([0, 0.2, 1, 0.9]);
  });

  it('simplifies a freehand line on the way in', () => {
    const line = makeMark('line', 'gold', [0, 0, 0.25, 0, 0.5, 0, 1, 0]);
    expect(line?.points).toEqual([0, 0, 1, 0]);
  });
});

describe('erasing', () => {
  const W = 400;
  const H = 300;

  it('measures a circle to its ring, not to the hold in the middle of it', () => {
    const ring = mark({ kind: 'circle', points: [0.5, 0.5, 0.75, 0.5] });
    // Centre: 100px from the ring, not 0.
    expect(distanceTo(ring, 200, 150, W, H)).toBeCloseTo(100, 6);
    expect(distanceTo(ring, 300, 150, W, H)).toBeCloseTo(0, 6);
  });

  it('measures a polyline to its nearest segment', () => {
    const bent = mark({ points: [0, 0, 0.5, 0, 0.5, 1] });
    expect(distanceTo(bent, 200, 150, W, H)).toBeCloseTo(0, 6);
  });

  it('can still reach a one-point mark a hand-written backup smuggled in', () => {
    expect(distanceTo(mark({ points: [0.5, 0.5] }), 200, 150, W, H)).toBeCloseTo(0, 6);
  });

  it('finds nothing when the tap missed', () => {
    expect(nearestMark([mark({ points: [0, 0, 0.1, 0] })], 390, 290, W, H, 20)).toBeNull();
  });

  it('picks the mark on top when two sit under the same tap', () => {
    const both = [mark({ points: [0, 0.5, 1, 0.5] }), mark({ points: [0, 0.5, 1, 0.5] })];
    expect(nearestMark(both, 200, 150, W, H, 20)).toBe(1);
  });

  it('picks the nearer mark over the newer one when they are not tied', () => {
    const marks = [mark({ points: [0, 0.5, 1, 0.5] }), mark({ points: [0, 0.9, 1, 0.9] })];
    expect(nearestMark(marks, 200, 150, W, H, 200)).toBe(0);
  });
});

describe('the arrowhead', () => {
  it('has two wings, behind the point and either side of the shaft', () => {
    const [left, right] = arrowHead(0, 0, 100, 0, 20);
    expect(left![0]).toBeLessThan(100);
    expect(right![0]).toBeLessThan(100);
    // Symmetric about the shaft.
    expect(left![1]).toBeCloseTo(-right![1]!, 6);
  });

  it('shrinks with a short shaft rather than ending in a barb wider than the arrow', () => {
    const short = arrowHead(0, 0, 10, 0, 40);
    for (const [x] of short) expect(x).toBeGreaterThanOrEqual(0);
  });

  it('follows the direction of the shaft', () => {
    const up = arrowHead(0, 100, 0, 0, 20);
    for (const [, y] of up) expect(y).toBeGreaterThan(0);
  });
});

describe('a circle in the image its own proportions', () => {
  it('takes its radius in pixels, so a wide photo does not make it an ellipse', () => {
    // A quarter of the width across, on a 400×200 photo, is 100px — not the
    // 0.25 it is stored as, and not 50.
    const ring = mark({ kind: 'circle', points: [0.5, 0.5, 0.75, 0.5] });
    expect(circleOf(ring, 400, 200)).toEqual({ cx: 200, cy: 100, r: 100 });
  });
});

describe('the palette', () => {
  it('falls back rather than painting with whatever a backup file said', () => {
    expect(colorOf('javascript:alert(1)')).toBe(colorOf(DEFAULT_COLOR));
  });

  it('starts on a colour it actually has', () => {
    expect(MARK_COLORS.some((c) => c.id === DEFAULT_COLOR)).toBe(true);
  });

  it('gives every colour a distinct hex and a name', () => {
    expect(new Set(MARK_COLORS.map((c) => c.hex)).size).toBe(MARK_COLORS.length);
    for (const c of MARK_COLORS) expect(c.label.length).toBeGreaterThan(0);
  });
});

describe('the cap', () => {
  it('stops adding rather than dropping the oldest mark', () => {
    const at = Array.from({ length: MAX_MARKS }, () => mark());
    const after = addMark(at, mark({ color: 'red' }));
    expect(after).toBe(at);
  });

  it('adds below it', () => {
    expect(addMark([mark()], mark()).length).toBe(2);
  });
});

describe('describing the drawing for a screen reader', () => {
  it('says nothing is on it when nothing is', () => {
    expect(describeMarks([])).toBe('No marks');
  });

  it('counts by kind, because two circles and three arrows is not five marks', () => {
    const marks = [
      mark({ kind: 'circle' }),
      mark({ kind: 'circle' }),
      mark({ kind: 'arrow' }),
      mark({ kind: 'line' }),
    ];
    expect(describeMarks(marks)).toBe('2 circles, 1 arrow, 1 line');
  });

  it('leaves out the kinds that are not there', () => {
    expect(describeMarks([mark({ kind: 'arrow' })])).toBe('1 arrow');
  });
});
