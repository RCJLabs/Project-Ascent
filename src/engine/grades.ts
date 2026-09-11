/**
 * Grade ladders (PLAN.md §3). Grades are stored as canonical display
 * strings on two ladders; ordinal position within a ladder is the only
 * numeric meaning. Cross-ladder equivalence (for reward scaling) lands
 * with the economy in M4; display conversion to Font/French is a later
 * settings feature.
 */

export type GradeScale = 'V' | 'YDS';

export const V_GRADES = [
  'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9',
  'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17',
] as const;

export const YDS_GRADES = [
  '5.4', '5.5', '5.6', '5.7', '5.8', '5.9',
  '5.10a', '5.10b', '5.10c', '5.10d',
  '5.11a', '5.11b', '5.11c', '5.11d',
  '5.12a', '5.12b', '5.12c', '5.12d',
  '5.13a', '5.13b', '5.13c', '5.13d',
  '5.14a', '5.14b', '5.14c', '5.14d',
  '5.15a', '5.15b', '5.15c', '5.15d',
] as const;

const LADDERS: Record<GradeScale, readonly string[]> = {
  V: V_GRADES,
  YDS: YDS_GRADES,
};

/** Case-insensitive canonicalization ("v5" → "V5"); null if not on the ladder. */
export function canonicalGrade(scale: GradeScale, grade: string): string | null {
  const needle = grade.trim().toLowerCase();
  const hit = LADDERS[scale].find((g) => g.toLowerCase() === needle);
  return hit ?? null;
}

/** Ordinal within the grade's own ladder, or -1 when unknown. */
export function gradeOrdinal(scale: GradeScale, grade: string): number {
  const canon = canonicalGrade(scale, grade);
  return canon === null ? -1 : LADDERS[scale].indexOf(canon);
}

export function isValidGrade(scale: GradeScale, grade: string): boolean {
  return canonicalGrade(scale, grade) !== null;
}

/** Positive when a > b, on the same ladder. Throws on mixed scales —
 *  cross-scale comparison is a deliberate non-feature (AUDIT.md: PRs are
 *  partitioned per ladder so a boulderer's first 5.12a is a real PR). */
export function compareGrades(scale: GradeScale, a: string, b: string): number {
  const oa = gradeOrdinal(scale, a);
  const ob = gradeOrdinal(scale, b);
  if (oa < 0 || ob < 0) throw new Error(`Unknown ${scale} grade: ${oa < 0 ? a : b}`);
  return oa - ob;
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

/**
 * Rough V-equivalent of a route grade, for reward scaling only.
 *
 * Bouldering and route grades measure different things, and no honest table
 * makes them the same. This one exists so a 5.13a send is not worth the same
 * XP as a 5.7, and it is used nowhere else — pyramids, records and
 * projections stay strictly per-ladder (AUDIT.md: a boulderer's first 5.12a
 * is a real record on its own ladder).
 *
 * The mapping is a coach's judgment call, not a standard. It is one table
 * so it can be argued with and changed in one place.
 */
const YDS_TO_V: Record<string, number> = {
  '5.4': 0, '5.5': 0, '5.6': 0, '5.7': 0, '5.8': 0, '5.9': 0,
  '5.10a': 0, '5.10b': 0, '5.10c': 1, '5.10d': 1,
  '5.11a': 1, '5.11b': 2, '5.11c': 2, '5.11d': 2,
  '5.12a': 3, '5.12b': 3, '5.12c': 4, '5.12d': 4,
  '5.13a': 5, '5.13b': 6, '5.13c': 7, '5.13d': 8,
  '5.14a': 9, '5.14b': 10, '5.14c': 11, '5.14d': 12,
  '5.15a': 13, '5.15b': 14, '5.15c': 15, '5.15d': 16,
};

/** V-scale difficulty used for reward scaling; -1 when the grade is unknown. */
export function vEquivalent(scale: GradeScale, grade: string): number {
  const canon = canonicalGrade(scale, grade);
  if (canon === null) return -1;
  return scale === 'V' ? V_GRADES.indexOf(canon as (typeof V_GRADES)[number]) : YDS_TO_V[canon] ?? -1;
}

// ── Display scales (PLAN.md §9.8) ─────────────────────────────────────────
//
// Grades are *stored* on the V and YDS ladders and nothing below changes
// that. What follows converts a stored grade into the notation the climber
// reads, so a French or Fontainebleau climber sees their own numbers without
// the log meaning something different on their phone than on anyone else's.
//
// The tables are one-to-one by rung, which is a simplification. Real
// conversion charts hedge — V3 is usually written "6A/6A+" — and pretending
// otherwise would be false precision. A single rung per grade is chosen
// because a log needs one label per entry, and the UI says out loud that
// the conversion is approximate rather than implying it is exact.

/** Notation for boulder grades. */
export type BoulderDisplay = 'V' | 'Font';
/** Notation for route grades. */
export type RouteDisplay = 'YDS' | 'French';

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

export interface GradeDisplay {
  boulder: BoulderDisplay;
  route: RouteDisplay;
}

export const DEFAULT_DISPLAY: GradeDisplay = { boulder: 'V', route: 'YDS' };

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

/** Which notation a ladder is currently being read in. */
export function displayNameFor(scale: GradeScale, display: GradeDisplay): string {
  return scale === 'V' ? display.boulder : display.route;
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
