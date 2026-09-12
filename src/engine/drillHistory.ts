/**
 * Your own history with a drill (PLAN.md M107).
 *
 * The library is 144 drills, reachable from a program's week and from
 * search, and never browsable — and never with the climber's own record
 * beside them. That record is the part that does not exist anywhere:
 * `session.drillId` and `session.drillDone` have been written since the
 * beginning and are read by the challenges, the plateau diagnosis and the
 * derived category counts, none of which ever says *"you have been given
 * this one six times and done it twice"*.
 *
 * ## What the plan got wrong about the drills themselves
 *
 * M107's premise is that "a drill is a paragraph" and that the library is
 * thin until a coach writes cues and faults for all 144. Read, the
 * paragraphs are not thin — they carry the method *and* the fault:
 *
 * > *"Rule: once a foot is placed on a hold, it does NOT move until you
 * > step to the next hold. No readjusting, no pivoting, no 'just a nudge.'
 * > … If you catch yourself adjusting, downclimb and restart."*
 *
 * That is a cue and a fault correction in the description field. What the
 * library actually lacks is a way in and a mirror: somewhere to browse it,
 * and your own numbers beside each entry. Both are code.
 *
 * So the milestone's *"both or neither"* is answered: the page is worth
 * having before the cues are written, and the cues land into a page that
 * already exists rather than into nothing.
 *
 * **Prescribed, not merely logged.** A drill you were given and skipped is
 * the interesting row, so the count is of sessions that *carried* it, and
 * the done count is the subset that ticked it.
 *
 * **And a row exists only because a session carried the drill**, so `given`
 * is never zero and there is no "never prescribed" case to guard against
 * inside a row — that case is the absence of the row. A `rate` field and a
 * `given === 0` branch were both written here and both were unreachable;
 * a mutation that removed them changed nothing, which is how they were
 * found, and they are gone.
 *
 * Pure: sessions in, a reading out.
 */

import type { Session } from '@/db/sessions';
import type { DrillId, ProgramId } from '@/content/types';
import { getProgram } from '@/content/programs';
import { daysBetween } from './dates';

export interface DrillRecord {
  drillId: DrillId;
  /** Completed sessions that carried this drill, done or not. */
  given: number;
  /** Of those, the ones ticked. */
  done: number;
  /** The last day it was ticked, or null. */
  lastDone: string | null;
  /** Days since that, or null. */
  daysSince: number | null;
}

export interface DrillHistoryInput {
  sessions: readonly Session[];
  today: string;
}

/** Every drill the climber has ever been given, keyed by id. */
export function drillHistory(input: DrillHistoryInput): Map<DrillId, DrillRecord> {
  const out = new Map<DrillId, DrillRecord>();
  for (const session of input.sessions) {
    if (!session.completed || !session.drillId) continue;
    const id = session.drillId as DrillId;
    const row =
      out.get(id) ?? { drillId: id, given: 0, done: 0, lastDone: null, daysSince: null };
    row.given += 1;
    if (session.drillDone === true) {
      row.done += 1;
      if (row.lastDone === null || session.date > row.lastDone) row.lastDone = session.date;
    }
    out.set(id, row);
  }
  for (const row of out.values()) {
    row.daysSince = row.lastDone === null ? null : daysBetween(row.lastDone, input.today);
  }
  return out;
}

export function recordFor(
  history: ReadonlyMap<DrillId, DrillRecord>,
  drillId: DrillId,
): DrillRecord | null {
  return history.get(drillId) ?? null;
}

/**
 * The climber's record with one drill, in a sentence.
 *
 * Null where the drill has never been prescribed — which is the absence of
 * a record rather than an empty one: a library entry the climber has never
 * met should say nothing about them rather than "0 of 0".
 */
export function describeRecord(record: DrillRecord | null): string | null {
  if (record === null) return null;
  const given = `${record.done} of ${record.given} time${record.given === 1 ? '' : 's'} it came up`;
  if (record.done === 0) return `${given}. Never done, so far.`;
  const when =
    record.daysSince === 0
      ? 'today'
      : record.daysSince === 1
        ? 'yesterday'
        : `${record.daysSince} days ago`;
  return `${given}. Last done ${when}.`;
}

/** The shipped programs that prescribe a drill, by name. */
export function prescribedBy(sources: readonly ProgramId[]): string[] {
  return [...new Set(sources)]
    .map((id) => getProgram(id)?.name)
    .filter((name): name is string => name !== undefined);
}
