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
import { addDays, blockSpan, blockStart, daysBetween } from './dates';
import type { WeekPlan } from './scheduler';

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
  /**
   * The week layout this block was started with (PLAN.md M91).
   *
   * Snapshotted for the same reason as `name` and `weeks`: adherence is a
   * comparison against what the plan placed, and a climber who rearranges
   * their week would otherwise have every earlier block re-scored against a
   * layout it never ran. Absent on rows recorded before this, which is a
   * fact the page has to say out loud rather than paper over.
   */
  plan?: WeekPlan;
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
  /**
   * Each time the run was picked up again (PLAN.md M369), oldest first.
   *
   * Picking up moves the start date — every week in the app is derived from
   * it, so that is what makes today the week the climber was on — and the
   * move took the block's first weeks out of its own window: a resumed
   * block lost its week-one baseline and the sessions before the gap. This
   * keeps what moved and when, so the review can measure the whole run.
   */
  resumed?: Resumption[];
}

/** One picking-up of a run (PLAN.md M369). */
export interface Resumption {
  /** The day it was picked up again. */
  on: string;
  /** How many weeks its start moved, so the week it was on is the week it resumed at. */
  weeks: number;
  /**
   * The day it was stopped, when it was. The days between are a pause and
   * belong to no block — the coach's call: a climber who pressed Stop chose
   * to, and the plan's sessions in those weeks are not misses. A run picked
   * up without a stop (M149's *pick it up*) has none, and its gap stays in
   * the block, missed, as M149 always counted it.
   */
  stoppedOn?: string;
}

export function blockId(programId: string, startDate: string): string {
  return `${programId}#${startDate}`;
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

/**
 * Move the open block's start date, keeping it the same block (PLAN.md M149).
 *
 * A block that was interrupted and picked up again is not a new block and
 * must not become one: its history, its adherence and its place in the
 * record are all the same run. But the row's `id` is `programId#startDate`,
 * so moving the date moves the identity — which is why this exists rather
 * than the caller writing two fields and finding out later that the block
 * report has two rows for one block.
 *
 * Nothing else on the row changes. `weeks`, `plan` and `trackId` are
 * snapshots of what the block is running and none of that moved.
 */
export function moveBlockStart(
  rows: readonly BlockRecord[],
  programId: string,
  startDate: string,
  /** The day it was picked up, recorded so the review keeps the whole run (PLAN.md M369). */
  on?: string,
): BlockRecord[] {
  const open = activeBlock(rows);
  if (open === null || open.programId !== programId) return [...rows];
  const weeks = Math.round(daysBetween(open.startDate, startDate) / 7);
  const moved: BlockRecord = {
    ...open,
    id: blockId(programId, startDate),
    startDate,
    ...(on !== undefined && weeks > 0 ? { resumed: [...(open.resumed ?? []), { on, weeks }] } : {}),
  };
  return rows.map((row) => (row.id === open.id ? moved : row));
}

/**
 * A stopped block, picked up at the week the climber was on (PLAN.md M369).
 *
 * *"Starting Iron Grip again later resumes the week you were on"* was the
 * promise, and resuming kept the start date: stopped at the end of week six
 * and resumed four weeks later, the block was in week ten. Now the start
 * moves by the gap, so today is the first week not yet finished — the week
 * of the stop, or the next one if the stop came on that week's last day.
 *
 * Null when there is nothing to pick up: a row still open, one that ran to
 * its end, one reconstructed from the old shape (whose end is a guess), or
 * one resumed in the same week it stopped, where nothing needs to move and
 * reopening the row as it was is the right answer.
 */
export function pickUp(row: BlockRecord, today: string): BlockRecord | null {
  if (row.endedAt === null || row.reconstructed === true) return null;
  const from = blockStart(row.startDate);
  const finished = Math.max(0, Math.floor((daysBetween(from, row.endedAt) + 1) / 7));
  const week = finished + 1;
  if (week > row.weeks) return null;
  const now = Math.floor(daysBetween(from, today) / 7) + 1;
  const weeks = now - week;
  if (weeks <= 0) return null;
  const startDate = addDays(row.startDate, weeks * 7);
  const { reason: _reason, ...rest } = row;
  return {
    ...rest,
    id: blockId(row.programId, startDate),
    startDate,
    endedAt: null,
    resumed: [...(row.resumed ?? []), { on: today, weeks, stoppedOn: row.endedAt }],
  };
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
  entry: { program: Program; startDate: string; plan?: WeekPlan | undefined; trackId?: string | undefined },
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
    ...(entry.plan ? { plan: entry.plan } : {}),
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
 * The calendar a block covered, from what the row itself remembers.
 *
 * `plan.blockWindow` needs a `Program`, and a history row outlives the
 * program it names — a deleted custom one, or one whose length has since
 * been re-adapted. So this takes the weeks from the row and the arithmetic
 * from `dates.blockSpan`, which is the same function `blockWindow` calls.
 *
 * It used to say *"The arithmetic is the same and deliberately so"* and
 * compute its own from `startOfWeek` (PLAN.md M307). It was not the same:
 * `blockStart` snaps **forward** to the first whole week, so for every start
 * that is not a Sunday this window began and ended seven days early.
 */
export function rowWindow(row: BlockRecord): { from: string; to: string } {
  return blockSpan(row.startDate, row.weeks);
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
