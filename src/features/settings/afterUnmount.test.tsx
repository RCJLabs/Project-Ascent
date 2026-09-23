// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { renderAt, reset } from '@/test/render';
import { code } from '@/test/source';
import { SettingsPage } from './SettingsPage';

/**
 * A state write that arrived after the page had gone (PLAN.md M323, M331).
 *
 * CI went red on M322 with **all 7,179 tests passing**. The failure was an
 * unhandled rejection caught after the environment was torn down:
 *
 * ```
 * ReferenceError: window is not defined
 *  ❯ dispatchSetState node_modules/react-dom/…
 *  ❯ src/features/settings/SettingsPage.tsx:261:5
 * This error originated in "src/features/settings/launchedFile.test.tsx"
 * ```
 *
 * `refreshDemo` asks the database two questions and writes the answer into
 * state. A test that finishes before those two reads settle leaves the write
 * in flight; vitest tears the environment down; the reads resolve; React
 * reaches for `window` and it is not there. Nothing in the component ever
 * checked that the page was still on screen.
 *
 * ## Why this test deletes `window`
 *
 * Because that is precisely what the runner does, and it is the only thing
 * that makes the bug observable. Unmounting alone proves nothing: React 19
 * drops an update to an unmounted tree in silence, so a page that writes
 * into the void looks identical to one that does not. The defect only has a
 * symptom once the global is gone, so the global goes.
 *
 * ## At one moment, it was a coin toss (PLAN.md M331)
 *
 * M330's CI went red **in this file**, with every test passing. The page's
 * mount effect makes three more reads than `refreshDemo`, M323 guarded none
 * of them, and whether one was still in flight at the single moment this
 * unmounted was a matter of timing: two runs in 25 locally. So it unmounts
 * at a dozen moments now — before anything can have landed, as the page
 * appears, and a millisecond apart after — and every one has to come back
 * clean.
 *
 * And it waits one scheduler turn after unmounting, except at the first
 * moment, before deleting `window`. An update that lands while the page is
 * still up queues a render, and React reads `window` as that render starts.
 * Deleting the global in the same tick as the unmount ran that render with no
 * `window` — the throw CI printed. The runner never does that: it tears down
 * turns after the last unmount, not during it. The first moment needs no
 * turn, because nothing has had one in which to queue a render.
 */

/** Before anything has landed, then as the page appears, then 1–10ms after. */
const MOMENTS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe('leaving the settings page', () => {
  it('writes nothing into it afterwards, whenever it is left', async () => {
    const found: string[] = [];
    for (const after of MOMENTS) {
      await reset();
      const view = renderAt('/settings', <SettingsPage />);
      if (after >= 0) await screen.findByText('Your data');
      if (after > 0) await new Promise((resolve) => setTimeout(resolve, after));

      view.unmount();
      if (after >= 0) await new Promise((resolve) => setImmediate(resolve));

      const errors: unknown[] = [];
      const onError = (e: unknown) => errors.push(e);
      process.on('unhandledRejection', onError);
      process.on('uncaughtException', onError);

      // What vitest does between files, done here where it can be asserted on.
      const win = globalThis.window;
      // @ts-expect-error the whole point: stand where the torn-down runner stands
      delete globalThis.window;
      try {
        // Long enough for fake-indexeddb round trips to land, which is the
        // window the bug lives in and the reason a duration is the subject here.
        await new Promise((resolve) => setTimeout(resolve, 50));
      } finally {
        globalThis.window = win;
        process.off('unhandledRejection', onError);
        process.off('uncaughtException', onError);
      }
      if (errors.length > 0) found.push(`${after < 0 ? 'at once' : `${after}ms`}: ${errors.map(String).join('; ')}`);
    }
    expect(found, 'writes after the page went').toEqual([]);
  });
});

/**
 * And the guard itself has to survive `StrictMode` (PLAN.md M331).
 *
 * M323's guard cleared its ref in an effect's cleanup and never set it. In
 * development `main.tsx` renders under `StrictMode`, which runs every
 * cleanup once on mount before running the effects again — so the ref was
 * false from the first paint, `refreshDemo` never wrote, and a new install
 * run with `npm run dev` was never offered the sample climber. Rendered here
 * the way `main.tsx` renders, with `StrictMode` at the root: nested inside
 * the router, it did not double-run the effects and the test passed either
 * way.
 */
describe('under StrictMode', () => {
  it('still offers the sample climber', async () => {
    await reset();
    window.location.hash = '#/settings';
    render(
      <StrictMode>
        <Router hook={useHashLocation}>
          <SettingsPage />
        </Router>
      </StrictMode>,
    );
    expect(await screen.findByRole('button', { name: 'Load a sample climber' })).toBeTruthy();
  });

  it('never clears an on-screen ref that it does not set again', () => {
    const sources = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
      });
    const cleared = sources('src').flatMap((path) => {
      const text = code(readFileSync(path, 'utf8'));
      return [...text.matchAll(/(\w+)\.current = false/g)].map((m) => ({ path, ref: m[1]! }));
    });
    // Both guards M323 wrote, at least; a sweep that finds none walked nothing.
    expect(cleared.length).toBeGreaterThanOrEqual(2);
    for (const { path, ref } of cleared) {
      const text = code(readFileSync(path, 'utf8'));
      expect(text, `${path} clears ${ref} and never sets it`).toMatch(new RegExp(`\\b${ref}\\.current = true`));
    }
  });
});
