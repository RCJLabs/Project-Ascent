/**
 * Where a session happened, and the logs that were never asked (PLAN.md M170).
 *
 * `Session.mode` has been `'indoor' | 'outdoor'` since M0. A dozen features
 * read it — the outdoor grade ladder (M106's two ladders), the *"N days since
 * you were on rock"* coach tip, the altimeter's outdoor height multiplier,
 * Career's whole outdoor category, the *"Get outside"* weekly challenge, the
 * first-outdoor and outdoor-onsight achievements, the consistency chart's
 * marker, the search result badge, and the `outdoor-days` objective
 * requirement.
 *
 * **Nothing in the app ever wrote it.** `newSession` defaults to `'indoor'`,
 * and the only other writers are `importCsv` (which reads a spreadsheet
 * column), `demoClimber`, `applyTemplate` (which copies whatever the source
 * session had) and `sessionEdit`'s merge (which propagates it). No control, no
 * inference, nothing. So every session logged by hand in the life of the app
 * is `'indoor'` — including one logged against Outdoor Climbing's *Outdoor
 * Bouldering*, whose whole description is *"Bouldering on real rock"*.
 *
 * Which means every one of those features has been reading a climber who has
 * never been outside, and the coach tip in particular could not fire for
 * anybody: it asks how long since the last `mode === 'outdoor'` session and
 * returns null when there has never been one.
 *
 * ## The repair, and why it is one-time
 *
 * Going forward the session type sets the mode and the logger can correct it.
 * That leaves the log already written, which this repairs once: a session
 * whose session type declares `outdoor` and whose stored mode is the default
 * is a session that was never asked, and its answer is knowable.
 *
 * **Once**, and never again on later boots, because after this milestone
 * `'indoor'` on an outdoor type is a sentence the climber may have said — a
 * bouldering session on Outdoor Climbing's type that actually happened in the
 * gym. A repair that ran every boot would overwrite them forever. The flag
 * lives in `meta`, the same write-once shape `createdWith` uses.
 */

import { getProgram } from '@/content/programs';
import type { Session } from '@/db/sessions';

/** The `meta` key that records the one-time repair as done. */
export const MODE_REPAIR_KEY = 'outdoorModeRepairedAt';

/**
 * Whether the session type this session was logged against says it happened
 * outdoors.
 *
 * Reads the declared flag, never the `outdoor_` id prefix that the five
 * shipped types happen to share: an id is a name, and a program written in
 * the builder would not follow the convention.
 */
export function typeIsOutdoor(session: Pick<Session, 'programId' | 'sessionTypeId'>): boolean {
  // No guards, and that is deliberate: both were the same check written
  // twice, and the battery showed it by surviving their deletion. A missing
  // programId becomes `''`, which the registry has no entry for; a missing
  // sessionTypeId matches no type, so `find` returns undefined. Either way
  // the optional chain arrives at `undefined` and the answer is false —
  // exactly what the guards spelled out at greater length.
  const type = getProgram(session.programId ?? '')?.sessionTypes.find(
    (t) => t.id === session.sessionTypeId,
  );
  return type?.outdoor === true;
}

/**
 * The rule, applied (PLAN.md M180).
 *
 * M170 wrote this as a **migration** and left the write path alone, which is
 * the wrong way round: a migration catches up the history once, and an
 * invariant is what keeps it true afterwards. `newSession` calls this, so
 * every path that creates a session gets the rule — the ones that existed
 * when M170 shipped and the ones written after it.
 *
 * ## Why the declaration wins over a mode already in the patch
 *
 * M170's reasoning was that `'indoor'` on an outdoor type may be a sentence
 * the climber said — a session on Outdoor Bouldering that really did happen
 * in the gym — and that is why the repair runs once and never again. At
 * *creation* there is no such sentence yet: nobody has been asked about this
 * session. Any mode arriving in the patch was copied from somewhere else,
 * and the two places it comes from are a template body snapshotted before
 * the field was ever writable, and a spreadsheet column. The spreadsheet
 * never carries a session type, so the two can never disagree; the template
 * can, and did.
 *
 * The chip in the logger is still the last word. It writes through `update`,
 * not through here.
 */
export function withDeclaredMode<T extends Pick<Session, 'programId' | 'sessionTypeId' | 'mode'>>(
  session: T,
): T {
  if (session.mode === 'outdoor' || !typeIsOutdoor(session)) return session;
  return { ...session, mode: 'outdoor' };
}

/**
 * The sessions the repair would rewrite, already rewritten.
 *
 * Returns only the changed ones, so the caller writes what it has to and no
 * more — a log of two thousand sessions with three outdoor days in it is
 * three writes, not two thousand.
 *
 * Runs the same `withDeclaredMode` the write path does rather than a second
 * copy of the filter, which is the rule `content/authored.test.ts` states for
 * its own sweeps and M173 had to apply twice in one milestone.
 */
export function outdoorRepairs(sessions: readonly Session[]): Session[] {
  return sessions.map(withDeclaredMode).filter((session, i) => session !== sessions[i]);
}
