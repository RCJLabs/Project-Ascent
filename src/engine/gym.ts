/**
 * Gym mode: the session while you are still in it (PLAN.md M74).
 *
 * **Most of what the proposal asked for already exists.** "One-tap grade
 * tally, attempt and send" is M21, which replaced three native selects with
 * chip rows and measured the result: twenty interactions down to fifteen on
 * a typical bouldering session, with the real win in the *kind* of
 * interaction rather than the count. Rebuilding that would be rebuilding it.
 *
 * What is still wrong mid-session is everything around it. The logger is a
 * long page — check-in, climbs, session questions, project burns, the
 * prescription, the drill, the warmup, effort, notes, templates — and the
 * climb entry is one card a scroll or two down it. Between burns, with
 * chalky hands and a phone on a mat, the cost is not taps. It is finding the
 * control, hitting a 36px chip, and the screen having gone dark.
 *
 * So gym mode is the same session with everything else taken away, plus the
 * two things the full logger has no reason to carry: a rest timer that is
 * not attached to a prescribed protocol, and a screen that stays on.
 *
 * **There is no buffer.** The proposal said it "folds into a real session
 * afterwards", which implies one. `engine/live.ts` already refused the same
 * idea for the same reason: the session record is written the moment you
 * start and re-written on every change, so the buffer already exists and a
 * second one would be duplicated state wearing a new hat. Nothing folds in,
 * because nothing ever left.
 */

import type { Climb } from '@/db/sessions';
import { vEquivalent } from './grades';

/** Rest lengths worth a button. Seconds, shortest first. */
export const REST_PRESETS = [60, 90, 120, 180, 300] as const;

/**
 * How a climb went, in one word.
 *
 * The logger wrote this as an inline ternary and gym mode needed the same
 * words; a second spelling of "on-sight" is a second thing to keep in step.
 */
export function climbOutcome(climb: Climb): string {
  if (climb.result === 'attempt') return 'tried';
  if (climb.style === 'onsight') return 'on-sight';
  if (climb.style === 'flash') return 'flash';
  return 'sent';
}

/**
 * Change a row's count. A row taken to zero goes.
 *
 * **The list is deliberately not sorted, here or on screen.** Hardest-first
 * reads better on a page you are looking at; it is the wrong rule for a
 * control you tap without looking, because inserting a harder grade shifts
 * every row under your thumb. Insertion order never moves an existing row,
 * and a new one appears at the bottom — which is where you were.
 */
export function bump(climbs: readonly Climb[], id: string, by: number): Climb[] {
  const out: Climb[] = [];
  for (const climb of climbs) {
    if (climb.id !== id) {
      out.push(climb);
      continue;
    }
    const count = climb.count + by;
    if (count > 0) out.push({ ...climb, count });
  }
  return out;
}

export interface GymSummary {
  /** Every climb logged, counting repeats. */
  total: number;
  sends: number;
  attempts: number;
  /** The hardest thing actually sent, across both ladders. */
  hardest: Climb | null;
}

export function gymSummary(climbs: readonly Climb[]): GymSummary {
  let sends = 0;
  let attempts = 0;
  let hardest: Climb | null = null;
  for (const climb of climbs) {
    if (climb.result === 'attempt') {
      attempts += climb.count;
      continue;
    }
    sends += climb.count;
    // Compared on the V ladder so a boulder and a route can be weighed
    // against each other at all. An unknown grade scores -1 and never wins.
    const score = vEquivalent(climb.scale, climb.grade);
    if (score >= 0 && (hardest === null || score > vEquivalent(hardest.scale, hardest.grade))) {
      hardest = climb;
    }
  }
  return { total: sends + attempts, sends, attempts, hardest };
}

/**
 * Milliseconds left on a rest, floored at zero.
 *
 * Driven by an absolute end time rather than a decrementing counter, which is
 * the same choice `live.ts` made about `startedAt` and for the same reason: a
 * phone that sleeps stops running timers, and the rest interval does not stop
 * because the page did.
 */
export function restRemaining(endsAt: number, now: number): number {
  return Math.max(0, endsAt - now);
}

/** A preset's label: whole minutes where it is whole minutes. */
export function restLabel(seconds: number): string {
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
