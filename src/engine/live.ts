/**
 * Live sessions (PLAN.md §5.2).
 *
 * PLAN.md describes this as a mode with its own persisted buffer. It does not
 * need one. A session record is written the moment you start it and re-written
 * on every change, so the buffer already exists — a second one would be the
 * duplicated-state mistake from AUDIT.md §8.3 wearing a new hat.
 *
 * What was actually missing is time. Two timestamps on the session give the
 * clock, the auto-filled duration, and the stale-session recovery, and
 * everything else here is derived from them.
 *
 * `startedAt` is wall-clock rather than an accumulating counter on purpose: a
 * sleeping phone stops running timers, but a session that began at 18:04 still
 * began at 18:04.
 */

import { today } from './dates';
import type { Session } from '@/db/sessions';

/** Past this, an open session is assumed to have been left open. */
export const STALE_HOURS = 5;

/** Nobody's session is eight hours long; the clock stops claiming otherwise. */
export const MAX_LOGGED_HOURS = 8;

export function isLive(session: Session): boolean {
  return Boolean(session.startedAt) && !session.completed;
}

export function elapsedMs(session: Session, now = Date.now()): number {
  if (!session.startedAt) return 0;
  const end = session.endedAt ? Date.parse(session.endedAt) : now;
  return Math.max(0, end - Date.parse(session.startedAt));
}

/** h:mm:ss once past an hour, m:ss before it. */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** The same span in the words a summary wants. */
export function describeSpan(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
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

export function isStale(session: Session, now = Date.now()): boolean {
  if (!isLive(session)) return false;
  return session.date !== today() || elapsedMs(session, now) > STALE_HOURS * 3600_000;
}

/**
 * The session the app should be showing a running clock for: live, on today,
 * and not yet stale. At most one — the newest, if a day somehow holds two.
 */
export function runningSession(sessions: readonly Session[], now = Date.now()): Session | undefined {
  return sessions
    .filter((s) => isLive(s) && !isStale(s, now))
    .sort((a, b) => (a.startedAt! < b.startedAt! ? 1 : -1))[0];
}

/** Open sessions that have outlived their session, oldest first. */
export function staleSessions(sessions: readonly Session[], now = Date.now()): Session[] {
  return sessions
    .filter((s) => isStale(s, now))
    .sort((a, b) => (a.startedAt! < b.startedAt! ? -1 : 1));
}
