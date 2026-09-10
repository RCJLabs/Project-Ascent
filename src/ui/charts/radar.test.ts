import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * M24's "done when": the weakest axis is obvious without reading a number.
 *
 * The geometry is tested in `engine/radar.test.ts` and the past snapshot in
 * `engine/statHistory.test.ts`. These are the drawing decisions that carry
 * the "done when", and each of them is one line away from being undone.
 */

const SRC = readFileSync('src/ui/charts/StatRadar.tsx', 'utf8');

describe('the weakest axis is unmissable', () => {
  it('marks it in three ways, not one', () => {
    // A dip in a pentagon is only obvious once you know which corner is
    // which. A ring on the vertex, a bold label, and the name in the
    // caption — so it survives a small screen, a screen reader and a
    // colour-blind reader alike.
    expect(SRC).toContain('weakestIndex(');
    expect(SRC).toContain('<circle');
    expect(SRC).toMatch(/i === weakest \? 'fill-ink' : 'fill-ink-soft'/);
    expect(SRC).toContain('weakest <span');
  });

  it('does not lean on colour to say it', () => {
    // M15's rule, and a spike chart is exactly where it bites.
    const marker = SRC.slice(SRC.indexOf('<circle'), SRC.indexOf('</svg>'));
    expect(marker).toContain('stroke-ink');
    expect(SRC).not.toMatch(/fill-(warn|danger|critical|positive)/);
  });
});

describe('the second shape', () => {
  it('is an outline, not a second fill', () => {
    // Two filled shapes fight each other and neither reads.
    const past = SRC.slice(SRC.indexOf('{past && ('), SRC.indexOf('{/* A ring'));
    expect(past).toContain('fill-none');
    expect(past).toContain('strokeDasharray');
  });

  it('is drawn behind the current one', () => {
    // SVG paints in document order, so "behind" is a source-order fact.
    expect(SRC.indexOf('{past && (')).toBeLessThan(SRC.indexOf('fillOpacity'));
  });

  it('is optional, for a climber with no six months yet', () => {
    expect(SRC).toContain('then?: Record<StatId, number> | undefined');
  });
});

describe('what a screen reader gets', () => {
  it('names the weakest axis in the label', () => {
    expect(SRC).toMatch(/aria-label=.*Weakest/s);
  });

  it('offers the numbers as a table', () => {
    expect(SRC).toContain('<caption>');
    expect(SRC).toMatch(/<div className="sr-only">\s*<table>/);
  });

  it('includes the past column only when there is a past', () => {
    expect(SRC).toContain('{past && <th scope="col">');
  });
});

describe('the drawing stays inside itself', () => {
  it('pads for the label width, not just its distance', () => {
    // A label anchored `start` runs outward from its vertex: 34 clipped
    // "END" to "EN". Measured.
    const pad = /const PAD = (\d+)/.exec(SRC);
    expect(pad).not.toBeNull();
    expect(Number(pad![1])).toBeGreaterThanOrEqual(46);
  });

  it('uses tokens rather than literal colours', () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
