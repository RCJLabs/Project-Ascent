/**
 * The blocks a climber has actually run (PLAN.md M87).
 *
 * Until now the app kept `profile.startDates`: **one date per program**. That
 * shape cannot hold a training history, and loses two different things in
 * two different ways.
 *
 * - **A restart overwrites it.** `startProgram(id, …, restart)` writes
 *   `today()` over the existing entry, so running Iron Grip a second time
 *   erases the first run outright.
 * - **A switch strands it.** The old program's date survives in the record,
 *   and nothing can reach it: every screen that reads a block reads
 *   `activeProgramId`, so the block you finished last week becomes
 *   invisible the moment you start the next one.
 *
 * So a block is written down when it opens and closed when it stops being
 * the one you are running.
 *
 * ## Why this stores what it could derive
 *
 * `name` and `weeks` are snapshots, against the house rule. The past is not
 * derivable from the present here: a custom program can be edited or
 * deleted, and M56's length adaptation is a single current value per
 * program — so a block you ran over eight weeks would silently become
 * twelve the day you started the same program at its written length. What
 * the block *was* has to be written down at the time.
 *
 * ## Why `endedAt` is not the end of the window
 *
 * The window is derivable and always has been (`plan.blockWindow`). What is
 * not derivable is whether the climber stayed. A block abandoned in week six
 * and a block run to its last day have identical windows, and telling them
 * apart is most of the value of keeping a history at all.
 */

import type { Program } from '@/content/types';
import { addDays, startOfWeek } from './dates';

/** Why a block stopped being the one you are running. */
export type BlockEndReason = 'ran-out' | 'switched' | 'restarted' | 'stopped';

export interface BlockRecord {
  /** `programId#startDate`. Stable, and unique unless a program is started
   *  twice on one day — which the open/close rules below prevent. */
  id: string;
  programId: string;
  /** The program's name when it ran. See the note above. */
  name: string;
  startDate: string;
  /** Weeks it was set to run, adaptation included. */
  weeks: number;
  trackId?: string;
  /** The day it stopped being the active program. Null while it still is. */
  endedAt: string | null;
  reason?: BlockEndReason;
  /**
   * The row was reconstructed from `startDates` rather than recorded live.
   *
   * Set by the migration, and worth carrying: for a reconstructed row the
   * app knows when the block began and has no idea whether the climber saw
   * it through, so no screen should imply that it does.
   */
  reconstructed?: boolean;
}

export function blockId(programId: string, startDate: string): string {
  return `${programId}#${startDate}`;
}

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

/**
 * The one still running, if any.
 *
 * No sort: `openBlock` closes whatever was open before it writes, so there
 * is never more than one to choose between — and the rule is held at the
 * write side, where it can be. Sorting here was a second answer to a
 * question that has only one, and no mutation could kill it.
 */
export function activeBlock(rows: readonly BlockRecord[]): BlockRecord | null {
  return rows.find((r) => r.endedAt === null) ?? null;
}

export function findBlock(rows: readonly BlockRecord[], id: string): BlockRecord | null {
  return rows.find((r) => r.id === id) ?? null;
}

/**
 * Close whatever is open, and open a row for the block starting today.
 *
 * One function rather than an open and a close, because every transition
 * that opens a block also ends one: starting a different program, restarting
 * the same one, or picking one up again after stopping. Leaving two rows
 * open is the failure this shape exists to make impossible.
 */
export function openBlock(
  rows: readonly BlockRecord[],
  entry: { program: Program; startDate: string; trackId?: string | undefined },
  today: string,
): BlockRecord[] {
  const open = activeBlock(rows);
  const reason: BlockEndReason =
    open === null ? 'stopped' : open.programId === entry.program.id ? 'restarted' : 'switched';
  const closed = open === null ? [...rows] : closeBlock(rows, today, reason);

  const row: BlockRecord = {
    id: blockId(entry.program.id, entry.startDate),
    programId: entry.program.id,
    name: entry.program.name,
    startDate: entry.startDate,
    weeks: entry.program.weeks,
    ...(entry.trackId ? { trackId: entry.trackId } : {}),
    endedAt: null,
  };
  // A row with this id already exists when a program is started twice on one
  // day — the second start replaces the first rather than adding a duplicate
  // the history would show as two blocks.
  return [...closed.filter((r) => r.id !== row.id), row];
}

/** Close the open row, if there is one. */
export function closeBlock(
  rows: readonly BlockRecord[],
  endedAt: string,
  reason: BlockEndReason,
): BlockRecord[] {
  const open = activeBlock(rows);
  if (open === null) return [...rows];
  return rows.map((r) => (r.id === open.id ? { ...r, endedAt, reason } : r));
}

/**
 * The day a block's window closes, from what the row itself remembers.
 *
 * `plan.blockWindow` needs a `Program`, and a history row outlives the
 * program it names — a deleted custom one, or one whose length has since
 * been re-adapted. The arithmetic is the same and deliberately so.
 */
export function rowWindow(row: BlockRecord): { from: string; to: string } {
  const from = startOfWeek(row.startDate);
  return { from, to: addDays(from, row.weeks * 7 - 1) };
}

export type BlockOutcome = 'running' | 'completed' | 'left' | 'unknown';

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

/**
 * Rows built from the `startDates` map, for a climber who has one and no
 * history.
 *
 * What the old shape knows: which programs were started, and on what day.
 * What it does not know, for anything but the active program, is when the
 * climber stopped — so rather than invent a date, each reconstructed row is
 * closed at the point the *next* block began, and marked. Where that is the
 * only thing available it is also the best available: you did stop running
 * the old one when you started the new one. The last non-active row has no
 * next block to bound it and is closed at the end of its own window, which
 * is the one place this guesses; `outcomeOf` returns `unknown` for every
 * reconstructed row so no screen reports it as finished or abandoned.
 */
export function reconstructBlocks(input: {
  startDates: Record<string, string>;
  activeProgramId: string | null;
  nameFor: (programId: string) => string | undefined;
  weeksFor: (programId: string) => number | undefined;
  tracks?: Record<string, string>;
}): BlockRecord[] {
  const started = Object.entries(input.startDates)
    .filter(([, date]) => typeof date === 'string' && date !== '')
    .sort((a, b) => (a[1] < b[1] ? -1 : 1));

  const rows: BlockRecord[] = [];
  started.forEach(([programId, startDate], i) => {
    const weeks = input.weeksFor(programId);
    // A program the catalogue no longer carries: its name is the only thing
    // left of it, and the id is a better label than nothing.
    const name = input.nameFor(programId) ?? programId;
    if (weeks === undefined) return;

    const trackId = input.tracks?.[programId];
    const row: BlockRecord = {
      id: blockId(programId, startDate),
      programId,
      name,
      startDate,
      weeks,
      ...(trackId ? { trackId } : {}),
      endedAt: null,
      reconstructed: true,
    };

    if (programId === input.activeProgramId) {
      rows.push(row);
      return;
    }
    const nextStart = started[i + 1]?.[1];
    const bound = rowWindow(row).to;
    rows.push({
      ...row,
      endedAt: nextStart !== undefined && nextStart < bound ? addDays(nextStart, -1) : bound,
      reason: nextStart !== undefined ? 'switched' : 'ran-out',
    });
  });
  return rows;
}
