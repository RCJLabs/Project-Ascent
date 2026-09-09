/**
 * Session records (PLAN.md §3).
 *
 * One record per session, keyed `${date}#${n}` and indexed by date. The
 * prototype stored a day as *either* an object or an array of objects,
 * which forced a defensive normalisation at thirty-odd call sites
 * (AUDIT.md §8.3). Here a day is always zero or more records.
 */

import type { GradeScale } from '@/engine/grades';
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
  restChecklist?: RestChecklist;
  notes?: string;
  /** A planned deload week — excluded from training-load maths. */
  deload?: boolean;
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
