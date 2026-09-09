/**
 * Session records (PLAN.md §3).
 *
 * One record per session, keyed `${date}#${n}` and indexed by date. The
 * prototype stored a day as *either* an object or an array of objects,
 * which forced a defensive normalisation at thirty-odd call sites
 * (AUDIT.md §8.3). Here a day is always zero or more records.
 */

import type { GradeScale } from '@/engine/grades';
import type { AttemptOutcome } from './projects';
import { getDb } from './db';

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
  /** Exercise names marked done, e.g. by finishing their protocol timer. */
  completedExercises?: string[];
  climbs: Climb[];
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

export async function listSessions(from?: string, to?: string): Promise<Session[]> {
  const db = await getDb();
  const range =
    from && to ? IDBKeyRange.bound(from, to) : from ? IDBKeyRange.lowerBound(from) : undefined;
  const rows = (await db.getAllFromIndex('sessions', 'by-date', range)) as unknown as Session[];
  return rows.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDb();
  return (await db.get('sessions', id)) as unknown as Session | undefined;
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
