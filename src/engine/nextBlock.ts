/**
 * What comes next, chosen rather than recited (PLAN.md M134).
 *
 * `blockEnd` computes a block report — every benchmark the program declared,
 * what it was at the start, what it is now, and whether it moved — and then
 * returns `program.nextPrograms` verbatim and unconditionally. So a climber
 * whose report says their fingers moved and their endurance did not is
 * handed the same three suggestions, in the same order, as one whose report
 * says the opposite. The answer was already in the room.
 *
 * ## The rule, and why it is that one
 *
 * A program declares the benchmarks it is trying to move. A block that has
 * just ended says which of a climber's benchmarks did move and which did
 * not. So the successor worth running first is the one that trains what this
 * block *left where it was* — which is usually what it did not train at all.
 * Iron Grip moves fingers and measures a dead hang beside them; if twelve
 * weeks of hangboarding left the dead hang flat, the next block being a
 * finger block again is the one choice the report argues against.
 *
 * **Repeating what moved is said and never scored.** Consolidating a gain is
 * real coaching — a grade you just reached is a grade worth holding — and an
 * app that deducted for it would be taking a side in a judgement it has no
 * access to. The overlap is named in the sentence and left out of the order.
 *
 * **A never-tested benchmark says nothing.** Flat means measured twice and
 * unchanged. A metric the climber never took a reading of is not evidence
 * that the block failed to move it, and counting it would reward the
 * successor that happens to declare the benchmarks nobody tests.
 *
 * **A block barely run argues for running it again, not for a successor.**
 * The same rule the finder has followed since M101 and for the same reason:
 * a plan done at a third of its sessions was not tried, and a successor is
 * the answer to a block that was.
 *
 * **Ties keep the author's order.** A program whose successors carry no
 * signal — no report, nothing tested, no overlap — reads exactly as it read
 * before this existed. That is the property worth having: nothing is
 * reordered on the strength of an absence.
 *
 * Pure: a report and an adherence in, an order and a sentence out.
 */

import type { Metric, MetricId } from '@/content/types';
import type { BlockAdherence } from './adherence';
import type { NextStep } from './blockEnd';
import type { BlockReport } from './blockReport';
import { ENOUGH_PLANNED, LOW_ADHERENCE } from './finder';

/** What a benchmark being left where it was is worth, in the ordering. */
const PER_UNMOVED = 2;

export interface NextChoice {
  program: NextStep['program'];
  /** The author's reason, unchanged. */
  reason: string;
  /** Benchmarks this block did not move, which this program trains. */
  addresses: Metric[];
  /** Benchmarks this block did move, which this program trains again. */
  repeats: Metric[];
  /** What the block says about this one, or null when it says nothing. */
  because: string | null;
}

export interface NextBlock {
  choices: NextChoice[];
  /** One sentence over the list, or null. */
  note: string | null;
}

export interface NextBlockInput {
  candidates: readonly NextStep[];
  report: BlockReport | null;
  adherence?: BlockAdherence | null;
}

/** The metrics that were compared, split by whether they improved. */
function measured(report: BlockReport | null): { moved: Set<MetricId>; stayed: Set<MetricId> } {
  const moved = new Set<MetricId>();
  const stayed = new Set<MetricId>();
  for (const result of report?.results ?? []) {
    // A gap is not a reading. `moved` is null for anything with nothing to
    // compare against, and both sets stay out of it.
    if (result.gap !== null || result.moved === null) continue;
    (result.moved === 'better' ? moved : stayed).add(result.metric.id);
  }
  return { moved, stayed };
}

/** Two or three things named the way a person says them. */
function list(metrics: readonly Metric[]): string {
  const names = metrics.map((m) => m.label.toLowerCase());
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What this block says about this successor, or nothing.
 *
 * Unmoved benchmarks first, because that is the argument. The overlap with
 * what did move is a second sentence and never the only one: "this trains
 * what you already improved" on its own reads as a recommendation, and it
 * is not one.
 */
function because(addresses: Metric[], repeats: Metric[]): string | null {
  if (addresses.length > 0) {
    // "This block left X where it was" rather than "Your X is where it
    // was": half the benchmarks are plural nouns for a single measurement,
    // and *Your max pull-ups is where it was* is the sentence that comes
    // out of agreeing with the count instead of with the name. Found in a
    // browser, where three of the four cards read that way. Moving the verb
    // onto the block sidesteps a disagreement English will not let this
    // have both ways.
    const one = addresses.length === 1;
    const held = `This block left your ${list(addresses)} where ${one ? 'it was' : 'they were'}, and this trains ${one ? 'it' : 'them'}.`;
    return repeats.length === 0
      ? held
      : `${held} It also trains ${list(repeats)}, which did move.`;
  }
  if (repeats.length > 0) {
    return `This trains ${list(repeats)} again — consolidation rather than a new stimulus, which is a choice rather than a fault.`;
  }
  return null;
}

/**
 * The sentence over the whole list, when the block itself has one.
 *
 * Three cases and a silence. The silence is for a block with no benchmarks
 * at all — Trip Prep declares none on purpose, because four weeks of taper
 * has nothing to measure moving and its own pitch says so — where a line
 * explaining why the order is the author's would be explaining a choice the
 * program made rather than a gap.
 */
function noteFor(input: NextBlockInput, measurements: number, signal: boolean): string | null {
  const done = input.adherence;
  if (done && done.planned >= ENOUGH_PLANNED && done.done / done.planned < LOW_ADHERENCE) {
    return `You did ${done.done} of the ${done.planned} sessions this block placed. A block you did not run is not one to follow — running it again is the honest next step, and these are here for when it is.`;
  }
  if (signal) {
    return 'Ordered by what this block left where it was, which is usually what it did not train. The reason under each one is the program author’s.';
  }
  if (input.report !== null && measurements === 0) {
    // The case that makes this whole milestone quiet for most climbers, so
    // it is said out loud rather than left as an unexplained order. The test
    // weeks are marked on the calendar and linked from the day; what is
    // missing is a second reading to put beside the first.
    return `Nothing was measured twice this block, so these are in the order ${input.report.program.name} wrote them. Take its benchmarks at the start and the end of the next one and this list can be ordered by what actually moved.`;
  }
  return null;
}

export function chooseNext(input: NextBlockInput): NextBlock {
  const { moved, stayed } = measured(input.report);

  const scored = input.candidates.map((step, index) => {
    const declared = step.program.assessments;
    const pick = (ids: ReadonlySet<MetricId>): Metric[] =>
      (input.report?.results ?? [])
        .filter((r) => ids.has(r.metric.id) && declared.includes(r.metric.id))
        .map((r) => r.metric);
    const addresses = pick(stayed);
    const repeats = pick(moved);
    return {
      index,
      choice: {
        program: step.program,
        reason: step.reason,
        addresses,
        repeats,
        because: because(addresses, repeats),
      } satisfies NextChoice,
    };
  });

  // Stable by construction: the declared index breaks every tie, so a set of
  // candidates with nothing to separate them comes back in the order the
  // program wrote them.
  const ordered = [...scored].sort(
    (a, b) =>
      b.choice.addresses.length * PER_UNMOVED - a.choice.addresses.length * PER_UNMOVED ||
      a.index - b.index,
  );

  const signal = ordered.some((s) => s.choice.addresses.length > 0);
  return {
    choices: ordered.map((s) => s.choice),
    note: noteFor(input, moved.size + stayed.size, signal),
  };
}
