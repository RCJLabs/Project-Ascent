/**
 * Assessment results (PLAN.md §4.7).
 *
 * Keyed `[metricId, date]`, so one result per metric per day and a retest
 * on the same day overwrites rather than duplicating. The prototype keyed
 * results by `${programId}-${phaseIndex}-${metricIndex}`, which silently
 * reassigned old values whenever a program's assessment list was edited
 * (AUDIT.md §8.4); a global metric id is immune to that.
 *
 * `value` is always numeric so every metric charts the same way:
 *
 * | kind     | value               | display              |
 * |----------|---------------------|----------------------|
 * | number   | the number          | —                    |
 * | passfail | 1 or 0              | 'Pass' / 'Fail'      |
 * | grade    | ordinal on its ladder | canonical grade    |
 * | text     | 0 (never charted)   | what you typed       |
 */

import type { MetricId } from '@/content/types';
import { getDb } from './db';
import { recordReading, sound, type Shape } from './sound';

export interface MetricEntry {
  metricId: MetricId;
  date: string;
  value: number;
  /** Human form, when the number alone is not the answer. */
  display?: string;
  note?: string;
}

/** A benchmark is its metric, its day and its number; charts plot all three. */
const METRIC_SHAPE: Shape = {
  needs: { metricId: 'string', date: 'string', value: 'number' },
};

export async function listMetricEntries(): Promise<MetricEntry[]> {
  const db = await getDb();
  const reading = sound<MetricEntry>(await db.getAll('metrics'), METRIC_SHAPE);
  recordReading('metrics', reading);
  return reading.rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function putMetricEntry(entry: MetricEntry): Promise<MetricEntry> {
  const db = await getDb();
  await db.put('metrics', entry as never);
  return entry;
}

export async function deleteMetricEntry(metricId: MetricId, date: string): Promise<void> {
  const db = await getDb();
  await db.delete('metrics', [metricId, date]);
}
