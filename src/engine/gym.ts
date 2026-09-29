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
