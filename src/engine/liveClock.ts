/**
 * A live session's clock, in minutes and as a countdown (PLAN.md M345).
 *
 * Out of `live.ts`, whose live-session reading the bar at the top of every
 * page needs at boot. These two are for the log page and the rest timer.
 */

import { clockOf } from './live';

/**
 * A clock counting **down**: 0:00 only when the time is actually gone
 * (PLAN.md M266).
 *
 * The rest timer read `formatClock`, which floors. A page that re-renders
 * once a second lands each reading on a fresh clock, so most of the ladder
 * was right — but the last tick before the end is not. Whatever is left at
 * that tick floors to nothing, so the card reads `0:00` for the tail of a
 * rest that is still running: between zero and a full second of it,
 * depending only on where the tap fell against the page's tick grid.
 *
 * Ceiling is the countdown convention and the rule the interval timer
 * already follows — `engine/timer.ts` computes its own remaining seconds
 * with `Math.ceil` for both the ring and the three-second cue. `0:01` then
 * means *up to* one second, and `0:00` is reached only by arriving, which
 * for the rest timer means the card is gone. The clamp is for a clock read
 * past the end, which is a zero rather than a negative.
 */
export function formatCountdown(ms: number): string {
  return clockOf(Math.max(0, Math.ceil(ms / 1000)));
}

/**
 * Minutes to write onto the session, or undefined when the span is not
 * believable. A session left open overnight would otherwise report a
 * fourteen-hour effort straight into the training-load maths.
 */
export function durationFromSpan(ms: number): number | undefined {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1 || minutes > MAX_LOGGED_HOURS * 60) return undefined;
  return minutes;
}

/** Nobody's session is eight hours long; the clock stops claiming otherwise. */
export const MAX_LOGGED_HOURS = 8;
