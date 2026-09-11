/**
 * How efficiently a grade goes, block by block (PLAN.md M83).
 *
 * `PyramidRow.conversion` has existed since §5.9 and is read in two places,
 * both of them snapshots over the whole log: the pyramid card, and the
 * plateau verdict's evidence ("3 sent from 18 tries"). Neither has a time
 * dimension, so the number that moves *before* the max grade does — you
 * start sending V5 in two tries instead of six, weeks before V6 goes — was
 * invisible.
 *
 * **Why this is not a line on the four-week comparison**, which is what M83
 * proposed. `changesBetween` builds a uniform `Change` over `keyof Totals`:
 * flat counts, with `percent` as the delta between them. Conversion breaks
 * that table three ways. It is per grade, so it is many rows and not one.
 * It is a ratio, so `percent` would report a percent change *of a
 * percentage* — 17% to 50% is "+194%", which is the most misleading number
 * this codebase could print. And over four weeks the denominators are tiny:
 * the proposal's own example sentence, "one in six to one in two", is a
 * two-try sample being reported as a doubling.
 *
 * **So it is a series, and the gate does the work.** A block with too few
 * tries at a grade is drawn as a gap, the way `loadTrend` leaves a gap
 * rather than a zero where there is no ratio, and every figure is printed
 * with the counts it came from. `projectHistory` set this pattern: below a
 * threshold, a number is an anecdote and is marked as one.
 */

import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import {
  DEFAULT_DISPLAY,
  V_GRADES,
  YDS_GRADES,
  displayGrade,
  gradeOrdinal,
  type GradeDisplay,
  type GradeScale,
} from './grades';

/** Days in a block. The same 28 as M28 and the load model, so "this block"
 *  means one thing across the Progress page. */
export const BLOCK_DAYS = 28;

/** Blocks shown. Six of them is roughly half a year, which is the shortest
 *  span over which a conversion change is a change rather than a fortnight. */
export const BLOCKS = 6;

/**
 * Tries at a grade in a block before its conversion is worth drawing.
 *
 * `projectHistory` uses three for sends. This counts *tries*, where a
 * single logged row can carry a count of five, so the bar is higher: at
 * four, one send and three falls is 25% and one send and one fall is 50%,
 * and calling that an improvement is the failure this whole module is
 * written around.
 */
export const ENOUGH_TRIES = 6;

export interface BlockConversion {
  from: string;
  to: string;
  sends: number;
  attempts: number;
  /** sends ÷ tries, or null when there were too few tries to say. */
  conversion: number | null;
}

export interface GradeConversion {
  grade: string;
  ordinal: number;
  blocks: BlockConversion[];
  /** Tries at this grade across the whole window. */
  tries: number;
  /** The earliest and latest blocks that had enough to report. */
  first: BlockConversion | null;
  last: BlockConversion | null;
}

export interface ConversionTrend {
  scale: GradeScale;
  from: string;
  to: string;
  /** Hardest grade first. Only grades tried in the window appear. */
  grades: GradeConversion[];
  /** The block boundaries, oldest first — one entry per column. */
  edges: { from: string; to: string }[];
}

export interface ConversionInput {
  sessions: readonly Session[];
  scale: GradeScale;
  to: string;
  blocks?: number;
  days?: number;
}

export function conversionTrend(input: ConversionInput): ConversionTrend {
  const blocks = input.blocks ?? BLOCKS;
  const days = input.days ?? BLOCK_DAYS;
  const ladder = input.scale === 'V' ? V_GRADES : YDS_GRADES;

  // Oldest first, each block ending the day before the next begins, with the
  // most recent one ending on `to`.
  const edges = Array.from({ length: blocks }, (_, i) => {
    const to = addDays(input.to, -(blocks - 1 - i) * days);
    return { from: addDays(to, -(days - 1)), to };
  });
  const from = edges[0]!.from;

  // grade → block index → counts.
  const counts = new Map<string, { sends: number[]; attempts: number[] }>();
  const blockOf = (date: string): number =>
    edges.findIndex((edge) => date >= edge.from && date <= edge.to);

  for (const session of input.sessions) {
    if (!session.completed) continue;
    const index = blockOf(session.date);
    if (index < 0) continue;
    for (const climb of session.climbs) {
      if (climb.scale !== input.scale) continue;
      let row = counts.get(climb.grade);
      if (row === undefined) {
        row = { sends: Array(blocks).fill(0), attempts: Array(blocks).fill(0) };
        counts.set(climb.grade, row);
      }
      const bucket = climb.result === 'send' ? row.sends : row.attempts;
      bucket[index] = bucket[index]! + climb.count;
    }
  }

  const grades: GradeConversion[] = [];
  for (const [grade, row] of counts) {
    const ordinal = gradeOrdinal(input.scale, grade);
    // A grade the ladder does not have is a record from an older export or
    // another app's vocabulary: counted nowhere rather than sorted to -1.
    if (ordinal < 0 || ladder[ordinal] === undefined) continue;

    const blockRows: BlockConversion[] = edges.map((edge, i) => {
      const sends = row.sends[i]!;
      const attempts = row.attempts[i]!;
      const tries = sends + attempts;
      return {
        from: edge.from,
        to: edge.to,
        sends,
        attempts,
        conversion: tries >= ENOUGH_TRIES ? sends / tries : null,
      };
    });
    const reported = blockRows.filter((b) => b.conversion !== null);
    grades.push({
      grade,
      ordinal,
      blocks: blockRows,
      tries: blockRows.reduce((n, b) => n + b.sends + b.attempts, 0),
      first: reported[0] ?? null,
      last: reported[reported.length - 1] ?? null,
    });
  }

  grades.sort((a, b) => b.ordinal - a.ordinal);
  return { scale: input.scale, from, to: input.to, grades, edges };
}

