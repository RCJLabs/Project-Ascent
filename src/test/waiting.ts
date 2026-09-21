/**
 * A wait that is a bet on a clock (PLAN.md M304).
 *
 * `await new Promise((r) => setTimeout(r, 60))` and then an assertion that
 * something has arrived is not a wait — it is a guess about how long a
 * machine takes, written once on a quiet one. M303's push failed CI on
 * exactly that, in a file the milestone had not touched:
 *
 * ```
 * AssertionError: the launched backup never reached the preview:
 *   expected ' HomeSettingsAppearance…' to match /replace|merge/i
 * ```
 *
 * It is the M302 shape one layer up. There the finding was that a lazy
 * chunk's arrival is a property of the machine, and the fix was
 * `asyncUtilTimeout`; a hand-rolled sleep is the one wait that ignores that
 * setting entirely, which is why raising it did not help.
 *
 * `waitFor` and `findBy*` ask the question again until it is true. They cost
 * nothing when it already is, and they are bounded by the timeout the setup
 * file sets once. That is the rule.
 *
 * ## Where a duration is the subject
 *
 * Some sleeps are not waits. A test about the order two queued writes run
 * in needs one of them to take time; a test that a second effect never
 * fires has to give it a chance to; a run of the wall game is a real-time
 * thing. Those are listed below with the reason, and the list is exact —
 * an entry whose file has stopped sleeping is a stale exemption and fails
 * here, for the reason `wired.test.ts` gives about its own: a list that
 * only says "at most these" lets the next one through.
 */

/**
 * Every hand-rolled sleep, by the shape all of them take.
 *
 * `[^;{}]*` rather than `[^)]*`: the arrow's own parameter list closes a
 * parenthesis before the body starts, so a pattern that refuses to cross
 * one matches none of them. The first version did exactly that — a rule
 * that could not fire, which the round-trip test below caught before the
 * sweep above could report a clean suite it had never looked at.
 */
const SLEEP = /new Promise\([^;{}]*setTimeout\(/;

export const SLEEPS_ON_PURPOSE: Record<string, string> = {
  'src/store/writes.test.ts':
    'the sleeps are inside the queued work, which is what makes the order it runs in observable',
  'src/ui/shell.test.tsx':
    'gives a second effect that must not run its chance to run, before asserting that it did not',
  'src/features/ascent/wallShop.test.tsx':
    'a run of the wall is a real-time thing, and the wait is the run getting airborne',
  'src/features/ascent/runMarks.test.tsx':
    'samples the banner across frames, so a frame passing is the subject rather than the wait',
  'src/db/media.test.ts': 'two photos a real gap apart, so the timestamps they sort on differ',
  'src/test/waiting.test.ts':
    'holds the shape as a fixture, which is the one file that has to contain what the rule forbids',
  'src/store/hydrating.test.ts':
    'proves a write does not happen, which is a chance to give rather than a condition to wait for',
};

/**
 * The file with its comments taken out.
 *
 * A milestone that fixes one of these writes down what it replaced, and the
 * first run of this rule reported the file that says
 * *"this was `new Promise((r) => setTimeout(r, 60))`"* as an offender. Prose
 * and a source scan is the fourth time that has been the finding; the
 * privacy sweep next door strips for the same reason.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

export interface SleepingFile {
  path: string;
  source: string;
}

/**
 * The files that sleep without a reason, and the reasons that no longer
 * have a file. Both are complaints, and both are returned together so a
 * caller reports the whole state rather than the first half of it.
 */
export function unexplainedSleeps(files: readonly SleepingFile[]): {
  unexplained: string[];
  stale: string[];
} {
  const sleeping = files.filter((f) => SLEEP.test(code(f.source))).map((f) => f.path);
  return {
    unexplained: sleeping.filter((path) => !(path in SLEEPS_ON_PURPOSE)).sort(),
    stale: Object.keys(SLEEPS_ON_PURPOSE)
      .filter((path) => !sleeping.includes(path))
      .sort(),
  };
}
