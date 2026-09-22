// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderAt, reset } from '@/test/render';
import { SettingsPage } from './SettingsPage';

/**
 * A state write that arrived after the page had gone (PLAN.md M323).
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
 * The alternative was to widen every test that renders this page until the
 * card had settled, which is a fix applied once per test file for ever and
 * leaves the component still writing into nothing.
 */

describe('leaving the settings page', () => {
  it('does not write the sample-data card into a page that is gone', async () => {
    await reset();
    const view = renderAt('/settings', <SettingsPage />);
    await screen.findByText('Your data');

    // Unmount with the card's two database reads still in flight — the state
    // this test is about. The reads are re-fired on every change to `byDate`,
    // so there is always a pair outstanding shortly after a render.
    view.unmount();

    const rejections: unknown[] = [];
    const onReject = (e: PromiseRejectionEvent | unknown) => rejections.push(e);
    process.on('unhandledRejection', onReject);

    // What vitest does between files, done here where it can be asserted on.
    const win = globalThis.window;
    // @ts-expect-error the whole point: stand where the torn-down runner stands
    delete globalThis.window;
    try {
      // Long enough for two fake-indexeddb round trips to land, which is the
      // window the bug lives in and the reason a duration is the subject here.
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      globalThis.window = win;
      process.off('unhandledRejection', onReject);
    }

    expect(rejections, `${rejections.length} rejection(s) after the page went`).toEqual([]);
  });
});
