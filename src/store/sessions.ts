import { create } from 'zustand';
import {
  deleteSession,
  listSessions,
  newSession,
  nextIndex,
  putSession,
  type Session,
} from '@/db/sessions';
import { moveMediaOwner, sessionOwner } from '@/db/media';
import { mergeSessions, moveSession } from '@/engine/sessionEdit';

/**
 * Logged sessions, held in memory keyed by date so the calendar and logger
 * read them without hitting storage on every render. Writes go through
 * IndexedDB first, then update the cache, so a failed write never leaves
 * the UI claiming something was saved.
 */
export interface SessionsState {
  hydrated: boolean;
  byDate: Record<string, Session[]>;
  load: () => Promise<void>;
  create: (date: string, patch?: Partial<Session>) => Promise<Session>;
  update: (session: Session) => Promise<void>;
  remove: (session: Session) => Promise<void>;
  /** Put a deleted session back. Not `update`: that maps over the day and
   *  a record that is no longer in the list has nothing to map onto, so the
   *  write would land in the database and never reach the screen. */
  restore: (session: Session) => Promise<void>;
  /** Re-date a session. Its id encodes the date, so this is a write and a
   *  delete rather than an edit. Returns the session at its new id. */
  move: (session: Session, toDate: string) => Promise<Session>;
  /** Fuse `b` into `a`, keeping `a`'s id. */
  merge: (a: Session, b: Session) => Promise<Session>;
}

function index(sessions: Session[]): Record<string, Session[]> {
  const out: Record<string, Session[]> = {};
  for (const s of sessions) (out[s.date] ??= []).push(s);
  return out;
}

export const useSessions = create<SessionsState>((set, get) => ({
  hydrated: false,
  byDate: {},

  load: async () => {
    try {
      set({ byDate: index(await listSessions()), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  create: async (date, patch = {}) => {
    const session = newSession(date, await nextIndex(date), patch);
    const saved = await putSession(session);
    const day = [...(get().byDate[date] ?? []), saved];
    set({ byDate: { ...get().byDate, [date]: day } });
    return saved;
  },

  update: async (session) => {
    const saved = await putSession(session);
    const day = (get().byDate[session.date] ?? []).map((s) => (s.id === saved.id ? saved : s));
    set({ byDate: { ...get().byDate, [session.date]: day } });
  },

  remove: async (session) => {
    await deleteSession(session.id);
    // Photos are deliberately left behind rather than deleted with it: the
    // delete is undoable and `restore` writes the session back under the
    // same id, so the pictures are simply there again. `sweepOrphanMedia`
    // collects them at the next launch if the undo never comes.
    const day = (get().byDate[session.date] ?? []).filter((s) => s.id !== session.id);
    set({ byDate: { ...get().byDate, [session.date]: day } });
  },

  restore: async (session) => {
    const saved = await putSession(session);
    const day = [...(get().byDate[saved.date] ?? []).filter((s) => s.id !== saved.id), saved];
    // Ids carry the day and an index, so sorting by id puts a restored
    // session back where it was rather than on the end.
    day.sort((a, b) => (a.id < b.id ? -1 : 1));
    set({ byDate: { ...get().byDate, [saved.date]: day } });
  },

  move: async (session, toDate) => {
    if (toDate === session.date) return session;
    // Write first, delete second: a failure between the two leaves a
    // duplicate, which the climber can see and fix. The other order loses
    // the session outright.
    const moved = await putSession(moveSession(session, toDate, await nextIndex(toDate)));
    // The id encodes the date, so the photos are filed under a key that is
    // about to stop existing. Nothing else would ever reunite them.
    await moveMediaOwner(sessionOwner(session.id), sessionOwner(moved.id));
    await deleteSession(session.id);
    const from = (get().byDate[session.date] ?? []).filter((s) => s.id !== session.id);
    const to = [...(get().byDate[toDate] ?? []), moved];
    set({ byDate: { ...get().byDate, [session.date]: from, [toDate]: to } });
    return moved;
  },

  merge: async (a, b) => {
    const merged = await putSession(mergeSessions(a, b));
    // `b`'s id goes; its photos join `a`'s rather than going with it.
    await moveMediaOwner(sessionOwner(b.id), sessionOwner(merged.id));
    await deleteSession(b.id);
    const day = (get().byDate[a.date] ?? [])
      .filter((s) => s.id !== b.id)
      .map((s) => (s.id === merged.id ? merged : s));
    set({ byDate: { ...get().byDate, [a.date]: day } });
    return merged;
  },
}));

export function sessionsOn(byDate: Record<string, Session[]>, date: string): Session[] {
  return byDate[date] ?? [];
}
