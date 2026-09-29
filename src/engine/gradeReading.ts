/**
 * Grades read and written by a climber (PLAN.md M345).
 *
 * Out of `grades.ts`, whose default notation the settings store and whose
 * V-scale equivalents Home's tally need at boot: where a grade sits on its
 * ladder, the hardest of several, how a climber reads one in their own
 * notation and how what they type becomes one — none of that runs before a
 * lazy page.
 */

import { canonicalGrade, type GradeDisplay, type GradeScale, LADDERS, V_GRADES, YDS_GRADES } from './grades';

/** Ordinal within the grade's own ladder, or -1 when unknown. */
export function gradeOrdinal(scale: GradeScale, grade: string): number {
  const canon = canonicalGrade(scale, grade);
  return canon === null ? -1 : LADDERS[scale].indexOf(canon);
}

/** The highest grade in a list, per ladder; null when none valid. */
export function maxGrade(scale: GradeScale, grades: readonly string[]): string | null {
  let best: string | null = null;
  let bestOrd = -1;
  for (const g of grades) {
    const ord = gradeOrdinal(scale, g);
    if (ord > bestOrd) {
      bestOrd = ord;
      best = canonicalGrade(scale, g);
    }
  }
  return best;
}

/** Fontainebleau, by V-scale rung. */
const V_TO_FONT: Record<string, string> = {
  V0: '4', V1: '5', V2: '5+', V3: '6A', V4: '6B', V5: '6C',
  V6: '7A', V7: '7A+', V8: '7B', V9: '7C', V10: '7C+', V11: '8A',
  V12: '8A+', V13: '8B', V14: '8B+', V15: '8C', V16: '8C+', V17: '9A',
};

/** French sport grades, by YDS rung. */
const YDS_TO_FRENCH: Record<string, string> = {
  '5.4': '4a', '5.5': '4b', '5.6': '4c', '5.7': '5a', '5.8': '5b', '5.9': '5c',
  '5.10a': '6a', '5.10b': '6a+', '5.10c': '6b', '5.10d': '6b+',
  '5.11a': '6c', '5.11b': '6c+', '5.11c': '7a', '5.11d': '7a+',
  '5.12a': '7b', '5.12b': '7b+', '5.12c': '7c', '5.12d': '7c+',
  '5.13a': '8a', '5.13b': '8a+', '5.13c': '8b', '5.13d': '8b+',
  '5.14a': '8c', '5.14b': '8c+', '5.14c': '9a', '5.14d': '9a+',
  '5.15a': '9b', '5.15b': '9b+', '5.15c': '9c', '5.15d': '9c+',
};

/**
 * The stored grade as the climber has asked to read it. An unknown grade is
 * returned untouched rather than blanked: a log entry from an import is
 * still worth showing even when it is off the ladder.
 */
export function displayGrade(scale: GradeScale, grade: string, display: GradeDisplay): string {
  const canon = canonicalGrade(scale, grade);
  if (canon === null) return grade;
  if (scale === 'V') return display.boulder === 'Font' ? V_TO_FONT[canon] ?? canon : canon;
  return display.route === 'French' ? YDS_TO_FRENCH[canon] ?? canon : canon;
}

/**
 * A program's grade range, in the notation the climber reads (PLAN.md M47).
 *
 * Derived rather than stored, because a stored string cannot follow a
 * preference. An editorial `label` still wins where the ladder is not the
 * point — "All Levels" says something V0-V17 does not.
 */
export function displayRange(
  range: { scale: GradeScale; min: string; max: string; label?: string },
  display: GradeDisplay,
): string {
  if (range.label !== undefined) return range.label;
  const lo = displayGrade(range.scale, range.min, display);
  const hi = displayGrade(range.scale, range.max, display);
  if (lo === hi) return lo;
  // A range that runs to the top of the ladder is open-ended, and "V3-V17"
  // reads as a band with a ceiling rather than as "V3 and up" (PLAN.md M95).
  // Derived rather than authored, so it still follows the display
  // preference — a label spelling the grade could not.
  const ladder = range.scale === 'V' ? V_GRADES : YDS_GRADES;
  if (range.max === ladder[ladder.length - 1] && range.min !== ladder[0]) return `${lo}+`;
  return `${lo}-${hi}`;
}

/**
 * Parse either notation back to the stored ladder, so a climber reading in
 * Font can also type in Font. Canonical input keeps working regardless of
 * the preference — the two notations do not collide.
 */
export function parseGrade(scale: GradeScale, input: string): string | null {
  const direct = canonicalGrade(scale, input);
  if (direct !== null) return direct;

  const needle = input.trim().toLowerCase();
  const table = scale === 'V' ? V_TO_FONT : YDS_TO_FRENCH;
  for (const [stored, alternate] of Object.entries(table)) {
    if (alternate.toLowerCase() === needle) return stored;
  }
  return null;
}
