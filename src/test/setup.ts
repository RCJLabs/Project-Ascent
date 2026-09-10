// Vitest runs in node; give the db layer a real-enough IndexedDB.
import 'fake-indexeddb/auto';

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
