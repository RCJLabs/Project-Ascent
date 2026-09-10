/**
 * Running a program over fewer weeks than it was written for (PLAN.md M56).
 *
 * A climber with six weeks before a trip cannot run a twelve-week block, and
 * until now the app's only answer was "start it and stop halfway" — which
 * gets them the first two phases and never the third, the one the block was
 * building toward.
 *
 * **A remapping, not a truncation.** Phases keep their proportions and their
 * ids, so every `perPhase` prescription still resolves untouched; week-keyed
 * drills follow their phase; deloads keep what they meant rather than where
 * they were.
 *
 * **What this cannot do is rewrite prose.** A phase description that says
 * "over the next four weeks" still says it. That is why an adapted program
 * is marked as adapted and the screens say so — see `adaptedFrom`.
 */

import type { Phase, Program, SessionType } from '@/content/types';

/**
 * Weeks between deloads, below which two of them are one too many.
 *
 * Most of the catalogue deloads on the last week of a phase. Compress twelve
 * weeks into six and that rule alone puts a deload every other week, which
 * is not a training block. The later one survives, because a deload earns
 * its place by what came before it.
 */
export const MIN_DELOAD_GAP = 3;

/**
 * The shortest a written block is worth compressing to.
 *
 * A phase that lasts one week is not a phase, and a twelve-week program run
 * over three is four sessions of each idea and no adaptation to any of them.
 * A program *written* to be three weeks long is a different thing and keeps
 * its own length — this floor only ever removes options from a longer one.
 */
export const MIN_ADAPTED_WEEKS = 4;

/** Lengths worth offering for this program, shortest first. */
export function lengthsFor(program: Program): number[] {
  const floor = Math.max(MIN_ADAPTED_WEEKS, program.phases.length);
  return [4, 6, 8, 10, 12, 16, 20]
    .filter((n) => n >= floor && n < program.weeks)
    .concat(program.weeks);
}

