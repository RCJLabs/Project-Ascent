/**
 * A circuit, on the clock (PLAN.md M99).
 *
 * ## What was authored and never ran
 *
 * `CircuitFormat` — rounds, work, rest between exercises, rest between
 * rounds — is declared on **17 blocks** across six programs and read by two
 * things, both of which only print it: `prescriptionLine` ("3 rounds · 45-60s
 * each") and the program-file parser. `timer.ts` expands a `Protocol` and
 * only a `Protocol`, so a climber running Base Camp's core circuit had the
 * whole structure on screen and counted it in their head.
 *
 * ## A circuit is a protocol's shape wearing different words
 *
 * rounds ↔ sets, exercises ↔ reps, work ↔ `workSec`, rest between ↔
 * `restSec`, rest between rounds ↔ `setRestSec`. `buildTimer`'s two awkward
 * rules land exactly right on it: the rest between exercises is dropped after
 * the last exercise of a round, because the round rest takes over, and the
 * round rest is dropped after the last round, because the circuit is over.
 * So nothing here expands anything — it translates, and `buildTimer` does the
 * work it already did.
 *
 * ## The dose is prose, and prose is read strictly or not at all
 *
 * Authored values include `'40-60s'`, `'1 min'`, `'Minimal'` and
 * `'30-60s or 8-15 reps'`. Measured across the catalogue: **9 of the 17
 * circuits carry a work time this can read**, seven declare no work time at
 * all (they are rep-based), and one is ambiguous by construction. Those eight
 * get no clock and a sentence saying why, rather than a guessed duration —
 * the rule M96 arrived at the hard way, when a loose parser turned every
 * valid height label into a rejection and a lenient one would have invented
 * numbers instead.
 *
 * **A range runs at its lower bound.** "40-60s" is a coach saying "about a
 * minute, don't be precious"; a clock has to pick one, and the bottom of the
 * range is the one that does not quietly make the session harder than it was
 * written. The prescription line above the button still says the range, so
 * what the timer chose is never the only number on screen.
 *
 * **"Minimal" is not a number and is not turned into one.** It becomes no
 * rest segment at all — the exercises run back to back, which is what
 * minimal rest means — rather than an invented ten seconds.
 */

import type { CircuitFormat, ProtocolTimer } from '@/content/types';

/**
 * Seconds from an authored duration, or null when it cannot be read.
 *
 * Deliberately a whole shape rather than a search for digits. `'30-60s or
 * 8-15 reps'` contains a perfectly good "30-60s" and is still not a duration
 * this may run: the exercise is *either* timed or counted and the program has
 * not said which, so the honest answer is that the clock does not know.
 */
export function parseDuration(text: string): number | null {
  const match = /^(\d+)(?:\s*[-–]\s*(\d+))?\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)$/i.exec(
    text.trim(),
  );
  if (!match) return null;
  const low = Number(match[1]);
  const minutes = /^m/i.test(match[3]!);
  const seconds = minutes ? low * 60 : low;
  return seconds > 0 ? seconds : null;
}

/** Rounds from an authored count, at the bottom of a range. */
export function parseRounds(text: string): number | null {
  const match = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const low = Number(match[1]);
  return low > 0 ? low : null;
}

export type CircuitPlan =
  | { ok: true; timer: ProtocolTimer; sets: number }
  | { ok: false; because: string };

/**
 * The circuit as intervals, or the reason it cannot be one.
 *
 * `steps` is how many exercises are in a round — the climber's own pick,
 * because twelve of the seventeen circuits are menus and which of the nine
 * you are doing is not something the program decided.
 */
export function circuitPlan(circuit: CircuitFormat, steps: number): CircuitPlan {
  // What the program wrote is checked before what the climber picked. The
  // other order tells someone to tick five exercises and then refuses anyway,
  // which is advice that leads nowhere — a rep-based circuit can never be a
  // countdown however many boxes are ticked.
  const rounds = parseRounds(circuit.rounds);
  if (rounds === null) {
    return { ok: false, because: `"${circuit.rounds}" is not a number of rounds the clock can count.` };
  }

  if (circuit.work === undefined) {
    return {
      ok: false,
      because: 'This circuit is counted in reps rather than timed, so there is nothing to count down.',
    };
  }
  const workSec = parseDuration(circuit.work);
  if (workSec === null) {
    return { ok: false, because: `"${circuit.work}" is not a length the clock can read.` };
  }

  if (steps < 1) {
    return { ok: false, because: 'Tick the exercises you are doing and the clock can run them.' };
  }

  return {
    ok: true,
    sets: rounds,
    timer: {
      workSec,
      // An unreadable rest is no rest rather than a guessed one.
      restSec: circuit.restBetween === undefined ? 0 : (parseDuration(circuit.restBetween) ?? 0),
      repsPerSet: steps,
      setRestSec:
        circuit.restBetweenRounds === undefined ? 0 : (parseDuration(circuit.restBetweenRounds) ?? 0),
    },
  };
}
