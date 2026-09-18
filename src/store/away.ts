import { create } from 'zustand';
import { getDb, reportDbError } from '@/db/db';
import { type AwayPeriod, isAwayPeriod } from '@/engine/away';

/**
 * Stretches the climber was away, under one key in the `profile` store — the
 * same shape as the objectives beside it (PLAN.md M275). There are never many:
 * this is a handful of ranges a year, not a record per day.
 */
export interface AwayState {
  hydrated: boolean;
  periods: AwayPeriod[];
  load: () => Promise<void>;
  save: (period: AwayPeriod) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const KEY = 'away';

async function persist(periods: AwayPeriod[]): Promise<void> {
  const db = await getDb();
  await db.put('profile', { key: KEY, value: periods });
}

/** Newest first, which is the order a list of them is read in. */
function ordered(periods: AwayPeriod[]): AwayPeriod[] {
  return [...periods].sort((a, b) => b.from.localeCompare(a.from));
}

export const useAway = create<AwayState>((set, get) => ({
  hydrated: false,
  periods: [],

  load: async () => {
    try {
      const db = await getDb();
      const record = await db.get('profile', KEY);
      const value = record?.value;
      // Filtered on the way in rather than trusted, because a malformed range
      // reads as covering nothing or everything and either one is a wrong
      // sentence on the coach card. `isAwayPeriod` holds the rule.
      set({
        periods: ordered(Array.isArray(value) ? value.filter(isAwayPeriod) : []),
        hydrated: true,
      });
    } catch (error) {
      // Hydrated, because the app has to render — but the reason is kept
      // rather than swallowed (PLAN.md M151).
      reportDbError(error);
      set({ hydrated: true });
    }
  },

  save: async (period) => {
    const next = ordered([
      ...get().periods.filter((p) => p.id !== period.id),
      { ...period, updatedAt: new Date().toISOString() },
    ]);
    await persist(next);
    set({ periods: next });
  },

  remove: async (id) => {
    const next = get().periods.filter((p) => p.id !== id);
    await persist(next);
    set({ periods: next });
  },
}));
