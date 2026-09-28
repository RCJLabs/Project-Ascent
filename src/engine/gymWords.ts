/**
 * What gym mode says: a climb's outcome, and the rest clock (PLAN.md M345).
 *
 * Out of `gym.ts`, whose tally Home's quick log needs at boot. The rest
 * timer and the tally row are drawn by lazy pages.
 */

import type { Climb } from '@/db/sessions';

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
