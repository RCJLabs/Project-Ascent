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

import { getProgram } from '@/content/programs';
import type { Program } from '@/content/types';
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
}

export function blockEnd(input: BlockEndInput): BlockEnd {
  const status = blockStatus(input.program, input.startDate, input.today);
  const report = blockReport(input);
  return {
    status,
    program: input.program,
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
  return `${program.name} ran out ${when}. Whether you trained every week of it is between you and the log — what the app can say is which of the numbers moved, and what it has written down about what comes next.`;
}
