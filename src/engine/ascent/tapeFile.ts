import { shortLabel } from '../dates';
import { metres, type Mode } from './game';
import { isTape, replayRun, type Tape } from './replay';

/**
 * A run as a file, so two climbers can be on the same wall (PLAN.md M219).
 *
 * ## Why this can work without a server
 *
 * The wall is seeded from the date, so everyone playing today is already on
 * the same one — what nobody could do was race the *line* someone else took
 * through it. A `Tape` is exactly that line: a seed, a mode, a tick count,
 * the inputs and the climber who played them. It is self-contained on
 * purpose, and that makes it a file.
 *
 * ## Why a forged one cannot lie
 *
 * **The height is not in the tape.** It is recomputed here by replaying the
 * inputs, so a file claiming twelve thousand metres is worth whatever its
 * inputs actually survive. The claim is carried anyway, in `metres`, and
 * checked against the replay — not because it is trusted, but because a
 * disagreement is the signature of a file that was edited or truncated, and
 * saying so is better than silently racing something else.
 *
 * The one thing a forger could reach for is the climber: a tape whose
 * modifiers say the wall never speeds up and nothing can hit them. That is
 * what `isTape`'s bounds are for, and M219 is the milestone that put them
 * there.
 *
 * ## What is in it, and what is not
 *
 * No name, no date of birth, no training log — a tape is a seed, a mode and
 * a list of lane changes. The one thing it does leak is roughly how trained
 * the sender is, because the modifiers are read off their skill trees. That
 * is the same thing the ghost has always shown by moving faster, and it is
 * said out loud on the sheet rather than left to be discovered.
 */

/** The marker, so a wrong file gives a sentence instead of a stack trace. */
export const TAPE_FORMAT = 'project-ascent/run';

/**
 * The envelope version, bumped when the *shape* changes incompatibly.
 *
 * Not the schema version in `db/schema.ts`: that one moves when the database
 * does, and a run file has no reason to stop being readable because a table
 * somewhere gained a column.
 */
export const TAPE_VERSION = 1;

export interface TapeFile {
  format: typeof TAPE_FORMAT;
  version: number;
  /** The date the run was played, for the sheet to say which wall this is. */
  date: string;
  /** What the sender's device made of it. Checked, never trusted. */
  metres: number;
  tape: Tape;
}

export function encodeTape(tape: Tape, date: string, climbed: number): string {
  const file: TapeFile = {
    format: TAPE_FORMAT,
    version: TAPE_VERSION,
    date,
    metres: climbed,
    tape,
  };
  // Two-space, because someone will open it in a text editor to see whether
  // it is safe to send, and they should be able to read the answer.
  return JSON.stringify(file, null, 2);
}

/** A filename a climber can tell apart in a downloads folder. */
export function tapeFilename(date: string, climbed: number): string {
  return `ascent-${date}-${Math.round(climbed)}m.json`;
}

/**
 * Why a file could not be raced. Note what is *not* here: a claimed height
 * that disagrees with the replay is not a refusal, because the replay is
 * the answer either way — it is reported beside the real one instead.
 */
export type TapeProblem = 'unreadable' | 'not-a-run' | 'too-new' | 'damaged';

export interface LoadedTape {
  tape: Tape;
  date: string;
  /** The height the replay produced. This is the one that counts. */
  metres: number;
  /** What the file claimed, when it differs. Null when the two agree. */
  claimed: number | null;
}

/**
 * Read a file someone sent, and say precisely what is wrong when it is not
 * one.
 *
 * Every branch returns a reason rather than null, because the sheet's job on
 * a bad file is to tell the climber whether to ask for it again or stop
 * trying — *"that is not an Ascent run"* and *"that run file is damaged"*
 * are different instructions.
 */
export function decodeTape(text: string): LoadedTape | TapeProblem {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return 'unreadable';
  }
  if (typeof parsed !== 'object' || parsed === null) return 'not-a-run';
  const file = parsed as Partial<TapeFile>;
  if (file.format !== TAPE_FORMAT) return 'not-a-run';
  if (typeof file.version !== 'number' || file.version > TAPE_VERSION) return 'too-new';
  if (typeof file.date !== 'string' || !isTape(file.tape)) return 'damaged';

  // The replay is the height. Everything above this line is the envelope.
  const played = replayRun(file.tape);
  const climbed = metres(played);
  const claimed = typeof file.metres === 'number' ? Math.round(file.metres) : null;
  if (claimed === null) return 'damaged';
  // A tape that replays to nothing is a file with an empty or truncated
  // move list, not a run anyone played.
  if (climbed <= 0) return 'damaged';
  return {
    tape: file.tape,
    date: file.date,
    metres: climbed,
    claimed: claimed === climbed ? null : claimed,
  };
}

export const TAPE_PROBLEMS: Record<TapeProblem, string> = {
  unreadable: 'That file is not readable as text the app wrote.',
  'not-a-run': 'That is not an Ascent run file.',
  'too-new': 'That run was saved by a newer version of the app.',
  damaged: 'That run file is damaged, or was edited after it was saved.',
};

/**
 * What the sheet says about a loaded run, before it is raced.
 *
 * Names the wall by its date rather than by its seed, because a seed is a
 * number nobody recognises and the date is the thing two climbers can
 * actually compare — *"this is Tuesday's wall"*.
 */
/**
 * The run a challenge starts: **their wall and their mode, your climber.**
 *
 * A function rather than two lines in the page because it is the whole of
 * the race's fairness and M219's battery could not otherwise see it — a page
 * that quietly raced on today's wall instead of theirs drew a ghost dodging
 * obstacles that were not there, and every test still passed.
 *
 * It returns no modifiers, and that is the point: the live climber is always
 * the one holding the device. Racing with the sender's stats would be racing
 * a copy of them, and the gap between the two ghosts is what the skill trees
 * are for.
 */
export function raceSetup(
  against: LoadedTape | null,
  fallback: { seed: number; mode: Mode },
): { seed: number; mode: Mode } {
  if (against === null) return fallback;
  return { seed: against.tape.seed, mode: against.tape.mode };
}

export function describeTape(loaded: LoadedTape, today: string): string {
  const wall = loaded.date === today ? "today's wall" : `the wall from ${shortLabel(loaded.date)}`;
  const mode = loaded.tape.mode === 'freesolo' ? 'Free Solo' : 'the Ascent';
  return `${mode}, on ${wall}.`;
}
