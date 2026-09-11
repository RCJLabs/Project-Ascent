import { CLIMBER, TICK_MS } from './config';
import {
  NO_MODIFIERS,
  createRun,
  metres,
  step,
  type Input,
  type Mode,
  type Modifiers,
  type RunState,
} from './game';

/**
 * A run, kept as the inputs that made it (PLAN.md M81).
 *
 * `game.ts` opens by promising that "a seed plus a sequence of inputs
 * reproduces a run exactly on any device at any frame rate", and
 * `game.test.ts` has held it to that since it was written. What was missing
 * is that **nothing a climber could see ever used it**: `AscentRecords`
 * stored two numbers per mode and a daily total, no inputs, so the property
 * was proven and idle.
 *
 * ## Keyed on ticks, never on time
 *
 * `step` takes real milliseconds and simulates as many fixed ticks as they
 * buy, so a frame at 144 Hz and one at 30 Hz put the same input at different
 * wall-clock moments and the same tick. A tape keyed on `performance.now()`
 * would replay a different run on a different device, which is the exact
 * failure the fixed tick exists to prevent.
 *
 * ## Only the changes
 *
 * A three-minute run is about twenty-two thousand ticks and perhaps two
 * hundred lane changes. Storing an input per tick would be a hundred times
 * the bytes to say "nothing happened" over and over, so the tape is pairs:
 * the tick, and what was pressed at it.
 *
 * ## Self-contained
 *
 * The tape carries the modifiers the run was played with, rather than
 * reading today's off the climber. A run recorded this morning and replayed
 * tonight would otherwise be played by a different climber — an afternoon
 * session moves END, END trims the speed ramp, and the ghost would drift
 * away from the height it is supposed to be showing.
 */

/** `[tick, input, tick, input, …]`. Flat, because it is stored as JSON. */
export type Moves = number[];

export interface Tape {
  seed: number;
  mode: Mode;
  /** Ticks the run lasted, so a replay knows when to stop. */
  ticks: number;
  moves: Moves;
  /** The climber who played it. See "Self-contained" above. */
  modifiers: Modifiers;
}

/**
 * A ceiling on a tape, in lane changes.
 *
 * Two thousand is far past any real run — a lane change takes tens of ticks
 * to complete, so a player cannot make more than a few hundred in a good
 * one. It is here because the tape is written from live input and a stuck
 * key should cost a bounded number of bytes rather than an unbounded one.
 */
export const MAX_MOVES = 2_000;

/**
 * A ceiling on how long a tape may claim to be, in ticks.
 *
 * Two and a half hours at 120 ticks a second, which no run of this game
 * reaches. It is a validation bound rather than a limit on play: `replayRun`
 * simulates `tape.ticks` ticks one at a time, so a restored backup claiming
 * two billion of them would lock the tab in a loop that nothing interrupts.
 */
export const MAX_TICKS = 1_000_000;

/** Collects a tape while a run is played. */
export class Recorder {
  private readonly moves: Moves = [];
  private full = false;

  constructor(
    readonly seed: number,
    readonly mode: Mode,
    readonly modifiers: Modifiers = NO_MODIFIERS,
  ) {}

  /**
   * Note an input, at the tick count the run is *about to* simulate.
   *
   * Called with the state before `step`, because that is when the input is
   * handed over: `step` sets `pendingInput` and the next tick consumes it —
   * or a later one, if a lane change is still in progress. Recording the
   * tick that eventually consumed it would be recording the engine's own
   * decision back at itself, and would replay differently the moment that
   * decision changed.
   */
  at(ticks: number, input: Input): void {
    if (input === 0 || this.full) return;

    const last = this.moves.length - 2;
    if (last >= 0 && this.moves[last] === ticks) {
      // Several frames can land inside one tick — at 144 Hz most of them do
      // — and the engine keeps only the last of their inputs, because `step`
      // overwrites `pendingInput` and no tick has run in between to consume
      // it. Storing every frame would replay identically and cost bytes in
      // proportion to the player's refresh rate.
      this.moves[last + 1] = input;
      return;
    }

    if (this.moves.length >= MAX_MOVES * 2) {
      this.full = true;
      return;
    }
    this.moves.push(ticks, input);
  }

  /** The tape for a finished run. */
  take(state: RunState): Tape {
    return {
      seed: this.seed,
      mode: this.mode,
      ticks: state.ticks,
      moves: [...this.moves],
      modifiers: { ...this.modifiers },
    };
  }
}

/** Whether a tape is a tape — a stored one arrives from a backup file. */
export function isTape(value: unknown): value is Tape {
  if (typeof value !== 'object' || value === null) return false;
  const tape = value as Partial<Tape>;
  return (
    typeof tape.seed === 'number' &&
    (tape.mode === 'ascent' || tape.mode === 'freesolo') &&
    typeof tape.ticks === 'number' &&
    Number.isInteger(tape.ticks) &&
    tape.ticks >= 0 &&
    tape.ticks <= MAX_TICKS &&
    Array.isArray(tape.moves) &&
    tape.moves.length % 2 === 0 &&
    tape.moves.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    isModifiers(tape.modifiers)
  );
}

