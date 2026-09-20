import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { measureAppHeight, trackAppHeight } from './appHeight';

/**
 * The shell's height, measured (PLAN.md M302).
 *
 * The bug this is written against is one number going stale: a shell told
 * it is 780px tall on a 560px screen puts its last row — the tab bar — past
 * the bottom of an `overflow-hidden` box, and the page looks perfectly
 * normal apart from having no navigation. `scripts/layout.mjs` holds the
 * pixels; this holds the rule that the number is re-read.
 */

function harness(innerHeight = 780) {
  const view = { innerHeight };
  const written: string[] = [];
  const listeners = new Map<string, Set<() => void>>();
  const root = {
    style: {
      setProperty: (name: string, value: string) => written.push(`${name}=${value}`),
    },
  };
  const on = (type: string, fn: () => void) => {
    const set = listeners.get(type) ?? new Set();
    set.add(fn);
    listeners.set(type, set);
  };
  const off = (type: string, fn: () => void) => listeners.get(type)?.delete(fn);
  const fire = (type: string) => {
    for (const fn of listeners.get(type) ?? []) fn();
  };
  return { view, written, root, on, off, fire, listeners };
}

describe('the height the shell is given', () => {
  it('is the layout viewport, in pixels', () => {
    expect(measureAppHeight({ innerHeight: 812 })).toBe('812px');
  });

  it('is written before anything has happened', () => {
    const h = harness(640);
    trackAppHeight(h);
    expect(h.written).toEqual(['--app-height=640px']);
  });

  /**
   * The whole point. A document that measures once is a document with a
   * number that can go stale, and this is the failure the report was:
   * styled page, no bottom bar, back on a relaunch.
   */
  it.each(['resize', 'orientationchange', 'pageshow', 'visibilitychange'])(
    'is read again on %s',
    (event) => {
      const h = harness(780);
      trackAppHeight(h);
      h.view.innerHeight = 560;
      h.fire(event);
      expect(h.written.at(-1)).toBe('--app-height=560px');
    },
  );

  /**
   * A WebView mid-transition reports nothing, and a shell of no height is a
   * worse answer than a stale one — every row of it would be gone rather
   * than the last.
   */
  it('keeps the last real height when the viewport reports none', () => {
    const h = harness(640);
    trackAppHeight(h);
    h.view.innerHeight = 0;
    h.fire('resize');
    expect(h.written).toEqual(['--app-height=640px']);
  });

  it('stops listening when it is told to', () => {
    const h = harness(640);
    const stop = trackAppHeight(h);
    stop();
    h.view.innerHeight = 480;
    for (const event of ['resize', 'orientationchange', 'pageshow', 'visibilitychange']) {
      h.fire(event);
    }
    expect(h.written).toEqual(['--app-height=640px']);
  });

  /**
   * The unit is still there underneath (PLAN.md M302). Until the first
   * measurement lands the shell is `100dvh`, which is what it was before
   * and what keeps the first paint identical — so a build whose script
   * never ran is no worse off than the one that shipped the bug.
   */
  it('leaves a fallback in the shell for the paint before it runs', () => {
    const shell = readFileSync('src/ui/AppShell.tsx', 'utf8');
    expect(shell).toContain('h-[var(--app-height,100dvh)]');
  });
});
