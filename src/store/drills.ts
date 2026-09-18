import { create } from 'zustand';
import { getDb, reportDbError } from '@/db/db';
import { registerCustomDrills } from '@/content/drills';
import type { Drill, DrillId } from '@/content/types';
import { isCustomDrill } from '@/engine/customDrill';

/**
 * Drills the climber wrote (PLAN.md M286).
 *
 * Under one key in the `profile` store, beside the objectives and the away
 * markers — **not a new object store**. A climber writes a handful, not a
 * table of them, and the profile key rides the backup for free: M275 measured
 * that, and `exportImport` carries the whole store by key without learning
 * anything. A new store would have meant a schema version and a migration for
 * a few rows.
 *
 * Two things are kept in step on every change, which is `store/programs.ts`
 * verbatim: this store, which components subscribe to, and the content
 * registry, which `getDrill` reads. The registry is what lets a written drill
 * work in the pure engines and at the six call sites on the first-paint path;
 * the store is what makes React notice.
 */
export interface DrillsState {
  hydrated: boolean;
  custom: Drill[];
  load: () => Promise<void>;
  save: (drill: Drill) => Promise<void>;
  remove: (id: DrillId) => Promise<void>;
}

const KEY = 'drills';

function sync(custom: Drill[]): Drill[] {
  registerCustomDrills(custom);
  return custom;
}

async function persist(drills: Drill[]): Promise<void> {
  const db = await getDb();
  await db.put('profile', { key: KEY, value: drills });
}

/**
 * A stored value the app did not write.
 *
 * Guarded rather than trusted, for the reason `away.ts` gives: this comes back
 * out of IndexedDB, where an older schema or a hand-edited backup can put
 * anything, and a drill with no id would answer `getDrill(undefined)`.
 */
function readable(value: unknown): Drill[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Drill => {
    if (typeof row !== 'object' || row === null) return false;
    const drill = row as Partial<Drill>;
    return typeof drill.id === 'string' && isCustomDrill(drill.id) && typeof drill.name === 'string';
  });
}

const byName = (a: Drill, b: Drill) => a.name.localeCompare(b.name);

export const useCustomDrills = create<DrillsState>((set, get) => ({
  hydrated: false,
  custom: [],

  load: async () => {
    try {
      const db = await getDb();
      const record = await db.get('profile', KEY);
      set({ custom: sync(readable(record?.value).sort(byName)), hydrated: true });
    } catch (error) {
      // Hydrated, because the app has to render — but the reason is kept
      // rather than swallowed (PLAN.md M151).
      reportDbError(error);
      set({ hydrated: true });
    }
  },

  save: async (drill) => {
    const next = [...get().custom.filter((d) => d.id !== drill.id), drill].sort(byName);
    await persist(next);
    set({ custom: sync(next) });
  },

  remove: async (id) => {
    const next = get().custom.filter((d) => d.id !== id);
    await persist(next);
    set({ custom: sync(next) });
  },
}));
