/**
 * How a block ended, and the history in the order every screen reads it
 * (PLAN.md M85, M284).
 *
 * Out of `blocks.ts` (PLAN.md M344), which keeps the rows and the writes the
 * profile store makes at boot — opening, closing, moving a start. Reading
 * the history back is done by the Finish page, Train, the year review and
 * the finder's history, all of them lazy.
 */

import { rowWindow, type BlockRecord } from './blocks';

/**
 * Newest first, which is the order every screen wants.
 *
 * Two blocks can share a start date — switch programs the same afternoon
 * you started one — and the row written later is the later block. Nothing
 * in the record says so except its position, so the tie-break is reverse
 * insertion order rather than the id, which sorted them alphabetically and
 * put the one you had already left on top.
 */
export function sortBlocks(rows: readonly BlockRecord[]): BlockRecord[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) =>
      a.row.startDate === b.row.startDate ? b.i - a.i : a.row.startDate < b.row.startDate ? 1 : -1,
    )
    .map((d) => d.row);
}

export function findBlock(rows: readonly BlockRecord[], id: string): BlockRecord | null {
  return rows.find((r) => r.id === id) ?? null;
}

export type BlockOutcome = 'running' | 'completed' | 'left' | 'unknown';

/**
 * What each outcome is called on screen (PLAN.md M284).
 *
 * Moved here from inside `FinishPage` when the share card needed the same
 * words. Two copies of this would drift the moment one of them was reworded,
 * and a card that said "abandoned" about a block the page beside it called
 * "left early" is the shape M169 named.
 *
 * `BLOCK_` because `exerciseReadings.ts` exports an `OUTCOME_WORD` of its
 * own for a set, and the two are a genuine collision waiting for the file
 * that imports both.
 */
export const BLOCK_OUTCOME_WORD: Record<BlockOutcome, string> = {
  running: 'running',
  completed: 'ran to the end',
  left: 'left early',
  unknown: 'no record of how it ended',
};

/**
 * What became of a block.
 *
 * `completed` means the climber was still on it when its last week ran out,
 * which is the only thing the app can honestly claim — it says nothing about
 * whether they trained every week, and M85's copy is careful about that too.
 *
 * **`endedAt === null` is not the same as still running.** Nothing closes a
 * row when its weeks simply expire — the row stays open until the climber
 * starts something else — so an open row whose window has passed is a block
 * they saw to the end and have not replaced. Reading the null alone put
 * "Week 12 of 12 · running" against a block that ran out a month earlier,
 * which is the M85 fault one level up: the same clamp, in a different
 * shape.
 */
export function outcomeOf(row: BlockRecord, today: string): BlockOutcome {
  if (row.reconstructed === true) return 'unknown';
  const last = rowWindow(row).to;
  if (row.endedAt === null) return today > last ? 'completed' : 'running';
  return row.endedAt >= last ? 'completed' : 'left';
}

/** Weeks the climber actually stayed on it, rounded down, at least one. */
export function weeksRun(row: BlockRecord, today: string): number {
  const { from } = rowWindow(row);
  const until = row.endedAt ?? today;
  const days = Math.max(0, Math.round((Date.parse(until) - Date.parse(from)) / 86_400_000));
  return Math.max(1, Math.min(row.weeks, Math.floor(days / 7) + 1));
}
