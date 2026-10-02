/**
 * An athlete's blocks, side by side, held in memory only (PLAN.md M362).
 *
 * A coach reading one block file sees what that block moved. Across blocks
 * is the question a coach actually has — *is the hang still climbing, or did
 * it stall when the grades started moving* — and the answer is in files the
 * coach already has. So the comparison is of open files, and it is kept
 * nowhere: keeping an athlete's blocks in the coach's own app was decided
 * against, because the screen that opens them says *"Nothing on this screen
 * is saved"* and that sentence stays true.
 *
 * What a row shows is the reading each block **ended** on, block by block,
 * oldest first. No change is computed between blocks, for the reasons
 * `blockReport.ts` gives for not computing one within a block on most
 * metrics: grades are ordinal, pass/fail is not a quantity, one metric is
 * text — and a percentage across two programs' test conditions is a number
 * nobody should act on. The readings are put next to each other and the
 * coach reads them.
 *
 * Not `blockCompare.ts`, which is the Progress page's four weeks against
 * four and has nothing to do with files.
 */

import type { MetricId } from '@/content/types';
import { labelFor, type SharedBlock, type SharedResult } from './blockFile';

/** Two years of blocks; more than that from a hand-picked folder is a sentence, not a frozen tab. */
export const MAX_OPEN_BLOCKS = 12;

export interface SeriesRow {
  metricId: MetricId;
  label: string;
  /** One per block, in the blocks' order: what it ended on, or null when it measured nothing. */
  readings: (string | null)[];
}

export interface BlockSeries {
  /** Oldest first, by the day each block ran to. */
  blocks: SharedBlock[];
  /** Metrics with a reading in at least two blocks; one reading is not a comparison. */
  rows: SeriesRow[];
}

/** The same block opened twice: same program, same days. */
export function sameBlock(a: SharedBlock, b: SharedBlock): boolean {
  return a.program === b.program && a.from === b.from && a.through === b.through;
}

/** Oldest first: by the day a block ran to, then the day it began. */
export function oldestFirst(blocks: readonly SharedBlock[]): SharedBlock[] {
  return [...blocks].sort((a, b) =>
    a.through === b.through ? a.from.localeCompare(b.from) : a.through.localeCompare(b.through),
  );
}

/** What a block ended on for one metric, in its own app's words where it gave some. */
function endedOn(result: SharedResult | undefined): string | null {
  if (result === undefined || result.gap !== null || result.latest === null) return null;
  return result.latestDisplay ?? String(result.latest);
}

export function blockSeries(blocks: readonly SharedBlock[]): BlockSeries {
  const ordered = oldestFirst(blocks);
  // Rows in the order metrics first appear, oldest block first, so a metric
  // tested since the start sits above one added later.
  const ids: MetricId[] = [];
  const labels = new Map<MetricId, string>();
  for (const block of ordered) {
    for (const result of block.results) {
      if (!labels.has(result.metricId)) {
        ids.push(result.metricId);
        labels.set(result.metricId, labelFor(result));
      }
    }
  }
  const rows = ids
    .map((metricId) => ({
      metricId,
      label: labels.get(metricId)!,
      readings: ordered.map((block) => endedOn(block.results.find((r) => r.metricId === metricId))),
    }))
    .filter((row) => row.readings.filter((r) => r !== null).length >= 2);
  return { blocks: ordered, rows };
}
