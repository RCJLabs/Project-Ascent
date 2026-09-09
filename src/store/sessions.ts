import { create } from 'zustand';
import {
  deleteSession,
  listSessions,
  newSession,
  nextIndex,
  putSession,
  type Session,
} from '@/db/sessions';

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
    const day = (get().byDate[session.date] ?? []).filter((s) => s.id !== session.id);
    set({ byDate: { ...get().byDate, [session.date]: day } });
  },
}));

export function sessionsOn(byDate: Record<string, Session[]>, date: string): Session[] {
  return byDate[date] ?? [];
}