/** How many weeks each phase gets, tiling `weeks` with none left empty. */
export function apportion(lengths: number[], weeks: number): number[] {
  if (lengths.length === 0) return [];
  const total = lengths.reduce((n, l) => n + l, 0);
  if (total === 0) return lengths.map(() => 1);

  const ideal = lengths.map((l) => (l * weeks) / total);
  const out = ideal.map((n) => Math.max(1, Math.floor(n)));
  let spare = weeks - out.reduce((n, l) => n + l, 0);

  // Largest remainder, so the weeks that are left over go where they were
  // most nearly earned. Ties go to the earlier phase, which is the one a
  // climber runs first and the one a short block can least afford to rush.
  const order = ideal
    .map((n, i) => ({ i, fraction: n - Math.floor(n) }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let k = 0; spare > 0; k = (k + 1) % order.length) {
    const at = order[k]!.i;
    out[at] = (out[at] ?? 0) + 1;
    spare -= 1;
  }
  // More phases than weeks: the tail cannot be run, and pretending otherwise
  // would give a phase zero weeks and a prescription nothing to sit in.
  while (out.reduce((n, l) => n + l, 0) > weeks) {
    const last = out.length - 1;
    const size = out[last] ?? 0;
    if (size > 1) out[last] = size - 1;
    else out.pop();
  }
  return out;
}

interface Span {
  phase: Phase;
  from: { start: number; end: number };
  to: { start: number; end: number };
}

function spansFor(program: Program, weeks: number): Span[] {
  const phases = program.phases;
  const lengths = phases.map((p) => p.weekEnd - p.weekStart + 1);
  const sizes = apportion(lengths, weeks);
  const spans: Span[] = [];
  let at = 1;
  for (let i = 0; i < sizes.length; i += 1) {
    const size = sizes[i]!;
    const phase = phases[i]!;
    spans.push({
      phase,
      from: { start: phase.weekStart, end: phase.weekEnd },
      to: { start: at, end: at + size - 1 },
    });
    at += size;
  }
  return spans;
}

/**
 * Position within a phase, rescaled — and both ends kept.
 *
 * Centre-sampling a four-week phase into two weeks picks weeks 2 and 4: it
 * drops the week that introduces the movement and keeps only the repeats.
 * Keeping the endpoints picks 1 and 4 — the week the pattern is taught and
 * the week it is loaded — and thins the middle, which is the part a shorter
 * block can actually afford to lose.
 */
function scale(position: number, fromLength: number, toLength: number): number {
  if (toLength <= 1 || fromLength <= 1) return 0;
  return Math.round((position * (toLength - 1)) / (fromLength - 1));
}

/** The week of the written program a week of the adapted one stands for. */
export function sourceWeek(spans: Span[], week: number): number {
  const span = spans.find((s) => week >= s.to.start && week <= s.to.end) ?? spans[spans.length - 1];
  if (!span) return week;
  const toLength = span.to.end - span.to.start + 1;
  const fromLength = span.from.end - span.from.start + 1;
  const mapped = span.from.start + scale(week - span.to.start, toLength, fromLength);
  return Math.min(span.from.end, Math.max(span.from.start, mapped));
}

/**
 * Where the deloads land.
 *
 * A deload written on the last week of a phase stays on the last week of
 * that phase — that is what it was for. One written mid-phase keeps its
 * position in the phase. Then they are thinned to `MIN_DELOAD_GAP` and the
 * final week is cleared, because a block that ends on a deload ends on
 * nothing.
 */
export function adaptDeloads(program: Program, weeks: number, spans: Span[]): number[] {
  const original = program.deloadWeeks ?? [];
  if (original.length === 0) return [];

  const moved = new Set<number>();
  for (const week of original) {
    const span = spans.find((s) => week >= s.from.start && week <= s.from.end);
    if (!span) continue;
    // The same rescaling, the other way round. It keeps a phase's endpoints,
    // so a deload written on the last week of a phase lands on the last week
    // of that phase without a special case — which is what it was for.
    const fromLength = span.from.end - span.from.start + 1;
    const toLength = span.to.end - span.to.start + 1;
    const mapped = span.to.start + scale(week - span.from.start, fromLength, toLength);
    moved.add(Math.min(span.to.end, Math.max(span.to.start, mapped)));
  }

  const sorted = [...moved].sort((a, b) => a - b).filter((w) => w >= 1 && w < weeks);
  const kept: number[] = [];
  // Latest first, so thinning keeps the deload that follows the most work.
  for (const week of [...sorted].reverse()) {
    if (kept.every((k) => Math.abs(k - week) >= MIN_DELOAD_GAP)) kept.push(week);
  }
  return kept.sort((a, b) => a - b);
}

function adaptSessionType(type: SessionType, spans: Span[], weeks: number): SessionType {
  if (!type.drillsByWeek) return type;
  const drills: Record<number, string> = {};
  for (let week = 1; week <= weeks; week += 1) {
    const drill = type.drillsByWeek[sourceWeek(spans, week)];
    if (drill) drills[week] = drill;
  }
  return { ...type, drillsByWeek: drills as SessionType['drillsByWeek'] };
}

/**
 * The same program over a different number of weeks.
 *
 * Returns the program unchanged when there is nothing to do, so a caller can
 * apply this unconditionally and callers downstream never learn about it.
 */
export function adaptProgram(program: Program, weeks: number): Program {
  const target = Math.round(weeks);
  if (!Number.isFinite(target) || target < 1 || target === program.weeks) return program;
  if (program.phases.length === 0) return { ...program, weeks: target, adaptedFrom: program.weeks };

  const spans = spansFor(program, target);
  const phases = spans.map(({ phase, to }) => ({ ...phase, weekStart: to.start, weekEnd: to.end }));
  const covered = phases[phases.length - 1]?.weekEnd ?? target;

  return {
    ...program,
    weeks: covered,
    adaptedFrom: program.weeks,
    phases,
    deloadWeeks: adaptDeloads(program, covered, spans),
    sessionTypes: program.sessionTypes.map((t) => adaptSessionType(t, spans, covered)),
  };
}
