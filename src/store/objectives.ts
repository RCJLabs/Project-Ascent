import { create } from 'zustand';
import { getDb } from '@/db';
import type { Objective } from '@/engine/objectives';

/**
 * Season-scale goals, under one key in the `profile` store — the same shape
 * as the active plan and the session templates. There are never many.
 */
export interface ObjectivesState {
  hydrated: boolean;
  objectives: Objective[];
  load: () => Promise<void>;
  save: (objective: Objective) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const KEY = 'objectives';

async function persist(objectives: Objective[]): Promise<void> {
  const db = await getDb();
  await db.put('profile', { key: KEY, value: objectives });
}

export const useObjectives = create<ObjectivesState>((set, get) => ({
  hydrated: false,
  objectives: [],

  load: async () => {
    try {
      const db = await getDb();
      const record = await db.get('profile', KEY);
      const value = record?.value;
      set({ objectives: Array.isArray(value) ? (value as Objective[]) : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  save: async (objective) => {
    const next = [
      ...get().objectives.filter((o) => o.id !== objective.id),
      { ...objective, updatedAt: new Date().toISOString() },
    ];
    await persist(next);
    set({ objectives: next });
  },

  remove: async (id) => {
    const next = get().objectives.filter((o) => o.id !== id);
    await persist(next);
    set({ objectives: next });
  },
}));
