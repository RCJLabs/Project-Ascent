/**
 * A block picked up again is one run (PLAN.md M369).
 *
 * Every week in the app is derived from a start date, so picking a block up
 * at the week the climber was on moves its start — M149's *pick it up* did,
 * and since M369 so does resuming a stopped one. The move is right for the
 * plan from here on and wrong for the review: it took the block's first
 * weeks out of its own window, so a resumed block lost its week-one baseline
 * and read six perfect weeks as *"16 of 24"*.
 *
 * So the review reads a row as segments: one stretch of plan per start the
 * row has had, each measured with the start its weeks were counted from.
 * What lies between two segments depends on how the run was picked up, and
 * both rules are the coach's:
 *
 * - **Stopped, then resumed:** the days between the stop and the resume are
 *   a pause. They belong to no segment, so nothing the plan placed in them
 *   is a miss, and nothing logged in them is this block's.
 * - **Picked up without a stop** (M149): the gap ends the first segment the
 *   day before the pick-up, so it stays inside it, missed, as M149 counted.
 */

import type { Session } from '@/db/sessions';
import { blockAdherence, type AdherenceInput, type BlockAdherence, type TypeAdherence } from './adherence';
import type { BlockRecord } from './blocks';
import { addDays, blockSpan } from './dates';
import { planVsLog, type Finding, type PlanVsLogInput } from './planVsLog';

/** One stretch of a run, with the start its weeks were counted from. */
export interface Segment {
  startDate: string;
  /** Its first day, when it is not its window's: a stretch that began on a pick-up. */
  since?: string;
  /** Its last day, when it ended: the day before a pick-up, a stop, or leaving. */
  until: string | null;
}

/** The start the row's weeks were counted from before it was ever picked up. */
function firstStart(row: BlockRecord): string {
  const moved = (row.resumed ?? []).reduce((sum, r) => sum + r.weeks, 0);
  return addDays(row.startDate, -7 * moved);
}

/** The row as the stretches of plan it ran in, oldest first. */
export function segmentsOf(row: BlockRecord): Segment[] {
  const out: Segment[] = [];
  let startDate = firstStart(row);
  let since: string | undefined;
  for (const r of row.resumed ?? []) {
    out.push({ startDate, ...(since !== undefined ? { since } : {}), until: r.stoppedOn ?? addDays(r.on, -1) });
    startDate = addDays(startDate, 7 * r.weeks);
    since = r.on;
  }
  out.push({ startDate, ...(since !== undefined ? { since } : {}), until: row.endedAt });
  return out;
}

/** The run's first day: its first segment's window. */
export function runSince(row: BlockRecord): string {
  return blockSpan(firstStart(row), row.weeks).from;
}

/** Whether a day falls in a pause between a stop and a resume. */
export function pausedOn(row: BlockRecord, date: string): boolean {
  return (row.resumed ?? []).some((r) => r.stoppedOn !== undefined && date > r.stoppedOn && date < r.on);
}

/** The pauses, each as its length in whole weeks, for the sentence that names them. */
export function pauses(row: BlockRecord): { after: string; weeks: number }[] {
  return (row.resumed ?? []).flatMap((r) =>
    r.stoppedOn === undefined ? [] : [{ after: r.stoppedOn, weeks: Math.max(1, Math.round((Date.parse(r.on) - Date.parse(r.stoppedOn)) / 604_800_000)) }],
  );
}

/** Sessions, less those logged in a pause: they are nobody's block. */
export function runSessions(row: BlockRecord, sessions: readonly Session[]): Session[] {
  return sessions.filter((s) => !pausedOn(row, s.date));
}

/**
 * Adherence over the whole run: each segment counted against its own start,
 * then summed (PLAN.md M369).
 */
export function runAdherence(
  input: Omit<AdherenceInput, 'startDate' | 'since' | 'until'>,
  row: BlockRecord,
): BlockAdherence | null {
  const parts = segmentsOf(row)
    .map((s) => blockAdherence({ ...input, startDate: s.startDate, since: s.since, until: s.until }))
    .filter((a): a is BlockAdherence => a !== null);
  if (parts.length <= 1) return parts[0] ?? null;

  const types = new Map<string, TypeAdherence>();
  for (const part of parts) {
    for (const t of part.types) {
      const into = types.get(t.typeId);
      if (into) {
        into.planned += t.planned;
        into.done += t.done;
        into.extra += t.extra;
      } else types.set(t.typeId, { ...t });
    }
  }
  const sorted = [...types.values()].sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name));
  return {
    from: parts[0]!.from,
    to: parts[parts.length - 1]!.to,
    through: parts[parts.length - 1]!.through,
    weeks: parts.reduce((sum, p) => sum + p.weeks, 0),
    types: sorted,
    planned: parts.reduce((sum, p) => sum + p.planned, 0),
    done: parts.reduce((sum, p) => sum + p.done, 0),
    away: parts.reduce((sum, p) => sum + p.away, 0),
    unplanned: parts.reduce((sum, p) => sum + p.unplanned, 0),
  };
}

/** Where the run drifted from its plan, each segment read against its own weeks. */
export function runDrift(input: Omit<PlanVsLogInput, 'startDate' | 'since' | 'until'>, row: BlockRecord): Finding[] {
  const all = segmentsOf(row)
    .flatMap((s) => planVsLog({ ...input, startDate: s.startDate, since: s.since, until: s.until }))
    .sort((a, b) => b.weight - a.weight);
  // A week can be read twice, once by each stretch its number fell in; the
  // heavier reading stands for it.
  const seen = new Set<string>();
  return all.filter((f) => !seen.has(f.id) && seen.add(f.id));
}
