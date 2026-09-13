/**
 * How long the prescribed work takes, read off the prescription itself
 * (PLAN.md M131).
 *
 * **Derived, not authored.** The obvious move was a `minutes` field on
 * `SessionType`, and it would have been forty numbers invented by hand for
 * sessions whose length is not the same in week one and week eleven. The
 * dose fields already say it: sets, a hold or a rep count, and a rest.
 *
 * **The dose and not the protocol, on purpose.** `ProtocolTimer` carries
 * work, rest and reps per set, so a repeater ladder could be exact rather
 * than approximate — and it was, for one draft. Reading the protocol
 * registry put it in the entry chunk, because this is read by the card on
 * the front door, and 2.3KB of prose and cues rode in with the four numbers
 * that were wanted. Measured against what it bought: five to twenty per
 * cent on the hangboard sessions, on a figure that is a range with the word
 * "about" in front of it. The dose fields are also the numbers the climber
 * is looking at while they read this, which is the better reason.
 *
 * Reading it off the prescription also means it moves with the prescription.
 * The estimate comes from the resolved `BlockPrescription[]`, so a deload
 * week is genuinely shorter than the week before it (M128), a week with its
 * own step is as long as that step asks (M127), and nothing had to be told
 * about any of it.
 *
 * **What it does not count, and says so.** Warming up, the walk to the wall,
 * the rest between burns that ends when you want to climb again. A climbing
 * day is mostly those, which is why the answer for one is usually *no
 * answer*: the estimate is offered only when the clock could read most of
 * the session, and a card with nothing to say says nothing. The sessions it
 * does answer for are the ones the question gets asked about — the
 * fingerboard day and the Engine Room, where "have I got time for this
 * tonight" has an answer and it is forty minutes.
 */

import type { Drill, Exercise, PhasePrescription } from '@/content/types';
import type { BlockPrescription } from './plan';

/** Seconds one rep takes when nothing says otherwise. */
const REP_SECONDS = 3;

/** Seconds between exercises when a block does not say. */
const BETWEEN_EXERCISES = 45;

/**
 * Below this, the prescription is an accessory rather than a session.
 *
 * Base Camp's performance day is the case that demanded it. Its only block
 * is a three-minute core circuit *after* the climbing, and the climbing
 * itself is in the description and nowhere in the data — so every line read
 * cleanly, the coverage guard was satisfied, and the app offered "about 3
 * min of work" over an evening of limit bouldering. A session the model can
 * only see a corner of looks exactly like a very short session, and the
 * only thing that tells them apart is that real sessions are not three
 * minutes long. Trip Prep's finger primer is thirteen and is genuinely the
 * whole session, so the line sits below that and both cases are pinned by
 * tests against the real catalogue.
 */
const FLOOR_MINUTES = 12;

export interface WorkEstimate {
  /** Minutes at the bottom and top of the prescribed ranges. */
  low: number;
  high: number;
  /** Prescribed lines the clock could read, out of how many there are. */
  read: number;
  lines: number;
}

/** Low and high seconds from an authored duration, or null. */
export function secondsRange(text: string | undefined): { low: number; high: number } | null {
  if (!text) return null;
  const match = /^(\d+)(?:\s*[-–]\s*(\d+))?\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)\b/i.exec(
    text.trim(),
  );
  if (!match) return null;
  const unit = /^m/i.test(match[3]!) ? 60 : 1;
  const low = Number(match[1]) * unit;
  const high = match[2] === undefined ? low : Number(match[2]) * unit;
  return low > 0 && high >= low ? { low, high } : null;
}

/** Low and high from a count like '3' or '3-5'. */
function countRange(text: string | undefined): { low: number; high: number } | null {
  if (!text) return null;
  const match = /^(\d+)(?:\s*[-–]\s*(\d+))?/.exec(text.trim());
  if (!match?.[1]) return null;
  const low = Number(match[1]);
  const high = match[2] === undefined ? low : Number(match[2]);
  return low > 0 && high >= low ? { low, high } : null;
}

/**
 * Whether a rep count is really a count of climbs.
 *
 * *5 sets of 1 burn each* parses perfectly and means nothing to a clock: a
 * burn is a minute of climbing or five, and the rest after it ends when the
 * climber wants to pull on again. Reading it as one three-second rep is how
 * a first draft reported Base Camp's performance day — nine sets of limit
 * bouldering — as **three minutes**, with every line "read" and the coverage
 * guard perfectly satisfied. A line that parses to nonsense is worse than
 * one that does not parse, so the words are checked before the numbers.
 */
function isClimbing(reps: string | undefined): boolean {
  return reps !== undefined && /burn|problem|route|boulder|lap|climb|pitch|min|hour/i.test(reps);
}

