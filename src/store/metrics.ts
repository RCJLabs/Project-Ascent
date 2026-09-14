import { create } from 'zustand';
import { reportDbError } from '@/db/db';
import type { MetricId } from '@/content/types';
import {
  deleteMetricEntry,
  listMetricEntries,
  putMetricEntry,
  type MetricEntry,
} from '@/db/metrics';

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
}

export const useMetrics = create<MetricsState>((set, get) => ({
  hydrated: false,
  entries: [],

  load: async () => {
    try {
      set({ entries: await listMetricEntries(), hydrated: true });
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

  remove: async (metricId, date) => {
    await deleteMetricEntry(metricId, date);
    set({ entries: get().entries.filter((e) => !(e.metricId === metricId && e.date === date)) });
  },
}));
