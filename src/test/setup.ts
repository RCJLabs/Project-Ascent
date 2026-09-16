// Vitest runs in node; give the db layer a real-enough IndexedDB.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect } from 'vitest';
import { noAssertionMade } from './assertions';
import { loadPrograms } from '@/content/programs';
import { loadDrills } from '@/content/drills';
import { writesSettled } from '@/store/writes';

// The shipped programs are loaded, not imported (PLAN.md M78), and the drill
// library with them (M185); dozens of test files call `getProgram` or
// `getDrill` at module scope. A setup file runs before the test module is
// evaluated, so awaiting here is what lets them keep doing that — the same
// guarantee the router gives the pages.
await Promise.all([loadPrograms(), loadDrills()]);

/**
 * jsdom implements no layout, so anything that scrolls or measures throws a
 * "Not implemented" into stderr on every component test (PLAN.md M43).
 * Stubbing them keeps a passing run silent — a test log with expected noise
 * in it is a log nobody reads.
 *
 * These are deliberately no-ops rather than spies: no test should assert on
 * scrolling, which is exactly the kind of thing jsdom cannot tell the truth
 * about. Guarded so the node-environment tests, which have no `window`, are
 * untouched.
 */
if (typeof window !== 'undefined') {
  window.scrollTo = () => {};
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  // jsdom has no pointer capture either, and a drawing surface that takes a
  // drag has to claim the pointer or the stroke stops at the edge of the
  // element (PLAN.md M71).
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
  // jsdom implements neither navigation nor downloads, so clicking the
  // anchor `lib/download.ts` creates logs "Not implemented: navigation to
  // another Document" on every export test. Nothing listens for that click
  // but the browser, so a no-op for download anchors is the whole fix.
  const anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (!this.hasAttribute('download')) anchorClick.call(this);
  };
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
}

/**
 * No test inherits the previous one's unwritten writes (PLAN.md M220).
 *
 * Store actions persist fire-and-forget, on one module-level queue, because
 * in the app there is one of it. Before M220 those writes were dropped on
 * the floor often enough that nobody noticed; now they land, and a write
 * enqueued by the last test would otherwise land *after* the next one has
 * seeded the database and overwrite what it seeded. Four tests in
 * `blocks.test.ts` found this: they put an old-shape profile record
 * directly and read back the current in-memory one.
 *
 * Here rather than in each file's own `beforeEach`, for the reason
 * `hydrating.ts` gives for a flag over an ordering — any future file that
 * writes through a store and then seeds the database has the same window,
 * and there is no way to see it in review.
 */
beforeEach(async () => {
  await writesSettled();
});

// No test passes without asserting anything (PLAN.md M197). The rule itself
// lives in `assertions.ts`, where it is a pure function with tests of its
// own; this is the wiring.
let assertionsBefore = 0;
beforeEach(() => {
  assertionsBefore = expect.getState().assertionCalls ?? 0;
});
afterEach((ctx) => {
  const made = (expect.getState().assertionCalls ?? 0) - assertionsBefore;
  const complaint = noAssertionMade(made, `${ctx.task.file?.name ?? '?'} > ${ctx.task.name}`);
  if (complaint !== null) throw new Error(complaint);
});
