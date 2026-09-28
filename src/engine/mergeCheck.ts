/**
 * What the log asks before correcting a session (PLAN.md M345).
 *
 * Out of `sessionEdit.ts`, whose moves and merges the stores run at boot:
 * whether two sessions can be merged, and how to name one in the question,
 * are only ever asked on the log page.
 */

import type { Session } from '@/db/sessions';
import { isRestSession } from './rest';

export interface MergeCheck {
  ok: boolean;
  /** Why not, in words the UI can show. */
  reason?: string;
}

/**
 * Whether two sessions describe the same day's training closely enough to be
 * one entry. A rest day and a training day are different claims about a day,
 * not two halves of one.
 */
export function canMerge(a: Session, b: Session): MergeCheck {
  if (a.id === b.id) return { ok: false, reason: 'That is the same session.' };
  if (a.date !== b.date) return { ok: false, reason: 'Only sessions on the same day can be merged.' };
  if (isRestSession(a) !== isRestSession(b)) {
    return { ok: false, reason: 'A rest day and a training session cannot be merged — they say different things about the day.' };
  }
  return { ok: true };
}

/** A short description of a session, for a picker that lists several. */
export function describeSession(session: Session, typeName?: string): string {
  if (isRestSession(session)) return 'Rest day';
  const parts: string[] = [];
  if (typeName) parts.push(typeName);
  const sends = session.climbs.reduce((n, c) => n + (c.result === 'send' ? c.count : 0), 0);
  if (sends > 0) parts.push(`${sends} send${sends === 1 ? '' : 's'}`);
  if (session.durationMin !== undefined) parts.push(`${session.durationMin} min`);
  return parts.length ? parts.join(' · ') : 'Session';
}
