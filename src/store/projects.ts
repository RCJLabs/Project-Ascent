import { create } from 'zustand';
import { getDb } from '@/db';
import {
  deleteProject,
  listProjects,
  newProject,
  putProject,
  type Project,
} from '@/db/projects';
import { applyPatch, reconcileProjects } from '@/engine/projects';
import { useSessions } from './sessions';

const DISMISSED_KEY = 'project-suggestions';

export interface ProjectsState {
  hydrated: boolean;
  projects: Project[];
  /** Case-folded names the climber has told us not to suggest again. */
  dismissed: string[];
  load: () => Promise<void>;
  create: (patch: Parameters<typeof newProject>[0]) => Promise<Project>;
  update: (project: Project) => Promise<void>;
  remove: (id: string) => Promise<void>;
  dismiss: (key: string) => Promise<void>;
  /** Fold session sends into projects. Idempotent — safe to call on every
   *  session write, which is exactly what the subscription below does. */
  reconcile: () => Promise<void>;
}

async function saveDismissed(keys: string[]): Promise<void> {
  const db = await getDb();
  await db.put('profile', { key: DISMISSED_KEY, value: keys });
}

export const useProjects = create<ProjectsState>((set, get) => ({
  hydrated: false,
  projects: [],
  dismissed: [],

  load: async () => {
    try {
      const [projects, db] = await Promise.all([listProjects(), getDb()]);
      const record = await db.get('profile', DISMISSED_KEY);
      set({ projects, dismissed: (record?.value as string[] | undefined) ?? [], hydrated: true });
      await get().reconcile();
    } catch {
      set({ hydrated: true });
    }
  },

  create: async (patch) => {
    const saved = await putProject(newProject(patch));
    set({ projects: [saved, ...get().projects] });
    return saved;
  },

  update: async (project) => {
    const saved = await putProject(project);
    set({ projects: get().projects.map((p) => (p.id === saved.id ? saved : p)) });
  },

  remove: async (id) => {
    await deleteProject(id);
    set({ projects: get().projects.filter((p) => p.id !== id) });
  },

  dismiss: async (key) => {
    const next = [...new Set([...get().dismissed, key])];
    set({ dismissed: next });
    await saveDismissed(next);
  },

  reconcile: async () => {
    const { projects } = get();
    const sessions = useSessions.getState();
    // Never reconcile against sessions that have not loaded: an empty log
    // looks exactly like every send having been deleted, and would retract
    // them all on the first paint.
    if (projects.length === 0 || !sessions.hydrated) return;
    const rows = Object.values(sessions.byDate).flat();
    const patches = reconcileProjects(projects, rows);
    if (patches.length === 0) return;

    const byId = new Map(patches.map((p) => [p.id, p]));
    const next = await Promise.all(
      projects.map(async (p) => {
        const patch = byId.get(p.id);
        return patch ? putProject(applyPatch(p, patch)) : p;
      }),
    );
    set({ projects: next });
  },
}));

/**
 * Reconciliation runs on every session write rather than at call sites.
 *
 * The prototype recomputed project state from ~5 places and disagreed with
 * itself (AUDIT.md §3). One subscription means a send logged anywhere —
 * the logger, an import, a future live-session mode — lands the same way,
 * and cannot be forgotten by whoever adds the next entry point.
 */
useSessions.subscribe((state, prev) => {
  if (state.byDate !== prev.byDate && useProjects.getState().hydrated) {
    void useProjects.getState().reconcile();
  }
});
