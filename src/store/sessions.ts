import { create } from 'zustand';
import { getDb, reportDbError } from '@/db/db';
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
import { MODE_REPAIR_KEY, outdoorRepairs } from '@/engine/sessionMode';

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
  /**
   * The one-time `mode` repair (PLAN.md M170). A no-op after the first run,
   * and on a log with no outdoor session types in it — which is most.
   */
  repairOutdoorModes: () => Promise<number>;
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

/**
 * The whole log as one array, the same array every time (PLAN.md M157).
 *
 * Forty-three places wrote `Object.values(byDate).flat()`, and where it sat
 * inside a component's own `useMemo` it built a **fresh array per component
 * instance** — `useMemo` is per-instance, so two components reading the same
 * store got two arrays holding the same objects.
 *
 * That is what defeated `deriveXp`'s cache, which is keyed on reference
 * identity (`engine/xp.ts`). M18 recorded that cache as making nine callers
 * cost one derivation; it made nine *renders of one component* cost one, and
 * nine components cost nine. A probe rendering two `useXp()` components got
 * two different `XpState` objects back.
 *
 * So the flattening moves here, cached on the store's own object identity.
 * The stores replace `byDate` rather than mutating it, which is what makes
 * an identity key sound — the same reasoning `deriveXp` already relies on.
 * One entry rather than a map: two different logs are never live at once.
 */
let flattened: { key: Record<string, Session[]>; value: Session[] } | null = null;

export function allSessions(byDate: Record<string, Session[]>): Session[] {
  if (flattened !== null && flattened.key === byDate) return flattened.value;
  const value = Object.values(byDate).flat();
  flattened = { key: byDate, value };
  return value;
}

/** The whole log, shared. Use this rather than flattening at the call site. */
export function useAllSessions(): Session[] {
  return allSessions(useSessions((s) => s.byDate));
}

export const useSessions = create<SessionsState>((set, get) => ({
  hydrated: false,
  byDate: {},

  load: async () => {
    try {
      set({ byDate: index(await listSessions()), hydrated: true });
    } catch (error) {
      // Hydrated, because the app has to render — but the reason is kept
      // rather than swallowed, so the shell can say why the log is empty
      // instead of letting it read as a fresh install (PLAN.md M151).
      reportDbError(error);
      set({ hydrated: true });
    }
  },

  /**
   * Fill in `mode` for sessions logged against an outdoor session type before
   * the app had any way to say so (PLAN.md M170).
   *
   * Guarded by a `meta` key rather than re-derived every boot, because once
   * the logger can set `mode`, `'indoor'` on an outdoor type is an answer the
   * climber may have given — a session on Outdoor Bouldering's type that
   * actually happened on a plastic wall. A repair that ran forever would
   * overwrite them forever.
   */
  repairOutdoorModes: async () => {
    try {
      const db = await getDb();
      if (await db.get('meta', MODE_REPAIR_KEY)) return 0;
      const repaired = outdoorRepairs(Object.values(get().byDate).flat());
      for (const session of repaired) await putSession(session);
      // After the writes, so a failure part-way leaves the flag unset and the
      // rest of the repair still to do rather than silently abandoned.
      await db.put('meta', { key: MODE_REPAIR_KEY, value: new Date().toISOString() });
      if (repaired.length > 0) {
        const byDate = { ...get().byDate };
        for (const session of repaired) {
          byDate[session.date] = (byDate[session.date] ?? []).map((s) =>
            s.id === session.id ? session : s,
          );
        }
        set({ byDate });
      }
      return repaired.length;
    } catch (error) {
      // A repair that cannot run is not a reason the app cannot start.
      reportDbError(error);
      return 0;
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
