import { describe, expect, it } from 'vitest';
import {
  canonicalGrade,
  compareGrades,
  gradeOrdinal,
  isValidGrade,
  maxGrade,
  V_GRADES,
  YDS_GRADES,
} from './grades';

describe('grade ladders', () => {
  it('has the expected ladder sizes', () => {
    expect(V_GRADES).toHaveLength(18);
    expect(YDS_GRADES).toHaveLength(30);
  });

  it('canonicalizes case and whitespace', () => {
    expect(canonicalGrade('V', ' v5 ')).toBe('V5');
    expect(canonicalGrade('YDS', '5.12A')).toBe('5.12a');
    expect(canonicalGrade('V', '5.12a')).toBeNull();
  });

  it('orders grades by ladder position', () => {
    expect(gradeOrdinal('V', 'V0')).toBe(0);
    expect(gradeOrdinal('V', 'V17')).toBe(17);
    expect(gradeOrdinal('YDS', '5.10a')).toBe(6);
    expect(compareGrades('V', 'V7', 'V4')).toBeGreaterThan(0);
    expect(compareGrades('YDS', '5.11d', '5.12a')).toBeLessThan(0);
    expect(compareGrades('V', 'v3', 'V3')).toBe(0);
  });

  it('rejects unknown grades', () => {
    expect(isValidGrade('V', 'V18')).toBe(false);
    expect(gradeOrdinal('YDS', '5.16a')).toBe(-1);
    expect(() => compareGrades('V', 'V5', 'nope')).toThrow();
  });

  it('finds the max grade and ignores junk', () => {
    expect(maxGrade('V', ['v2', 'V9', 'garbage', 'V5'])).toBe('V9');
    expect(maxGrade('YDS', [])).toBeNull();
  });
});
