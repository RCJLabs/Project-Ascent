import { useCallback } from 'react';
import { displayGrade, type GradeScale } from '@/engine/grades';
import { useSettings } from '@/store/settings';

/**
 * Render a stored grade in the notation the climber reads.
 *
 * One hook rather than threading the preference through every component:
 * grades appear in a dozen places and any site that forgot would quietly
 * show V-scale to a Font climber, which is the kind of bug nobody reports
 * and everybody notices.
 */
export function useGradeLabel(): (scale: GradeScale, grade: string) => string {
  const display = useSettings((s) => s.display);
  return useCallback((scale, grade) => displayGrade(scale, grade, display), [display]);
}

/** The ladder as labels, for a picker that stores canonical values. */
export function useGradeOptions(): (scale: GradeScale, grades: readonly string[]) => { value: string; label: string }[] {
  const label = useGradeLabel();
  return useCallback(
    (scale, grades) => grades.map((value) => ({ value, label: label(scale, value) })),
    [label],
  );
}
