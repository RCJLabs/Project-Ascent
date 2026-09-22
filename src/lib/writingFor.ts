/**
 * The block a coach is answering, held across one navigation (PLAN.md M322).
 *
 * M298a's sixth entry: *"M292 lets a coach read an athlete's block and keep
 * none of it. Nothing goes the other way."* The return leg is a program —
 * `programFile.ts` already sends one and `BuilderList` already opens one — so
 * what was missing was not a format but the step between the two screens: a
 * coach looking at an athlete's numbers had no way to start writing, and the
 * builder had no idea the block existed.
 *
 * ## Why this is a module slot and not a store
 *
 * `/shared` tells the coach, in its own copy, *"Nothing on this screen is
 * saved: it is here while the tab is, and none of it touches your own grades,
 * your log or your numbers."* That sentence is the best thing about M292 and
 * this milestone does not get to weaken it, so the athlete's report reaches
 * the builder the way a launched file reaches the importer — one slot, in
 * memory, gone on reload. Nothing here is written to IndexedDB, and
 * `store/index.ts` neither hydrates it nor knows it exists.
 *
 * **Not `take`, unlike `launchFile.ts`.** That one clears as it returns,
 * because importing twice is the failure it guards. This is read on every
 * render of a page the coach may sit on for an hour, so clearing on read
 * would blank the note the moment it drew. The lifetime is handled by the id
 * instead: the slot names the program it was held for, and a read for any
 * other program comes back null. Opening a different program cannot show a
 * strip about somebody else's block, and no page has to remember to clear.
 */

/** The little of an athlete's report a coach needs while writing. */
export interface WritingFor {
  /** The forked program this was held for. Any other id reads as null. */
  programId: string;
  /** The program they ran, in their app's words. */
  program: string;
  /** Their app's own sentence about the block. Carried, never recomputed. */
  summary: string;
  /**
   * The four counts, together.
   *
   * `describeBlock`'s rule, which M284 wrote and M292's card already follows:
   * *"a report that names three improvements and stays quiet about four
   * untested metrics is a highlight reel"*. Three of these without the fourth
   * would be exactly that, so they travel as a set.
   */
  better: number;
  worse: number;
  flat: number;
  untested: number;
}

let held: WritingFor | null = null;

export function holdWritingFor(block: WritingFor): void {
  held = block;
}

/** What is held for this program, or null — including for any other program. */
export function writingFor(programId: string): WritingFor | null {
  return held?.programId === programId ? held : null;
}

/** For the coach who puts the note away, and for tests. */
export function clearWritingFor(): void {
  held = null;
}
