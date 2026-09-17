// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Meter } from './Meter';

/**
 * The bar, rendered (PLAN.md M257).
 *
 * `ui.test.ts` reads this file's source for its four ARIA attributes, which
 * proves they are written and not that either of the two things a bar is —
 * a width and a track — comes out right. M257's battery found both open:
 * putting a floor back under the fill and ignoring `track` altogether both
 * survived a suite of six thousand.
 */

const bar = (el: HTMLElement) => el.querySelector('[role="progressbar"]') as HTMLElement;
const fill = (el: HTMLElement) => bar(el).firstElementChild as HTMLElement;

describe('the fill', () => {
  it('is exactly the fraction, with no floor under it', () => {
    // The skills page floored its own bar at 2% so an untouched rung still
    // showed a sliver of accent — progress the log does not have, on the
    // page whose whole claim is that nothing here is granted.
    const { container } = render(<Meter value={0} label="Nothing yet" />);
    expect(fill(container).style.width).toBe('0%');
  });

  it('rounds to a whole percent and says the same number in words', () => {
    const { container } = render(<Meter value={1 / 3} label="A third" />);
    expect(fill(container).style.width).toBe('33%');
    expect(bar(container).getAttribute('aria-valuenow')).toBe('33');
    expect(bar(container).getAttribute('aria-valuetext')).toBe('33%');
  });

  it('clamps a fraction that overran its goal', () => {
    const { container } = render(<Meter value={2.5} label="Overshot" />);
    expect(fill(container).style.width).toBe('100%');
    expect(bar(container).getAttribute('aria-valuenow')).toBe('100');
  });

  it('treats a number that is not one as nothing', () => {
    const { container } = render(<Meter value={Number.NaN} label="Unknown" />);
    expect(fill(container).style.width).toBe('0%');
  });
});

describe('the track', () => {
  it('sits on sunken by default', () => {
    const { container } = render(<Meter value={0.5} label="Half" />);
    expect(bar(container).className).toContain('bg-sunken');
    expect(bar(container).className).not.toContain('bg-surface');
  });

  it('sits on surface when the row underneath is already sunken', () => {
    // The skills page is the one caller: its rows are `bg-sunken`, so the
    // default track is a bar you cannot see and an empty one is nothing.
    const { container } = render(<Meter value={0.5} label="Half" track="surface" />);
    expect(bar(container).className).toContain('bg-surface');
    expect(bar(container).className).not.toContain('bg-sunken');
  });
});
