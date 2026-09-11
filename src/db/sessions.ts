/**
 * Session records (PLAN.md §3).
 *
 * One record per session, keyed `${date}#${n}` and indexed by date. The
 * prototype stored a day as *either* an object or an array of objects,
 * which forced a defensive normalisation at thirty-odd call sites
 * (AUDIT.md §8.3). Here a day is always zero or more records.
 */

import type { FieldId } from '@/content/types';
import type { GradeScale } from '@/engine/grades';
import type { CheckIn } from '@/engine/readiness';
import type { AttemptOutcome } from './projects';
import { getDb } from './db';
import { isDateKey } from '@/engine/dates';
import { recordReading, sound, type Shape } from './sound';

export type SessionMode = 'indoor' | 'outdoor';
export type ClimbResult = 'send' | 'attempt';
export type AscentStyle = 'onsight' | 'flash' | 'redpoint';

export interface Climb {
  id: string;
  grade: string;
  scale: GradeScale;
  count: number;
  result: ClimbResult;
  style?: AscentStyle;
  name?: string;
}

/**
 * A burn on a tracked project, recorded on the session that produced it.
 *
 * The session is the source of truth: the project's totals, high point and
 * timeline are all derived from these (engine/projects.ts). Nothing about a
 * project's history is stored twice.
 */
export interface ProjectAttempt {
  id: string;
  projectId: string;
  outcome: AttemptOutcome;
  /** Percentage of the climb reached. Absent for `worked`, which is
   *  rehearsal rather than a redpoint burn. */
  highPoint?: number;
  /**
   * Where the burn started, on the same percentage scale (PLAN.md M102).
   *
   * A redpoint is decided by *links*, not by a single number from the
   * ground: you top out from the crux, you get from the ground to the crux,
   * and the send is the join. Without this the app stored only where a burn
   * ended, so working the top half and logging "fell at the crux" reported a
   * 90% high point on a climb that had never been linked past halfway.
   *
   * Absent means the ground, for anything but `worked` — which is what every
   * burn logged before this meant, so no record changes meaning.
   */
  from?: number;
  /** Burns of this kind in this session. */
  count: number;
  note?: string;
}

export interface RestChecklist {
  hydration: boolean;
  mobility: boolean;
  zone1: boolean;
  sleep: boolean;
}

/**
 * One line of the prescription, as it was actually done (PLAN.md M98).
 *
 * Every number is optional and every one is the climber's, never the
 * program's. A prescription writes its dose in prose — `'85-90% max added
 * weight'`, `'3-5'` — and parsing that into a starting value would put a
 * number in the log that nobody ever did. The fields start empty and stay
 * empty until someone types in them.
 *
 * One row per exercise rather than one per set. "3x5, 3x5, 3x3" is a real
 * session and this cannot hold it; `note` can, in words. A per-set table is
 * a different control and a much longer logger, and the dimension the
 * programs actually ask to progress — the load — is the same on every set.
 */
export interface LoggedExercise {
  name: string;
  /** Sets completed. */
  sets?: number;
  /** Reps per set, where they were the same. */
  reps?: number;
  /**
   * Added weight, in pounds.
   *
   * Imperial for the same reason every metric is (PLAN.md M48): which unit a
   * number is stored in is invisible, and which it is shown in is a display
   * concern. Zero is bodyweight — a real answer, and different from absent.
   * Negative is assisted, which is how a climber works toward their first
   * one-arm anything.
   */
  load?: number;
  /** Hold, in seconds. */
  hold?: number;
  note?: string;
}

