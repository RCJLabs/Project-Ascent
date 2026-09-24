/**
 * Whether a project's high point is still going up (PLAN.md M339).
 *
 * Its own module rather than a function in `projects.ts`, which is in the
 * first load for the send fold: only the coach reads this, and the coach is
 * not in the first load. In `projects.ts` it cost 0.10KB of a budget with
 * less than that to spare.
 */

import type { DayHighPoint } from './projects';

/** Sessions without a new high point before a project counts as flat (PLAN.md M339). */
export const FLAT_SESSIONS = 3;

export type HighPointTrend =
  /** No burn from the ground has a high point. */
  | { kind: 'none' }
  /** Too few sessions with one to say whether it has stopped moving. */
  | { kind: 'few'; sessions: number; high: number }
  /** A new high point in the last `FLAT_SESSIONS`, and the one before them. */
  | { kind: 'moving'; from: number; to: number }
  /** Nothing in the last `FLAT_SESSIONS` beat the best before them. */
  | { kind: 'flat'; high: number };

/**
 * The coach's burns tip said *"If it has not moved in three sessions, more
 * goes is the one lever that has already failed"* without asking — and on
 * every checkable day of the sample climber's year it had moved.
 * This is the asking. It reads `highPointByDay`, the ground-up line the
 * project page draws, so the tip and the page it links to are reading one
 * number: a session is a day with a burn from the bottom, and a burn begun
 * partway up says nothing about how far the climber gets from the ground.
 */
export function highPointTrend(byDay: readonly DayHighPoint[]): HighPointTrend {
  if (byDay.length === 0) return { kind: 'none' };
  const high = Math.max(...byDay.map((d) => d.value));
  if (byDay.length <= FLAT_SESSIONS) return { kind: 'few', sessions: byDay.length, high };
  const before = Math.max(...byDay.slice(0, -FLAT_SESSIONS).map((d) => d.value));
  return high > before ? { kind: 'moving', from: before, to: high } : { kind: 'flat', high };
}