function isModifiers(value: unknown): value is Modifiers {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Partial<Modifiers>;
  return (
    typeof m.rampReduction === 'number' &&
    typeof m.hitboxTrim === 'number' &&
    typeof m.chalkSaves === 'number' &&
    typeof m.laneTrim === 'number' &&
    typeof m.coinMultiplier === 'number' &&
    typeof m.startWithSlowmo === 'boolean'
  );
}

/**
 * The input a tape calls for at a given tick, and where to look next.
 *
 * A cursor rather than a search: a ghost is stepped once per tick beside a
 * live run, and scanning the whole tape sixty times a second to find out
 * that nothing happens is work for nothing.
 */
export function inputAt(tape: Tape, tick: number, cursor: number): { input: Input; cursor: number } {
  let next = cursor;
  let input: Input = 0;
  while (next < tape.moves.length && tape.moves[next]! <= tick) {
    // A tape entry for a tick already passed is applied on the way through
    // rather than skipped: a replay driven at a coarser step would otherwise
    // drop inputs and diverge.
    input = clampInput(tape.moves[next + 1]!);
    next += 2;
  }
  return { input, cursor: next };
}

function clampInput(value: number): Input {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

export interface ReplayOptions {
  /** Stop early, for a ghost that only needs to be as far as the live run. */
  untilTick?: number;
}

/**
 * Play a tape back, one tick at a time.
 *
 * `step(state, TICK_MS)` simulates exactly one tick — the accumulator takes
 * the whole of it — so driving the replay this way is what makes the tick
 * index in the tape mean what it meant when it was written.
 */
export function replayRun(tape: Tape, options: ReplayOptions = {}): RunState {
  const state = createRun({ seed: tape.seed, mode: tape.mode, modifiers: tape.modifiers });
  const last = Math.min(tape.ticks, options.untilTick ?? tape.ticks);
  let cursor = 0;
  while (state.ticks < last && !state.over) {
    const found = inputAt(tape, state.ticks, cursor);
    cursor = found.cursor;
    step(state, TICK_MS, found.input);
  }
  return state;
}

/**
 * A ghost, advanced beside a live run.
 *
 * Held in its own object rather than re-replayed each frame: replaying
 * twenty thousand ticks sixty times a second to draw one climber is the
 * obvious wrong way round.
 */
export interface Ghost {
  state: RunState;
  tape: Tape;
  cursor: number;
}

export function createGhost(tape: Tape): Ghost {
  return {
    state: createRun({ seed: tape.seed, mode: tape.mode, modifiers: tape.modifiers }),
    tape,
    cursor: 0,
  };
}

/**
 * Bring a ghost up to the tick the live run has reached.
 *
 * Both bounds are here for a tape that disagrees with its own run, which a
 * restored backup can hold and an honest recording never does. `tape.ticks`
 * stops a ghost drifting up a wall it has no inputs for; `over` stops the
 * loop outright when the replay crashes early, because `step` on a finished
 * run simulates nothing and the tick count would never reach the bound.
 */
export function advanceGhost(ghost: Ghost, toTick: number): void {
  const last = Math.min(toTick, ghost.tape.ticks);
  while (ghost.state.ticks < last && !ghost.state.over) {
    const found = inputAt(ghost.tape, ghost.state.ticks, ghost.cursor);
    ghost.cursor = found.cursor;
    step(ghost.state, TICK_MS, found.input);
  }
}

/**
 * Where a ghost sits on screen, with the live climber fixed at `CLIMBER.y`.
 *
 * The same arithmetic `screenY` does for an obstacle, because a ghost is
 * exactly that from the live run's point of view: something at a world
 * height that is not yours. Ahead means a smaller y — the wall scrolls
 * down, so further up the climb is further up the screen.
 */
export function ghostY(live: RunState, ghost: RunState): number {
  return CLIMBER.y - (ghost.distance - live.distance);
}

/** How far ahead the ghost is, in metres. Negative when it is behind. */
export function ghostGap(live: RunState, ghost: RunState): number {
  return metres(ghost) - metres(live);
}

/** What the store keeps for the day's best, as far as a race cares. */
export interface DailyRecord {
  date: string;
  tape?: Tape | undefined;
}

/**
 * The tape worth racing, or null.
 *
 * Four things have to line up, and each of them is a way the ghost could
 * otherwise be a lie:
 *
 * - **The day.** Yesterday's best was climbed on yesterday's wall.
 * - **The seed.** Belt and braces for the tab left open past midnight: the
 *   wall is memoised at mount, so a run begun at 23:58 is still on
 *   yesterday's pattern while the date has already turned over.
 * - **The mode.** Free Solo is thirty per cent faster. A ghost from the
 *   other mode is not a pace you are racing, it is a pace you cannot hold.
 *   Asked of the tape and not of the record around it: the tape is what
 *   gets replayed, and a check on the record as well was a second reading
 *   of the same fact that no test could tell from its absence.
 * - **The tape itself**, because it comes back out of IndexedDB and a
 *   restored backup can hold anything.
 */
export function tapeToRace(
  daily: DailyRecord | null | undefined,
  now: { date: string; mode: Mode; seed: number },
): Tape | null {
  if (!daily || daily.date !== now.date) return null;
  const tape = daily.tape;
  if (!isTape(tape) || tape.seed !== now.seed || tape.mode !== now.mode) return null;
  return tape;
}
