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