/** Grades with at least two blocks to compare, hardest first. */
export function movers(trend: ConversionTrend): GradeConversion[] {
  return trend.grades.filter((g) => g.first !== null && g.last !== null && g.first !== g.last);
}

/** Grades with at least one block worth drawing. */
export function drawable(trend: ConversionTrend): GradeConversion[] {
  return trend.grades.filter((g) => g.last !== null);
}

/**
 * Grades touched but never enough in one block to report.
 *
 * Kept out of the grid and named in the sentence instead: a row of six
 * empty cells is not a finding, and "you got on V7 four times in six
 * months" is — seen in a browser, where the V7 row said nothing at all.
 */
export function tooThin(trend: ConversionTrend): GradeConversion[] {
  return trend.grades.filter((g) => g.last === null && g.tries > 0);
}

/** "3 from 8", which carries its own sample size. */
function fromTries(block: BlockConversion): string {
  const tries = block.sends + block.attempts;
  return `${block.sends} from ${tries}`;
}

/** How far a grade's conversion moved between its first and last reportable
 *  block. Null when there are not two to compare. */
export function shift(grade: GradeConversion): number | null {
  if (grade.first === null || grade.last === null || grade.first === grade.last) return null;
  return grade.last.conversion! - grade.first.conversion!;
}

/**
 * The grade that moved most, in either direction.
 *
 * Either direction on purpose: conversion falling is what stepping up to a
 * new limit grade looks like, and a module that only reported improvements
 * would call that silence.
 */
export function biggestMover(trend: ConversionTrend): GradeConversion | null {
  let best: GradeConversion | null = null;
  let size = 0;
  for (const grade of movers(trend)) {
    const moved = Math.abs(shift(grade)!);
    if (best === null || moved > size) {
      best = grade;
      size = moved;
    }
  }
  return best;
}

/**
 * What the series says, or what is missing before it can say anything.
 *
 * Never a bare percentage: every figure is printed as the count it came
 * from, because "one in two" over two tries and over twenty are different
 * claims and only one of them is worth reading.
 */
export function describeConversion(trend: ConversionTrend, display?: GradeDisplay): string {
  const name = (grade: GradeConversion) =>
    displayGrade(trend.scale, grade.grade, display ?? DEFAULT_DISPLAY);
  if (trend.grades.length === 0) {
    return 'No climbs logged in the last six months, so there is nothing to compare.';
  }

  const mover = biggestMover(trend);
  if (mover === null) {
    const best = [...trend.grades].sort((a, b) => b.tries - a.tries)[0]!;
    const reported = trend.grades.filter((g) => g.last !== null).length;
    return reported > 0
      ? `Only one block so far has ${ENOUGH_TRIES} tries at a grade, so there is nothing to compare it against yet. Another block of climbing at the same grades and this fills in.`
      : `Nothing yet: it takes ${ENOUGH_TRIES} tries at one grade inside a single block before a conversion figure means anything, and the most tried grade here has ${best.tries} across the whole six months.`;
  }

  const moved = shift(mover)!;
  const direction = moved > 0 ? 'up' : 'down';
  const tail =
    Math.abs(moved) < 0.05
      ? `${name(mover)} is where it was — ${fromTries(mover.first!)} then, ${fromTries(mover.last!)} now.`
      : `${name(mover)} went ${direction}: ${fromTries(mover.first!)} then, ${fromTries(mover.last!)} now.`;

  return [
    tail,
    thinNote(trend, display),
    'Conversion moves before the grade does — sending the same grade in fewer tries is the thing that happens first, and a fall here is as often a step up to a harder project as it is a bad block.',
  ]
    .filter((part) => part !== '')
    .join(' ');
}

/** "V7", "V7 and V8", "V7, V8 and V9". */
function andList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

/**
 * The grades that never reached the threshold, which the grid leaves out.
 *
 * The count is the point — "you got on it five times in six months" is the
 * finding — so it is in the sentence rather than left as a missing row. An
 * earlier wording ran the two together as "V7 5 tries in six months", which
 * a browser made obvious was unreadable.
 */
function thinNote(trend: ConversionTrend, display?: GradeDisplay): string {
  const thin = tooThin(trend).slice(0, 3);
  if (thin.length === 0) return '';
  const names = andList(
    thin.map((g) => displayGrade(trend.scale, g.grade, display ?? DEFAULT_DISPLAY)),
  );
  const counts = andList(thin.map((g) => String(g.tries)));
  const total = thin.reduce((n, g) => n + g.tries, 0);
  const verb = thin.length === 1 ? 'is' : 'are';
  return `${names} ${verb} not drawn: ${counts} ${total === 1 ? 'try' : 'tries'} in six months, never ${ENOUGH_TRIES} inside one block.`;
}
