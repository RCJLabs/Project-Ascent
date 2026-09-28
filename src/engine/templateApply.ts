/**
 * Putting a template on a day (PLAN.md M345).
 *
 * Out of `templates.ts`, which the first load needs for saving and ranking
 * them: a template is only applied, or checked for a duplicate, on the log
 * page.
 */

import { type Climb, newSession, type Session } from '@/db/sessions';
import { bodyFrom, type Template, type TemplateBody } from './templates';

/**
 * A new session for `date` from a template. Never completed and never
 * rewarded — applying a template plans a session, it does not log one.
 */
export function applyTemplate(template: Template, date: string, index: number, isToday = false): Session {
  const { body } = template;
  const climbs: Climb[] = [];
  return newSession(date, index, {
    mode: body.mode,
    planned: true,
    climbs,
    ...(body.programId ? { programId: body.programId } : {}),
    ...(body.sessionTypeId ? { sessionTypeId: body.sessionTypeId } : {}),
    ...(body.trackId ? { trackId: body.trackId } : {}),
    ...(body.rpe !== undefined ? { rpe: body.rpe } : {}),
    ...(body.durationMin !== undefined ? { durationMin: body.durationMin } : {}),
    ...(body.warmup !== undefined ? { warmup: body.warmup } : {}),
    ...(body.drillId ? { drillId: body.drillId } : {}),
    // The exercise list is a prescription; nothing is marked done yet.
    ...(body.rest
      ? { restChecklist: { hydration: false, mobility: false, zone1: false, sleep: false } }
      : {}),
    // A template applied to its own day starts the clock, same as any other
    // session started today (engine/live.ts).
    ...(isToday ? { startedAt: new Date().toISOString() } : {}),
  });
}

/**
 * True when a template already describes this session, so the UI can offer
 * to save only what is worth saving. Two sessions of the same type, program
 * and shape are the same template with a different date on it.
 */
export function alreadySaved(templates: readonly Template[], session: Session): boolean {
  const body = bodyFrom(session);
  return templates.some((t) => sameBody(t.body, body));
}

function sameBody(a: TemplateBody, b: TemplateBody): boolean {
  return (
    a.mode === b.mode &&
    a.programId === b.programId &&
    a.sessionTypeId === b.sessionTypeId &&
    a.trackId === b.trackId &&
    a.drillId === b.drillId &&
    a.rest === b.rest &&
    (a.exercises ?? []).join('|') === (b.exercises ?? []).join('|')
  );
}
