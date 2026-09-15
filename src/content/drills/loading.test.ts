import { describe, expect, it, vi } from 'vitest';
import { DRILLS, drillsLoaded, filterDrills, getDrill, loadDrills, offWallDrills } from './index';
import { readFileSync } from 'node:fs';
import { LIBRARY } from './library';

/**
 * The registry fills itself (PLAN.md M185).
 *
 * `ui/wired.test.ts` proves the bodies are off the first-paint path and that
 * nothing imports them statically. That is the guard that lasts, and it
 * cannot see whether the library actually arrives — a `loadDrills` that
 * resolved without filling anything would pass every source check in this
 * repo and leave the app with no drills at all.
 *
 * `src/test/setup.ts` awaits `loadDrills()` before any test module is
 * evaluated, the same guarantee the router gives the pages, so the registry
 * is already full here. That is itself worth asserting: it is what lets the
 * dozens of test files that call `getDrill` at module scope keep doing it.
 */

describe('the library, fetched rather than imported', () => {
  it('is in the registry before a test module runs', () => {
    expect(drillsLoaded()).toBe(true);
    expect(DRILLS.length, 'the registry is empty, so setup did not await').toBeGreaterThan(100);
  });

  /**
   * Filled in place, not replaced. Every caller that holds a reference to
   * `DRILLS` — and there are several, through `filterDrills` — sees the
   * drills only because the array identity survives the load.
   */
  it('is the same array the callers already hold', () => {
    const held = DRILLS;
    expect(held).toBe(DRILLS);
    expect(held).toHaveLength(LIBRARY.length);
    expect(held[0]).toBe(LIBRARY[0]);
  });

  it('answers by id, which is what the six first-paint callers ask', () => {
    const drill = LIBRARY[0]!;
    expect(getDrill(drill.id)).toBe(drill);
    expect(getDrill('not_a_drill' as never)).toBeUndefined();
  });

  /** Idempotent, because the router and `hydrateAll` both ask. */
  it('loads once however many times it is asked', async () => {
    const before = DRILLS.length;
    // The promise itself, not just the result: replacing `??=` with `=`
    // leaves the registry the right length — the fill splices rather than
    // appends — and fetches the chunk three times. The battery found that.
    expect(loadDrills()).toBe(loadDrills());
    await Promise.all([loadDrills(), loadDrills(), loadDrills()]);
    expect(DRILLS).toHaveLength(before);
    expect(new Set(DRILLS.map((d) => d.id)).size, 'the library was appended twice').toBe(before);
  });

  /**
   * And the derived views read the filled array rather than a snapshot taken
   * at module scope — which is what the old `BY_ID` did, built from `DRILLS`
   * on the line after it was declared.
   */
  it('derives its views from the filled registry', () => {
    expect(offWallDrills().length).toBeGreaterThan(5);
    expect(filterDrills({ category: 'recovery' }).length).toBeGreaterThan(5);
    expect(filterDrills({ search: 'no drill is called this' })).toEqual([]);
  });
});

/**
 * The state the rest of this file cannot see.
 *
 * `src/test/setup.ts` awaits `loadDrills()` before any test module runs, so
 * every assertion above is made against a full registry — which is the right
 * default and makes the *empty* one untestable. A fresh module graph is the
 * only way to reach it, and it is the state the whole milestone turns on:
 * between the entry chunk executing and the library landing, the app holds a
 * registry with no drills in it.
 */
describe('before the library lands', () => {
  async function fresh() {
    vi.resetModules();
    return (await import('./index')) as typeof import('./index');
  }

  it('says so, rather than reporting an empty library as loaded', async () => {
    const drills = await fresh();
    expect(drills.drillsLoaded()).toBe(false);
    expect(drills.DRILLS).toEqual([]);
    expect(drills.getDrill('off_shoulder_cars' as never)).toBeUndefined();
  });

  /**
   * Which is why the router waits. `App.tsx` holds every route behind
   * `loadPrograms` and `loadDrills` together, because Home is eager and
   * `engine/fingerGap.ts` calls `getDrill` on mount — a page rendered in
   * this window would read a climber's hangboard session as no finger work
   * at all, once, with nothing to correct it.
   */
  it('is a window the router closes', async () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app, 'the gate stopped waiting for the drills').toMatch(
      /Promise\.all\(\[loadPrograms\(\), loadDrills\(\)\]\)/,
    );
    expect(app, 'the gate no longer starts closed').toMatch(
      /useState\(\(\) => programsLoaded\(\) && drillsLoaded\(\)\)/,
    );
    // And `hydrateAll` asks too, so an import that replaces the database
    // refills the registry rather than leaving the old one standing.
    const store = readFileSync('src/store/index.ts', 'utf8');
    expect(store).toMatch(/loadDrills\(\),/);
  });

  it('fills on demand, from empty', async () => {
    const drills = await fresh();
    await drills.loadDrills();
    expect(drills.drillsLoaded()).toBe(true);
    expect(drills.DRILLS.length).toBeGreaterThan(100);
    expect(drills.offWallDrills().length).toBeGreaterThan(5);
  });
});
