/**
 * No test passes without asserting anything (PLAN.md M197).
 *
 * `loadTrend.test.ts` wrapped its only assertion in a condition its fixture
 * never met, so *"says 'about where it was' for a flat week"* passed for
 * nine milestones without once reading that sentence. Nothing in a suite
 * notices: a test with no assertion is indistinguishable from a test whose
 * assertions all held, and it is greener than either.
 *
 * Vitest counts every `expect` call in its own state, so the delta across a
 * test is exactly how many assertions it made. One is the floor.
 *
 * **The exemptions are tests that assert without `expect`**, which is a real
 * way to write one here and not a loophole: an awaited `findBy*` throws with
 * a better message than any assertion wrapped around it, and two of these
 * are deliberate no-ops with their reasons written where they sit. Each is
 * keyed by file and name, so renaming one fails loudly rather than quietly
 * losing its exemption — which is the correct direction for this to break.
 */
export const ASSERTS_WITHOUT_EXPECT = new Set([
  // Awaited `findByText` is the assertion: absent text throws, present text
  // is the whole claim.
  'src/features/coach/benchmarkAsk.test.tsx > counts the battery the climber was actually given',
  'src/features/home/homeLayout.test.tsx > counts a second session on the same day',
  'src/features/home/homeLayout.test.tsx > says nothing about climbs before any are entered',
  'src/features/home/homeLayout.test.tsx > says so when the session is finished',
  // Deliberately empty, with the reason at the site: no Digital Asset Links
  // statement ships until the app is on a store, and the loop is what will
  // check the first one.
  'src/ui/launch.test.ts > names this app and no other, once it names anything',
  // Routes that render nothing to go back from, exempted by name in
  // `reachable.test.ts` and checked by a test of their own there.
  'src/ui/reachable.test.ts > /gym',
  'src/ui/reachable.test.ts > /today',
]);

/**
 * The complaint a test with no assertions earns, or `null` if it has none
 * coming. A function rather than three lines in `afterEach` so the rule can
 * be tested at all: a guard that runs only inside the machinery it guards
 * has no way to show that it works.
 */
export function noAssertionMade(made: number, key: string): string | null {
  if (made > 0) return null;
  if (ASSERTS_WITHOUT_EXPECT.has(key)) return null;
  return (
    `This test asserted nothing and so cannot fail: ${key}\n` +
    'Give it an assertion, or — if it asserts by awaiting a Testing Library ' +
    'query — add it to ASSERTS_WITHOUT_EXPECT in src/test/assertions.ts with a reason.'
  );
}
