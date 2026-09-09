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
