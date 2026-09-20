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
 * How long a `findBy` waits, once (PLAN.md M299).
 *
 * Testing Library allows a second, and half the screens here are code-split
 * — Home's coach board, the logger's body, every route. What a `findBy` on
 * one of them waits for is a dynamic import, so how long it takes is a
 * property of the machine rather than of the app, and a second is the
 * budget of a machine doing nothing else.
 *
 * Three tests in `features/home` proved it, all waiting on the same chunk,
 * all passing alone and failing inside a run that had something else to do.
 * Raising it here rather than in each of them: the argument is about every
 * lazy screen in the app, not about those three. Only a test that is going
 * to fail pays the difference.
 */
if (typeof window !== 'undefined') {
  const { configure } = await import('@testing-library/dom');
  configure({ asyncUtilTimeout: 10_000 });
}

/**
 * Run the suite as any day of the week (PLAN.md M299).
 *
 * `today()` reads the clock, so a fixture that builds "this week" out of
 * `startOfWeek(today()) + 2` says one thing on a Thursday, when five days
 * of the week have happened, and another on a Sunday, when one has. Four
 * of them did, and nobody found out for two hundred milestones because the
 * suite had never been run on a Sunday.
 *
 * `ASCENT_TODAY=2026-09-20 npx vitest run` pins the clock to that day, so
 * the same suite can be run as each of the seven. Only the date moves:
 * timers are untouched, and a test that installs its own fake timers
 * starts from this instant rather than fighting it.
 */
const PINNED = process.env.ASCENT_TODAY;
if (PINNED !== undefined && PINNED !== '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(PINNED)) {
    throw new Error(`ASCENT_TODAY must be a YYYY-MM-DD date, not ${PINNED}`);
  }
  // Midday, so no timezone can drag the pinned day onto its neighbour.
  const instant = new Date(`${PINNED}T12:00:00`).getTime();
  if (Number.isNaN(instant)) throw new Error(`ASCENT_TODAY is not a real date: ${PINNED}`);
  const Real = Date;
  class Pinned extends Real {
    constructor(...args: [] | [number | string | Date] | [number, number, ...number[]]) {
      if (args.length === 0) super(instant);
      else if (args.length === 1) super(args[0]);
      else super(...(args as [number, number]));
    }
    static override now(): number {
      return instant;
    }
  }
  globalThis.Date = Pinned as unknown as DateConstructor;
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
