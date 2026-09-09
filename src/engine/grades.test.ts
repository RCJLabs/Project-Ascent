import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY,
  canonicalGrade,
  compareGrades,
  displayGrade,
  gradeOrdinal,
  isValidGrade,
  maxGrade,
  parseGrade,
  V_GRADES,
  YDS_GRADES,
  type GradeDisplay,
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

describe('display scales', () => {
  const font: GradeDisplay = { boulder: 'Font', route: 'YDS' };
  const french: GradeDisplay = { boulder: 'V', route: 'French' };

  it('leaves grades alone on the default notation', () => {
    expect(displayGrade('V', 'V5', DEFAULT_DISPLAY)).toBe('V5');
    expect(displayGrade('YDS', '5.12a', DEFAULT_DISPLAY)).toBe('5.12a');
  });

  it('converts boulders to Fontainebleau', () => {
    expect(displayGrade('V', 'V0', font)).toBe('4');
    expect(displayGrade('V', 'V6', font)).toBe('7A');
    expect(displayGrade('V', 'V17', font)).toBe('9A');
  });

  it('converts routes to French', () => {
    expect(displayGrade('YDS', '5.9', french)).toBe('5c');
    expect(displayGrade('YDS', '5.12a', french)).toBe('7b');
    expect(displayGrade('YDS', '5.15d', french)).toBe('9c+');
  });

  it('changes only the ladder it was asked to change', () => {
    expect(displayGrade('YDS', '5.12a', font)).toBe('5.12a');
    expect(displayGrade('V', 'V5', french)).toBe('V5');
  });

  it('canonicalises before converting, so casing does not matter', () => {
    expect(displayGrade('V', 'v6', font)).toBe('7A');
  });

  // An imported log entry off the ladder is still worth showing.
  it('passes an unknown grade through untouched', () => {
    expect(displayGrade('V', 'V99', font)).toBe('V99');
    expect(displayGrade('YDS', '5.16z', french)).toBe('5.16z');
  });

  it('covers every rung of both ladders', () => {
    for (const g of V_GRADES) expect(displayGrade('V', g, font)).not.toBe(g);
    for (const g of YDS_GRADES) expect(displayGrade('YDS', g, french)).not.toBe(g);
  });

  it('never maps two rungs onto the same label', () => {
    const fonts = V_GRADES.map((g) => displayGrade('V', g, font));
    expect(new Set(fonts).size).toBe(V_GRADES.length);
    const frenchs = YDS_GRADES.map((g) => displayGrade('YDS', g, french));
    expect(new Set(frenchs).size).toBe(YDS_GRADES.length);
  });

  it('stays monotonic, so a harder grade never reads as an easier one', () => {
    // Font and French both sort naturally within their own numbering.
    const rank = (s: string) => {
      const m = /^(\d+)([A-Za-z]?)(\+?)$/.exec(s);
      if (!m) throw new Error(`unparsed ${s}`);
      return Number(m[1]) * 100 + (m[2] ? m[2].toLowerCase().charCodeAt(0) - 96 : 0) * 10 + (m[3] ? 5 : 0);
    };
    const fonts = V_GRADES.map((g) => rank(displayGrade('V', g, font)));
    expect(fonts).toEqual([...fonts].sort((a, b) => a - b));
    const frenchs = YDS_GRADES.map((g) => rank(displayGrade('YDS', g, french)));
    expect(frenchs).toEqual([...frenchs].sort((a, b) => a - b));
  });
});

describe('parsing either notation', () => {
  it('accepts the stored ladder regardless of preference', () => {
    expect(parseGrade('V', 'V7')).toBe('V7');
    expect(parseGrade('V', 'v7')).toBe('V7');
    expect(parseGrade('YDS', '5.11c')).toBe('5.11c');
  });

  it('accepts the alternate notation and stores canonically', () => {
    expect(parseGrade('V', '7A')).toBe('V6');
    expect(parseGrade('V', '7a')).toBe('V6');
    expect(parseGrade('YDS', '7b')).toBe('5.12a');
  });

  it('round-trips every rung through its alternate label', () => {
    const font: GradeDisplay = { boulder: 'Font', route: 'YDS' };
    for (const g of V_GRADES) expect(parseGrade('V', displayGrade('V', g, font))).toBe(g);
    const french: GradeDisplay = { boulder: 'V', route: 'French' };
    for (const g of YDS_GRADES) expect(parseGrade('YDS', displayGrade('YDS', g, french))).toBe(g);
  });

  it('rejects nonsense', () => {
    expect(parseGrade('V', 'banana')).toBeNull();
    expect(parseGrade('YDS', '')).toBeNull();
  });

  // The two notations for one ladder must not collide, or a typed grade
  // would mean different things depending on a setting.
  it('has no label meaning two different grades on one ladder', () => {
    const font: GradeDisplay = { boulder: 'Font', route: 'French' };
    const vLabels = [...V_GRADES, ...V_GRADES.map((g) => displayGrade('V', g, font))];
    expect(new Set(vLabels.map((l) => l.toLowerCase())).size).toBe(vLabels.length);
    const ydsLabels = [...YDS_GRADES, ...YDS_GRADES.map((g) => displayGrade('YDS', g, font))];
    expect(new Set(ydsLabels.map((l) => l.toLowerCase())).size).toBe(ydsLabels.length);
  });
});
