/**
 * How long each of a program's sessions runs (PLAN.md M345).
 *
 * Out of `sessionLength.ts`, whose per-session reading Home needs. Only the
 * finder asks it of a whole program.
 */

import type { Program, SessionType } from '@/content/types';
import { sessionMinutes, type WorkEstimate } from './sessionLength';

/**
 * How long each of a program's working sessions takes (PLAN.md M138).
 *
 * In week one, which is the length a climber choosing a program is asking
 * about — and a week rather than no week because a week is what resolves
 * the drill, and for seven of the shipped programs the drill *is* the
 * session's length. Asking without one reported Iron Grip's climbing day
 * as unreadable and cost the finder its "every session fits".
 *
 * `silent` is the honest half: a custom or imported program whose dose
 * says nothing gets no number, and a caller that treated silence as "fits"
 * would be guessing — so it is handed back separately and named.
 */
export function programSessionLengths(
  program: Program,
  trackId?: string,
): { known: { type: SessionType; estimate: WorkEstimate }[]; silent: SessionType[] } {
  const known: { type: SessionType; estimate: WorkEstimate }[] = [];
  const silent: SessionType[] = [];
  for (const type of program.sessionTypes) {
    if (type.isRest) continue;
    const estimate = sessionMinutes({ type, program, trackId, week: 1 });
    if (estimate) known.push({ type, estimate });
    else silent.push(type);
  }
  return { known, silent };
}