/**
 * Seconds one set of this exercise takes, low and high, or null when the
 * prescription does not say enough to know.
 *
 * A set is work plus the rest that follows it; the trailing rest is taken
 * off once, at the end, because the session is over when the last set is.
 */
function setSeconds(exercise: Exercise): { work: number; workHigh: number; rest: number; restHigh: number } | null {
  const hold = secondsRange(exercise.hold);
  const reps = hold === null && !isClimbing(exercise.reps) ? countRange(exercise.reps) : null;
  if (hold === null && reps === null) return null;

  const work = hold ? hold.low : reps!.low * REP_SECONDS;
  const workHigh = hold ? hold.high : reps!.high * REP_SECONDS;
  const rest = secondsRange(exercise.rest);
  return {
    work,
    workHigh,
    rest: rest?.low ?? BETWEEN_EXERCISES,
    restHigh: rest?.high ?? BETWEEN_EXERCISES,
  };
}

/** Seconds this exercise takes across all its sets, or null. */
function exerciseSeconds(exercise: Exercise): { low: number; high: number } | null {
  const per = setSeconds(exercise);
  if (per === null) return null;
  const sets = countRange(exercise.sets) ?? { low: 1, high: 1 };
  return {
    low: sets.low * (per.work + per.rest) - per.rest,
    high: sets.high * (per.workHigh + per.restHigh) - per.restHigh,
  };
}

/**
 * Seconds a circuit takes: rounds of every exercise in it, at the block's
 * own work and rest. A circuit that is a menu runs `pick` of its pool, which
 * is the number the logger already shows.
 */
function circuitSeconds(entry: PhasePrescription): { low: number; high: number } | null {
  const circuit = entry.circuit;
  if (!circuit) return null;
  const rounds = countRange(circuit.rounds);
  const work = secondsRange(circuit.work);
  if (rounds === null || work === null) return null;
  const steps = entry.selection?.pick ?? entry.exercises.length;
  if (steps === 0) return null;
  const between = secondsRange(circuit.restBetween)?.low ?? 0;
  const betweenRounds = secondsRange(circuit.restBetweenRounds)?.low ?? 0;
  const perRound = steps * (work.low + between) - between;
  const perRoundHigh = steps * (work.high + between) - between;
  return {
    low: rounds.low * (perRound + betweenRounds) - betweenRounds,
    high: rounds.high * (perRoundHigh + betweenRounds) - betweenRounds,
  };
}

/**
 * What the day's prescribed work comes to, or null when too little of it can
 * be read to be worth saying.
 *
 * Three quarters is the bar. Half a session's lines is not an estimate of a
 * session, and the failure mode of a low bar is the one that matters: a
 * climbing day whose only readable line is the warm-up circuit would
 * otherwise be reported as a fifteen-minute session.
 */
export function workMinutes(
  blocks: readonly BlockPrescription[],
  drill?: Drill,
): WorkEstimate | null {
  let low = 0;
  let high = 0;
  let read = 0;
  let lines = 0;

  // The drill is the day's climbing, and it is the one part of a climbing
  // session the model states a length for. Without it a drill-driven day
  // has no readable lines at all and the answer is a shrug; with it the
  // answer is the program's own number.
  if (drill) {
    lines += 1;
    const spent = secondsRange(drill.duration);
    if (spent) {
      low += spent.low;
      high += spent.high;
      read += 1;
    }
  }

  for (const block of blocks) {
    const circuit = circuitSeconds(block.entry);
    if (circuit) {
      // The circuit *is* the block: its exercises are its steps, already
      // counted in the rounds. Counting them again would double the block.
      low += circuit.low;
      high += circuit.high;
      read += block.entry.exercises.length;
      lines += block.entry.exercises.length;
      continue;
    }
    for (const exercise of block.entry.exercises) {
      lines += 1;
      const seconds = exerciseSeconds(exercise);
      if (seconds === null) continue;
      read += 1;
      low += seconds.low + BETWEEN_EXERCISES;
      high += seconds.high + BETWEEN_EXERCISES;
    }
  }

  if (lines === 0 || read / lines < 0.75) return null;
  const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));
  const estimate = { low: minutes(low), high: minutes(high), read, lines };
  return estimate.low < FLOOR_MINUTES ? null : estimate;
}

/** The estimate as one phrase, or null when there is nothing to say. */
export function describeWork(estimate: WorkEstimate | null): string | null {
  if (estimate === null) return null;
  return estimate.low === estimate.high
    ? `about ${estimate.low} min of work`
    : `about ${estimate.low}-${estimate.high} min of work`;
}
