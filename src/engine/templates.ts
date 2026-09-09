/**
 * Session templates (PLAN.md §5.2).
 *
 * "Save any completed session as a one-tap template." The question that
 * decides the shape of this is *what* gets saved, and the answer is
 * deliberately narrower than "the session":
 *
 * **A template carries the structure, never the climbs.**
 *
 * Copying six V4 sends into a fresh session pre-fills the log with things
 * that have not happened. They would sit there `completed: false` and count
 * for nothing — until the day someone taps Mark complete without reading,
 * and the log quietly stops being true. Every other decision in this app
 * runs the same way: onboarding refuses to invent sessions, the altimeter
 * refuses to grant feet, reconciliation refuses to trust an unhydrated log.
 * A template is what you intend to do; the climbs are what happened.
 *
 * What it does carry is the tedium: which program and session type, how
 * long, how hard it usually feels, whether you warm up, the drill, and the
 * exercise list — a prescription, not a claim.
 */

import type { Climb, Session, SessionMode } from '@/db/sessions';
import { newSession } from '@/db/sessions';

/** The reusable part of a session. */
export interface TemplateBody {
  mode: SessionMode;
  programId?: string;
  sessionTypeId?: string;
  trackId?: string;
  /** Typical effort, as a starting point rather than a record. */
  rpe?: number;
  durationMin?: number;
  warmup?: boolean;
  drillId?: string;
  /** Named exercises the session works through. */
  exercises?: string[];
  /** A rest day, which has a checklist instead of climbs. */
  rest?: boolean;
}

export interface Template {
  id: string;
  name: string;
  body: TemplateBody;
  /** Times applied, so the list can lead with what you actually use. */
  uses: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const MAX_TEMPLATES = 12;
export const MAX_NAME = 40;

export function isRestSession(session: Session): boolean {
  return session.restChecklist !== undefined && session.climbs.length === 0;
}

/** Everything worth keeping from a session, and nothing that was a claim. */
export function bodyFrom(session: Session): TemplateBody {
  const rest = isRestSession(session);
  return {
    mode: session.mode,
    ...(session.programId ? { programId: session.programId } : {}),
    ...(session.sessionTypeId ? { sessionTypeId: session.sessionTypeId } : {}),
    ...(session.trackId ? { trackId: session.trackId } : {}),
    ...(session.rpe !== undefined ? { rpe: session.rpe } : {}),
    ...(session.durationMin !== undefined ? { durationMin: session.durationMin } : {}),
    ...(session.warmup !== undefined ? { warmup: session.warmup } : {}),
    ...(session.drillId ? { drillId: session.drillId } : {}),
    ...(session.completedExercises?.length ? { exercises: [...session.completedExercises] } : {}),
    ...(rest ? { rest: true } : {}),
  };
}

/**
 * A name the climber will recognise without typing one. Falls back through
 * what is known: the session type, then rest, then the mode.
 */
export function suggestName(session: Session, sessionTypeName?: string): string {
  if (sessionTypeName) return sessionTypeName;
  if (isRestSession(session)) return 'Rest day';
  return session.mode === 'outdoor' ? 'Outdoor day' : 'Climbing session';
}

/** Trimmed, capped, and never empty. */
export function cleanName(raw: string, fallback = 'Session'): string {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
  return name === '' ? fallback : name;
}

export function createTemplate(session: Session, name: string, now = new Date().toISOString()): Template {
  return {
    id: `tpl-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName(name, suggestName(session)),
    body: bodyFrom(session),
    uses: 0,
    createdAt: now,
    updatedAt: now,
  };
}

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

/** Record that a template was used, for ordering. */
export function markUsed(template: Template, now = new Date().toISOString()): Template {
  return { ...template, uses: template.uses + 1, lastUsedAt: now, updatedAt: now };
}

/** Most-used first, then most-recent; unused templates keep their order. */
export function rankTemplates(templates: readonly Template[]): Template[] {
  return [...templates].sort((a, b) => {
    if (b.uses !== a.uses) return b.uses - a.uses;
    const at = a.lastUsedAt ?? a.createdAt;
    const bt = b.lastUsedAt ?? b.createdAt;
    return at < bt ? 1 : at > bt ? -1 : 0;
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
