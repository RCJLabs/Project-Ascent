/**
 * What a session is stamped with when it is started (PLAN.md M324).
 *
 * Two callers, and the reason this is a module rather than the body of a
 * hook: `PreSession`'s start buttons, which is every session a climber
 * begins, and `demoClimber`, which is every session the sample climber
 * has. Before this the generator wrote its own idea of a session and the
 * two drifted exactly the way M319 found — the sample climber claimed
 * `planned: true` with no type behind it, and never once carried the track,
 * the day's drill, the deload flag or a start time, all four of which this
 * stamps on every session a real climber starts. Nine files read those
 * fields and none of them had ever seen the fixture fill one.
 *
 * So the generator calls this now, and a field added here reaches the
 * sample climber without anyone remembering to add it there.
 *
 * Pure: the caller decides whether a clock is running, because *today* is
 * the caller's to know. `PreSession` passes the wall clock when the date is
 * today; the generator passes the evening the session happened on.
 */

import type { Session } from '@/db/sessions';
import { NO_HABITS } from './restHabits';

export interface StartInput {
  /**
   * When the clock started, or nothing.
   *
   * A clock only makes sense on the day it is ticking through — logging
   * Tuesday's session on Thursday has nothing to time — so the caller that
   * knows what today is decides.
   */
  startedAt?: string;
  programId?: string | null;
  trackId?: string;
  /** The rest day's own drill, on a day the plan leaves free (PLAN.md M164). */
  restDrill?: { id: string } | null;
}

export interface TrainingStartInput extends StartInput {
  sessionTypeId?: string;
  /** The plan's day: what it places, its drill, and whether it deloads. */
  day?: { sessionType?: unknown; drill?: { id: string }; isDeload: boolean };
}

/** A training session, from the button that starts one. */
export function trainingStart(input: TrainingStartInput): Partial<Session> {
  const { startedAt, programId, sessionTypeId, trackId, day, restDrill } = input;
  return {
    ...(startedAt ? { startedAt } : {}),
    ...(programId ? { programId } : {}),
    ...(sessionTypeId ? { sessionTypeId } : {}),
    // The mode is not set here (PLAN.md M180). It used to be, from
    // `chosen?.outdoor` — a second copy of a rule `sessionMode.ts` already
    // held, and one that only this handler applied. `newSession` reads the
    // declaration off whatever `sessionTypeId` it is given, so every way of
    // creating a session gets it and this one does not have to remember. The
    // logger can still say otherwise afterwards; a program cannot know that
    // this Tuesday was at the crag.
    ...(trackId ? { trackId } : {}),
    // The plan's drill on a training day; the rest day's own on a rest day
    // (PLAN.md M164). Stamped at the start like any other, so the editor has
    // something to tick and `drillsCompleted` can move.
    ...(day?.drill ? { drillId: day.drill.id } : restDrill ? { drillId: restDrill.id } : {}),
    ...(day?.isDeload ? { deload: true } : {}),
    // Whether the plan put a session on this date — not whether the climber
    // did the one it put there. A session moved to a free Tuesday is the
    // climber's choice and says so, which is the difference the field exists
    // to hold.
    planned: Boolean(day?.sessionType),
  };
}

/**
 * A rest day, logged as one.
 *
 * An empty checklist is what makes it one: `restChecklist` present and no
 * climbs is the app's definition of a rest day, and the editor reads the
 * same field to know which half to render.
 */
export function restStart(input: StartInput): Partial<Session> {
  const { startedAt, programId, trackId, restDrill } = input;
  return {
    ...(startedAt ? { startedAt } : {}),
    ...(programId ? { programId } : {}),
    ...(trackId ? { trackId } : {}),
    ...(restDrill ? { drillId: restDrill.id } : {}),
    restChecklist: NO_HABITS,
    planned: false,
  };
}