export interface Session {
  id: string;
  date: string;
  programId?: string;
  sessionTypeId?: string;
  trackId?: string;
  /** Placed by the plan rather than logged by hand. */
  planned: boolean;
  completed: boolean;
  /** Guards the reward pipeline against double-paying a session (M4). */
  rewarded: boolean;
  mode: SessionMode;
  rpe?: number;
  durationMin?: number;
  warmup?: boolean;
  drillId?: string;
  drillDone?: boolean;
  /**
   * What was actually done, line by line (PLAN.md M98).
   *
   * Presence is the tick: an entry here means the exercise was done, and the
   * numbers on it are optional. Before this the record was a list of names
   * and nothing else, so eleven phase goals across seven programs — "Progress
   * added load weekly", "Add load to the hangboard" — described a progression
   * the app had nowhere to write down.
   *
   * Keyed by the exercise's name, which is how `completedExercises` keyed it
   * and is the right key for a history: Weighted Pull-Ups in Iron Grip and in
   * The Siege are the same exercise and deserve one line. A content guard
   * holds the shipped catalogue to unique names within a session; a custom
   * program that repeats one shares a row, exactly as the tick always did.
   */
  exercises?: LoggedExercise[];
  /** @deprecated Folded into `exercises` on read (`migrateSession`). Never written. */
  completedExercises?: string[];
  climbs: Climb[];
  /**
   * Answers to the extra questions this session type asks (PLAN.md M70).
   *
   * Keyed by `FieldId`, and sparse: a field the climber left alone is
   * absent rather than empty, so a session never claims a zero it was not
   * given. Which fields are asked comes from the program, never from here —
   * the answers outlive a program change, which is why they are stored by
   * id rather than by position.
   */
  fields?: Partial<Record<FieldId, string | number>>;
  /**
   * The readiness check-in taken before this session (PLAN.md M72).
   *
   * Absent when it was never answered, which is most sessions: the card
   * asks and does not insist, and a skipped check-in must look different
   * from a session where everything was fine.
   */
  checkIn?: CheckIn;
  projectAttempts?: ProjectAttempt[];
  restChecklist?: RestChecklist;
  notes?: string;
  /** A planned deload week — excluded from training-load maths. */
  deload?: boolean;
  /**
   * When the session was started live, as wall-clock time. Present only for
   * sessions started on their own day; logging Tuesday on Thursday has no
   * clock to run. See engine/live.ts.
   */
  startedAt?: string;
  /** When it was marked complete. Only set alongside `startedAt`. */
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function sessionId(date: string, index: number): string {
  return `${date}#${index}`;
}

export function newSession(date: string, index: number, patch: Partial<Session> = {}): Session {
  // The date is the primary key, and it used to be whatever the URL said.
  // `/log/nope` wrote `{ id: 'nope#0', date: 'nope' }`; `/log/2026-9-1`
  // wrote a row that `/log/2026-09-01` could never find, because a second
  // spelling of a day is a second key (PLAN.md M42). The route guards this
  // now, and so does this, because a row written here is a row the calendar,
  // the streak and every derivation have to be able to read.
  if (!isDateKey(date)) {
    throw new Error(`newSession: ${JSON.stringify(date)} is not a YYYY-MM-DD date key`);
  }
  const now = new Date().toISOString();
  return {
    id: sessionId(date, index),
    date,
    planned: false,
    completed: false,
    rewarded: false,
    mode: 'indoor',
    climbs: [],
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

/**
 * What every reader of a session dereferences without checking (M44).
 *
 * `id` and `date` are the record's identity — a session without them cannot
 * be opened, edited or placed on a calendar. `climbs` is walked by the XP
 * pipeline, the grade pyramid, the altimeter and the journal, and a grade
 * with no scale is compared against the wrong ladder rather than failing.
 */
const SESSION_SHAPE: Shape = {
  needs: { id: 'string', date: 'string' },
  lists: { climbs: { id: 'string', grade: 'string', scale: 'string' } },
};

/**
 * The old tick list, promoted into the new one (PLAN.md M98).
 *
 * Every session written before M98 carries `completedExercises: string[]`
 * and no numbers. A name in that list is an exercise that was done, which is
 * exactly an entry in `exercises` with nothing filled in — so the old field
 * is read once, here, and never again.
 *
 * Only when there is nothing in `exercises` yet. A session written since
 * carries its own rows, and a stale `completedExercises` beside them must not
 * overwrite what was logged (the shape `getAscent` settled on in M96).
 */
export function migrateSession(session: Session): Session {
  const { completedExercises, ...rest } = session;
  if (rest.exercises?.length) return rest;
  if (!completedExercises?.length) return rest;
  return { ...rest, exercises: completedExercises.map((name) => ({ name })) };
}

export async function listSessions(from?: string, to?: string): Promise<Session[]> {
  const db = await getDb();
  const range =
    from && to ? IDBKeyRange.bound(from, to) : from ? IDBKeyRange.lowerBound(from) : undefined;
  const reading = sound<Session>(
    await db.getAllFromIndex('sessions', 'by-date', range),
    SESSION_SHAPE,
  );
  recordReading('sessions', reading);
  return reading.rows.map(migrateSession).sort((a, b) => (a.id < b.id ? -1 : 1));
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDb();
  const row = (await db.get('sessions', id)) as unknown as Session | undefined;
  return row === undefined ? undefined : migrateSession(row);
}

export async function putSession(session: Session): Promise<Session> {
  const db = await getDb();
  const next = { ...session, updatedAt: new Date().toISOString() };
  await db.put('sessions', next as never);
  return next;
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('sessions', id);
}

/** Next free index for a date, so two sessions on one day never collide. */
export async function nextIndex(date: string): Promise<number> {
  const existing = await listSessions(date, date);
  let i = 0;
  const taken = new Set(existing.map((s) => s.id));
  while (taken.has(sessionId(date, i))) i++;
  return i;
}
