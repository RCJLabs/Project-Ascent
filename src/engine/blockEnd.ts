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
import type { BlockRecord } from './blocks';
import { outcomeOf, weeksRun, type BlockOutcome } from './blockOutcome';
import type { MetricEntry } from '@/db/metrics';
import { blockReport, type AssessmentResult, type BlockReport } from './blockReport';
import { blockStatus, type BlockStatus } from './planReading';
import { formatDate, fromKey } from './dates';
import { pausedOn, pauses, runSince } from './blockRun';

/**
 * A day as the page's header writes it (PLAN.md M368): *"Iron Grip runs to
 * 2026-11-14."* sat under a header reading *Runs to Nov 14, 2026*.
 */
export function blockDay(key: string): string {
  return formatDate(fromKey(key), { day: 'numeric', month: 'short', year: 'numeric' });
}

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
  // Measured to the day the climber left, if they did (PLAN.md M365), and
  // from the run's first week if it was picked up again since (M369) — with
  // nothing read in a pause, which belongs to no block.
  const record = input.record;
  const report = blockReport({
    ...input,
    until: record?.endedAt ?? null,
    ...(record?.resumed?.length ? { since: runSince(record) } : {}),
    entries: record ? input.entries.filter((e) => !pausedOn(record, e.date)) : input.entries,
  });
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
/**
 * What the page shows under the sentence (PLAN.md M366).
 *
 * The sentence names only these. It promised all three whatever followed,
 * and a custom block — no benchmarks, nothing written about what comes
 * next — got *"Below is which of its sessions happened, which of the
 * numbers moved, and what it has written down about what comes next"* over
 * one card, or none.
 */
export interface Below {
  /** Which of its sessions happened. */
  sessions: boolean;
  /** Which of the numbers moved: the benchmarks, or the lines lifted. */
  numbers: boolean;
  /**
   * What the program wrote down about what follows it: the successors it
   * names, each with its author's reason. Not the graduation card, which is
   * what the block was for.
   */
  next: boolean;
}

/** "a", "a, and b", "a, b, and c" — the commas the sentences always had. */
function listed(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function describeBlockEnd(end: BlockEnd, below: Below): string {
  /**
   * And the pauses, said, because they change what the numbers count
   * (PLAN.md M369): a stretch between a stop and a resume is not this
   * block's, and a review that left them out without saying so would be a
   * sessions count nobody could reconcile with their calendar.
   */
  const paused = end.record ? pauses(end.record) : [];
  const said = paused
    .map((p) => ` It was paused for ${p.weeks} week${p.weeks === 1 ? '' : 's'} from ${blockDay(p.after)}, and ${p.weeks === 1 ? 'that week is' : 'those weeks are'} not counted.`)
    .join('');
  return sentenceFor(end, below) + said;
}

function sentenceFor(end: BlockEnd, below: Below): string {
  const { status, program } = end;
  const sessions = below.sessions ? ['which of its sessions happened'] : [];
  const numbers = below.numbers ? ['which of the numbers moved'] : [];
  // A block the climber walked away from did not "run out" on them, and one
  // reconstructed from the old shape is a block the app knows the start of
  // and nothing else (PLAN.md M87). Before the calendar's state, because a
  // block left in week six of twelve is still `running` by the calendar for
  // six more weeks, and was described as running to a day it never reached
  // (PLAN.md M365).
  if (end.outcome === 'left' && end.record) {
    const weeks = weeksRun(end.record, end.record.endedAt ?? status.to);
    const shown = [...sessions, ...numbers];
    return `You left ${program.name} after ${weeks} of its ${end.record.weeks} weeks. That is a fact about the calendar and not a verdict${
      shown.length > 0 ? ` — below is ${listed(shown)} while you were on it` : ''
    }.`;
  }
  if (status.state === 'before') {
    return `${program.name} has not started yet.`;
  }
  if (status.state === 'running') {
    return `${program.name} runs to ${blockDay(status.to)}.`;
  }
  const when =
    status.daysSince === 0
      ? 'today'
      : status.daysSince === 1
        ? 'yesterday'
        : status.daysSince < 21
          ? `${status.daysSince} days ago`
          : `${Math.round(status.daysSince / 7)} weeks ago`;

  if (end.outcome === 'unknown') {
    return `${program.name} started ${blockDay(status.from)}, and the app has no record of how it ended — it was already running before this version kept a history.${
      below.numbers ? ' The numbers below are whatever was measured inside its weeks.' : ''
    }`;
  }
  const shown = [...sessions, ...numbers, ...(below.next ? ['what it has written down about what comes next'] : [])];
  return `${program.name} ran out ${when}.${shown.length > 0 ? ` Below is ${listed(shown)}.` : ''}`;
}
