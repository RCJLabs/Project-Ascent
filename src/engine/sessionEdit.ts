/**
 * Correcting a logged session (PLAN.md §5.3, M7).
 *
 * Two operations, both of which change a session's identity, and one shared
 * rule about what a correction is allowed to keep.
 *
 * A session's id encodes its date (`${date}#${n}`), so moving one is a
 * delete and a write rather than an edit. That is fine — everything the app
 * shows is derived from the sessions themselves, so a move recomputes the
 * lot. The one stored reference is `Project.sendAppliedFrom`, and
 * reconciliation already handles a changed id: it re-applies with reason
 * 'moved' and the project's send date follows the session. The idempotent
 * marker from AUDIT.md §6.14 pays for itself here.
 *
 * **The clock does not survive a correction.** `startedAt` and `endedAt` are
 * wall-clock times that were true on the day they were recorded. Moving a
 * session to another date, or fusing two of them, makes those timestamps a
 * statement about a day that did not happen. `durationMin` is kept, because
 * how long you trained is still true; the times you did it are not.
 */

import type { Session } from '@/db/sessions';
import { sessionId } from '@/db/sessions';

export interface MergeCheck {
  ok: boolean;
  /** Why not, in words the UI can show. */
  reason?: string;
}

export function isRest(session: Session): boolean {
  return session.restChecklist !== undefined && session.climbs.length === 0;
}

/** The same session on another date, with the clock dropped. */
export function moveSession(session: Session, toDate: string, index: number): Session {
  const { startedAt: _s, endedAt: _e, ...rest } = session;
  return {
    ...rest,
    id: sessionId(toDate, index),
    date: toDate,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Whether two sessions describe the same day's training closely enough to be
 * one entry. A rest day and a training day are different claims about a day,
 * not two halves of one.
 */
export function canMerge(a: Session, b: Session): MergeCheck {
  if (a.id === b.id) return { ok: false, reason: 'That is the same session.' };
  if (a.date !== b.date) return { ok: false, reason: 'Only sessions on the same day can be merged.' };
  if (isRest(a) !== isRest(b)) {
    return { ok: false, reason: 'A rest day and a training session cannot be merged — they say different things about the day.' };
  }
  return { ok: true };
}

/**
 * Fuse `b` into `a`, keeping `a`'s identity.
 *
 * Duration sums and RPE becomes the duration-weighted mean, which is not an
 * aesthetic choice: session load is RPE × hours, so those two together keep
 * the merged entry's load exactly equal to the two it replaces. A merge that
 * changed your training load would quietly rewrite the ACWR behind it.
 */
export function mergeSessions(a: Session, b: Session): Session {
  const climbs = [...a.climbs, ...b.climbs];
  const attempts = [...(a.projectAttempts ?? []), ...(b.projectAttempts ?? [])];
  const exercises = [...new Set([...(a.completedExercises ?? []), ...(b.completedExercises ?? [])])];
  const notes = [a.notes, b.notes].map((n) => n?.trim()).filter((n): n is string => Boolean(n));
  const durationMin = sumOrUndefined(a.durationMin, b.durationMin);

  const { startedAt: _s, endedAt: _e, ...base } = a;
  return {
    ...base,
    climbs,
    ...(attempts.length ? { projectAttempts: attempts } : {}),
    ...(exercises.length ? { completedExercises: exercises } : {}),
    ...(durationMin !== undefined ? { durationMin } : {}),
    ...(mergedRpe(a, b) !== undefined ? { rpe: mergedRpe(a, b) } : {}),
    ...(notes.length ? { notes: notes.join('\n\n') } : {}),
    warmup: Boolean(a.warmup || b.warmup),
    planned: a.planned || b.planned,
    mode: a.mode === 'outdoor' || b.mode === 'outdoor' ? 'outdoor' : a.mode,
    drillDone: Boolean(a.drillDone || b.drillDone),
    ...(a.restChecklist || b.restChecklist
      ? {
          restChecklist: {
            hydration: Boolean(a.restChecklist?.hydration || b.restChecklist?.hydration),
            mobility: Boolean(a.restChecklist?.mobility || b.restChecklist?.mobility),
            zone1: Boolean(a.restChecklist?.zone1 || b.restChecklist?.zone1),
            sleep: Boolean(a.restChecklist?.sleep || b.restChecklist?.sleep),
          },
        }
      : {}),
    // Merging changes what the session earned, so the total must be shown
    // again rather than carrying the old acknowledgement forward.
    completed: a.completed && b.completed,
    rewarded: false,
    updatedAt: new Date().toISOString(),
  };
}

function sumOrUndefined(a?: number, b?: number): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

/** Duration-weighted where durations exist, plain mean where they do not. */
function mergedRpe(a: Session, b: Session): number | undefined {
  if (a.rpe === undefined) return b.rpe;
  if (b.rpe === undefined) return a.rpe;
  const wa = a.durationMin ?? 0;
  const wb = b.durationMin ?? 0;
  if (wa + wb === 0) return Math.round((a.rpe + b.rpe) / 2);
  return Math.round((a.rpe * wa + b.rpe * wb) / (wa + wb));
}

/** Session load in the units engine/derive.ts uses: RPE × hours. */
export function loadOf(session: Session): number {
  if (session.rpe === undefined || session.durationMin === undefined) return 0;
  return session.rpe * (session.durationMin / 60);
}

/** A short description of a session, for a picker that lists several. */
export function describeSession(session: Session, typeName?: string): string {
  if (isRest(session)) return 'Rest day';
  const parts: string[] = [];
  if (typeName) parts.push(typeName);
  const sends = session.climbs.reduce((n, c) => n + (c.result === 'send' ? c.count : 0), 0);
  if (sends > 0) parts.push(`${sends} send${sends === 1 ? '' : 's'}`);
  if (session.durationMin !== undefined) parts.push(`${session.durationMin} min`);
  return parts.length ? parts.join(' · ') : 'Session';
}
