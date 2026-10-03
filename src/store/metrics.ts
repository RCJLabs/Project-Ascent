import { create } from 'zustand';
import { noteDemo, tagged } from './demoPresence';
import { reportDbError } from '@/db/db';
import type { MetricId } from '@/content/types';
import {
  deleteMetricEntry,
  listMetricEntries,
  putMetricEntry,
  type MetricEntry,
} from '@/db/metrics';
import { kept } from './sameData';

/**
 * Assessment results. Flat and small — a few hundred rows over years — so
 * the whole set is held in memory and every view filters it, rather than
 * each screen inventing its own query.
 */
export interface MetricsState {
  hydrated: boolean;
  entries: MetricEntry[];
  load: () => Promise<void>;
  record: (entry: MetricEntry) => Promise<void>;
  remove: (metricId: MetricId, date: string) => Promise<void>;
  /** Take every stored bodyweight off the result it came with (PLAN.md M371). */
  dropBodyweights: () => Promise<void>;
}

export const useMetrics = create<MetricsState>((set, get) => ({
  hydrated: false,
  entries: [],

  load: async () => {
    try {
      const entries = await listMetricEntries();
      // The same answer keeps the same array (PLAN.md M360).
      set((state) => ({ entries: kept(state.entries, entries), hydrated: true }));
    } catch (error) {
      // Hydrated, because the app has to render — but the reason is kept
      // rather than swallowed, so the shell can say why the log is empty
      // instead of letting it read as a fresh install (PLAN.md M151).
      reportDbError(error);
      set({ hydrated: true });
    }
  },

  record: async (entry) => {
    await putMetricEntry(entry);
    // Same metric, same day is a correction, not a second result — the
    // store key says so, so the cache must agree.
    const rest = get().entries.filter((e) => !(e.metricId === entry.metricId && e.date === entry.date));
    set({ entries: [...rest, entry].sort((a, b) => (a.date < b.date ? -1 : 1)) });
  },

  dropBodyweights: async () => {
    // Every weight stored with a test, taken off the result it was given
    // with; the results themselves stay (PLAN.md M371).
    const weighed = get().entries.filter((e) => e.bodyweight !== undefined);
    const bare = weighed.map(({ bodyweight: _w, ...rest }) => rest);
    for (const entry of bare) await putMetricEntry(entry);
    const bareBy = new Map(bare.map((e) => [`${e.metricId}@${e.date}`, e]));
    set({ entries: get().entries.map((e) => bareBy.get(`${e.metricId}@${e.date}`) ?? e) });
  },

  remove: async (metricId, date) => {
    await deleteMetricEntry(metricId, date);
    set({ entries: get().entries.filter((e) => !(e.metricId === metricId && e.date === date)) });
  },
}));

/** Whether the metrics hold the sample climber's, for the banner (PLAN.md M353). */
useMetrics.subscribe((state, prev) => {
  if (state.entries !== prev.entries) noteDemo('metrics', tagged(state.entries));
});
