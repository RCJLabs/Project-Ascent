/**
 * The end of a block, and what follows it (PLAN.md M85).
 *
 * **There was no code for after the last week.** `programWeek` clamps, so a
 * twelve-week block a year in the past still reported week twelve — with
 * its sessions, its phase, and its "Final week — the after, to put beside
 * the before" banner, every day, forever. M85 fixed that in `plan.ts`; this
 * is the other half: having noticed the block is over, say something useful
 * about it.
 *
 * **Everything here is already authored and was reachable from one page.**
 * `Program.intro.graduation` and `Program.nextPrograms` — a reason written
 * per destination — are read only by the catalogue detail page, which is
 * where a climber goes to *choose* a program and not where they are when
 * one finishes. Correcting the plan's claim: `graduation` is not "read by
 * nothing", it is read there, alongside `nextPrograms`. The problem is the
 * same either way — both sit behind a page nobody mid-block visits.
 *
 * **The retest you owe is derived, not nagged.** An assessment with a
 * baseline inside the block and no second reading has no after, and a block
 * report that quietly omits it would be a highlight reel. M84 already
 * separates those; this names them.
 */

import { getProgram, writtenProgram } from '@/content/programs';
import { adaptProgram } from './adapt';
import type { Program } from '@/content/types';
import { outcomeOf, weeksRun, type BlockOutcome, type BlockRecord } from './blocks';
import type { MetricEntry } from '@/db/metrics';
import { blockReport, type AssessmentResult, type BlockReport } from './blockReport';
import { blockStatus, type BlockStatus } from './plan';

export interface NextStep {
  program: Program;
  /** The authored reason this one follows, verbatim. */
  reason: string;
}

export interface BlockEnd {
  status: BlockStatus;
  program: Program;
  /**
   * The history row this describes, when it is a past block (PLAN.md M87).
   *
   * Absent for the live block, which the profile describes directly. What
   * it adds is the thing the window cannot say: whether the climber was
   * still on it when it ran out.
   */
  record?: BlockRecord;
  outcome: BlockOutcome;
  /** The M84 comparison, or null when the program has no test weeks. */
  report: BlockReport | null;
  /** The program's own words about finishing it. Empty when unauthored. */
  graduation: string;
  /**
   * Assessments with a baseline this block and no retest.
   *
   * The ones the final test week existed for. Named rather than counted,
   * because "you owe three retests" is not a thing anyone can act on.
   */
  owed: AssessmentResult[];
  /** Authored successors, resolved. Unresolvable ids are dropped. */
  next: NextStep[];
}

export interface BlockEndInput {
  program: Program;
  startDate: string;
  entries: readonly MetricEntry[];
  today: string;
  /** The history row, when describing a block that is not the live one. */
  record?: BlockRecord;
}

/**
 * The program as a past block ran it.
 *
 * `getProgram` returns it at whatever length it is set to *now*, and M56's
 * adaptation is one current value per program — so a block run over eight
 * weeks would be described as twelve the day the climber set the same
 * program back to full length. The row remembers what it was.
 */
export function programForRecord(record: BlockRecord): Program | null {
  const written = writtenProgram(record.programId);
  if (!written) return null;
  return written.weeks === record.weeks ? written : adaptProgram(written, record.weeks);
}

export function blockEnd(input: BlockEndInput): BlockEnd {
  const status = blockStatus(input.program, input.startDate, input.today);
  const report = blockReport(input);
  return {
    status,
    program: input.program,
    ...(input.record ? { record: input.record } : {}),
    outcome: input.record ? outcomeOf(input.record, input.today) : status.state === 'ended' ? 'completed' : 'running',
    report,
    graduation: input.program.intro?.graduation ?? '',
    owed: report === null ? [] : report.results.filter((r) => r.gap === 'once-only'),
    // A `nextPrograms` entry naming a program the catalogue no longer has
    // is dropped rather than shown as a dead end. `content/validate.ts`
    // checks the authored graph, so this only fires for a custom or
    // imported program whose successors were never in this build.
    next: input.program.nextPrograms.flatMap((step) => {
      const program = getProgram(step.id);
      return program ? [{ program, reason: step.reason }] : [];
    }),
  };
}

/**
 * What to say about the block, given where it is.
 *
 * Three states, three different sentences. The "ended" one leads with the
 * fact rather than with congratulation: a climber who stopped training in
 * week six and let the calendar run out also arrives here, and telling them
 * they finished something would be the app making it up.
 */
export function describeBlockEnd(end: BlockEnd): string {
  const { status, program } = end;
  if (status.state === 'before') {
    return `${program.name} has not started yet.`;
  }
  if (status.state === 'running') {
    return `${program.name} runs to ${status.to}.`;
  }
  const when =
    status.daysSince === 0
      ? 'today'
      : status.daysSince === 1
        ? 'yesterday'
        : status.daysSince < 21
          ? `${status.daysSince} days ago`
          : `${Math.round(status.daysSince / 7)} weeks ago`;

  // A block the climber walked away from did not "run out" on them, and one
  // reconstructed from the old shape is a block the app knows the start of
  // and nothing else (PLAN.md M87).
  if (end.outcome === 'left' && end.record) {
    const weeks = weeksRun(end.record, end.record.endedAt ?? status.to);
    return `You left ${program.name} after ${weeks} of its ${end.record.weeks} weeks. That is a fact about the calendar and not a verdict — what the app can say is which of the numbers moved while you were on it.`;
  }
  if (end.outcome === 'unknown') {
    return `${program.name} started ${status.from}, and the app has no record of how it ended — it was already running before this version kept a history. The numbers below are whatever was measured inside its weeks.`;
  }
  return `${program.name} ran out ${when}. Whether you trained every week of it is between you and the log — what the app can say is which of the numbers moved, and what it has written down about what comes next.`;
}
