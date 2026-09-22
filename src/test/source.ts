/**
 * Reading source as source rather than as prose (PLAN.md M314).
 *
 * Six files scan the tree for something — a `fetch(` that would leave the
 * device, a field nothing reads, a sleep with no reason — and every one of
 * them had to learn the same lesson first: a sentence *about* a thing
 * matches a search *for* it. `waiting.ts` says so in its own docblock,
 * calling it *"the fourth time that has been the finding"*, and by then
 * there were seven strippers across those six files.
 *
 * They had also drifted apart. Three used `/\/\/.*$/gm`, which takes the
 * `//` out of `https://ascent.rcjlabs.com` and everything after it — so a
 * line carrying a URL lost its second half, and any rule reading that line
 * was reading a fragment. The other four guard the colon. One of each here,
 * because the difference between them is deliberate and documented.
 */

/**
 * Comments out, string literals left alone.
 *
 * The default, and the right one for a rule about *reads*: a template
 * literal carries expressions, so blanking it deletes real code.
 * `wired.test.ts` found that the hard way — `injuryLog.ts` reads
 * `history.elapsed` inside a template, and blanking templates called the
 * field dead.
 */
export function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // `[^:]` before the slashes, so `https://` keeps its second half.
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Comments and string literals both out.
 *
 * For a rule about *calls* rather than reads: `privacy.test.ts` hunts
 * `fetch(` and needs the word in a sentence, a URL and an error message all
 * to stop counting. Crude on purpose — a parser would be more correct and
 * would not change one answer.
 */
export function bare(source: string): string {
  return code(source)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}
