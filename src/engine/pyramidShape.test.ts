import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPrograms } from '@/content/programs';
import { demoClimber } from './demoClimber';
import { deriveClimberState } from './derive';
import { pyramid, type PyramidRow } from './progress';
import {
  ENOUGH_SENDS,
  ESTABLISHED,
  WORKING_BAND,
  describePyramid,
  readPyramid,
} from './pyramidShape';

/**
 * The pyramid was drawn and never read (PLAN.md M165).
 */

const plain = (grade: string) => grade;

/** Rows as `pyramid()` produces them: hardest first. */
const rows = (...counts: [string, number][]): PyramidRow[] =>
  counts.map(([grade, sends]) => ({ grade, sends, attempts: 0, conversion: sends > 0 ? 1 : null }));

const total = (r: PyramidRow[]) => r.reduce((n, x) => n + x.sends, 0);

beforeAll(async () => {
  await loadPrograms();
});

describe('the finding, which is that nothing read the shape', () => {
  /**
   * The claim the milestone rests on, held against the source. `plateau.ts`
   * calls `pyramid()` and reads one row at a time — a grade with attempts and
   * no sends — and `conversion.ts` reads a ratio *inside* a row. Neither puts
   * two adjacent grades side by side, which is the only thing a pyramid's
   * shape can mean.
   */
  it('is the only module that compares one grade to the next', () => {
    const readers = ['src/engine/plateau.ts', 'src/engine/conversion.ts', 'src/engine/progress.ts'];
    for (const path of readers) {
      const source = readFileSync(path, 'utf8');
      // The shape of an adjacent-row comparison: an index and its neighbour.
      expect(source, path).not.toMatch(/rows\[i \+ 1\]|rows\[i - 1\]|\[i \+ 1\]!\.sends/);
    }
    expect(readFileSync('src/engine/pyramidShape.ts', 'utf8')).toMatch(/band\[i \+ 1\]/);
  });
});

describe('what it says nothing about', () => {
  it('is silent on a log too small to have a shape', () => {
    const small = rows(['V5', 9], ['V4', 1]);
    expect(total(small)).toBeLessThan(ENOUGH_SENDS);
    expect(readPyramid(small, total(small))).toBeNull();
  });

  /**
   * The shipped demo climber is a textbook pyramid — 7 sends at V6 over 48 at
   * V5 over 138 at V4 — and a rule that fired on it would be firing on the
   * healthy case. Held here because the demo is the one realistic log this
   * repo ships and can check itself against.
   */
  it('is silent on the sample climber, whose pyramid is a pyramid', () => {
    const state = deriveClimberState(demoClimber('2026-09-14').sessions);
    const boulder = pyramid(state.boulder, 'V');
    expect(boulder.length).toBeGreaterThan(3);
    expect(state.boulder.totalSends).toBeGreaterThan(ENOUGH_SENDS);
    expect(readPyramid(boulder, state.boulder.totalSends)).toBeNull();
  });

  it('is silent on an ordinary pyramid', () => {
    const fine = rows(['V6', 3], ['V5', 12], ['V4', 30], ['V3', 44]);
    expect(readPyramid(fine, total(fine))).toBeNull();
  });

  /**
   * A tie is not an inversion. Equal sends at two grades is a climber moving
   * between them, which is what consolidating looks like.
   */
  it('is silent when two grades are level', () => {
    const level = rows(['V6', 10], ['V5', 10], ['V4', 20]);
    expect(readPyramid(level, total(level))).toBeNull();
  });

  /**
   * And on a top band that is merely new. One send at a grade over nothing
   * below it is every climber the week they first touch it — the case the
   * second brainstorm shelved *"a thin top"* for, and the reason the upper
   * row has to be established first.
   */
  it('is silent on a grade touched once, which is a good month', () => {
    const fresh = rows(['V7', ESTABLISHED - 1], ['V6', 0], ['V5', 30]);
    expect(readPyramid(fresh, total(fresh))).toBeNull();
  });

  it('is silent on a single-row ladder', () => {
    const one = rows(['V5', 40]);
    expect(readPyramid(one, total(one))).toBeNull();
  });

  it('is silent on no rows at all', () => {
    expect(readPyramid([], 0)).toBeNull();
    expect(readPyramid([], 500)).toBeNull();
  });

  /**
   * The confound, as a test. A climber three years in has a fat V2 row from
   * when V2 was the session and a thin V6 row because V6 is four goes on a
   * Tuesday — so an inversion far down the ladder is a statement about the
   * log, not the climber, and the band is what keeps it out.
   */
  it('is silent on an inversion below the working band', () => {
    const history = rows(['V6', 4], ['V5', 20], ['V4', 40], ['V3', 60], ['V2', 80], ['V1', 2]);
    // V2 over V1 is an inversion, and it is five rows down: the grade they
    // stopped logging, not a grade they skipped.
    expect(history[4]!.sends).toBeGreaterThan(history[5]!.sends);
    expect(readPyramid(history, total(history))).toBeNull();
    expect(WORKING_BAND).toBeLessThan(history.length);
  });
});

describe('the inversion it does report', () => {
  it('names the grade and the one under it', () => {
    const top = rows(['V6', 12], ['V5', 4], ['V4', 30]);
    const found = readPyramid(top, total(top))!;
    expect(found.grade).toBe('V6');
    expect(found.sends).toBe(12);
    expect(found.below).toBe('V5');
    expect(found.belowSends).toBe(4);
    expect(found.empty).toBe(false);
  });

  /**
   * A zero directly under an established grade is the sharpest form of this,
   * which is why the *lower* row has no floor: requiring three sends below
   * would rule out exactly the case worth reporting.
   */
  it('reports a grade with nothing under it at all', () => {
    const skipped = rows(['V6', 6], ['V5', 0], ['V4', 30]);
    const found = readPyramid(skipped, total(skipped))!;
    expect(found.empty).toBe(true);
    expect(found.belowSends).toBe(0);
  });

  /** At most one, and the highest, because that is the grade being worked now. */
  it('takes the highest of several rather than listing them', () => {
    const messy = rows(['V7', 8], ['V6', 2], ['V5', 20], ['V4', 1]);
    expect(total(messy), 'the fixture is under the floor').toBeGreaterThanOrEqual(ENOUGH_SENDS);
    const found = readPyramid(messy, total(messy))!;
    // V7 over V6 and V5 over V4 are both inversions; the top one is the
    // grade being worked now, and the only one reported.
    expect(found.grade).toBe('V7');
    expect(found.below).toBe('V6');
  });

  it('reads the band from the top, not from the bottom', () => {
    // An inversion at the edge of the band is in; one past it is not.
    const edge = rows(['V7', 20], ['V6', 20], ['V5', 20], ['V6b', 5], ['V4', 1]);
    expect(readPyramid(edge, total(edge))!.grade).toBe('V5');
  });

  /**
   * Literals, not `ESTABLISHED ± 1`. A test written against the constant
   * moves with it and asserts nothing about where the line is — the battery
   * showed that by setting it to one and surviving.
   */
  it('needs the grade above to be established, not merely present', () => {
    expect(ESTABLISHED).toBe(3);
    expect(readPyramid(rows(['V6', 1], ['V5', 0], ['V4', 40]), 41)).toBeNull();
    expect(readPyramid(rows(['V6', 2], ['V5', 0], ['V4', 40]), 42)).toBeNull();
    expect(readPyramid(rows(['V6', 3], ['V5', 0], ['V4', 40]), 43)).not.toBeNull();
  });

  /**
   * And nothing it reports is ever below that, which is what lets the
   * sentence say "sends" with no singular branch to go wrong.
   */
  it('never reports a grade below the established floor', () => {
    for (let sends = 0; sends < 12; sends += 1) {
      const found = readPyramid(rows(['V6', sends], ['V5', 0], ['V4', 40]), 60);
      if (found !== null) expect(found.sends).toBeGreaterThanOrEqual(ESTABLISHED);
    }
  });

  it('needs a log big enough to have a shape', () => {
    const shape = rows(['V6', 6], ['V5', 0], ['V4', 0]);
    expect(readPyramid(shape, ENOUGH_SENDS - 1)).toBeNull();
    expect(readPyramid(shape, ENOUGH_SENDS)).not.toBeNull();
  });
});

describe('what it says out loud', () => {
  const say = (r: PyramidRow[]) => describePyramid(readPyramid(r, Math.max(total(r), ENOUGH_SENDS)), plain);

  it('says nothing when there is nothing to say', () => {
    expect(describePyramid(null, plain)).toBeNull();
  });

  it('quotes both counts, so the climber can check it', () => {
    const said = say(rows(['V6', 12], ['V5', 4], ['V4', 30]))!;
    expect(said).toMatch(/12 sends at V6/);
    expect(said).toMatch(/4 at V5/);
  });

  it('says nothing at all is nothing at all', () => {
    const said = say(rows(['V6', 3], ['V5', 0], ['V4', 30]))!;
    expect(said).toMatch(/nothing at V5 at all/);
    expect(said).toMatch(/3 sends at V6/);
  });

  /**
   * The rule `angles.ts` set and this follows: the log cannot tell a thin
   * base from a thin record of one, so the sentence names both and stops. A
   * verdict here would be the app telling a climber their base is weak on the
   * evidence that they stopped logging warm-ups.
   */
  it('names both readings and picks neither', () => {
    const said = say(rows(['V6', 12], ['V5', 4], ['V4', 30]))!;
    expect(said).toMatch(/moved past before consolidating/);
    expect(said).toMatch(/stopped writing down/);
    expect(said).toMatch(/only you know which/);
  });

  it('never calls it a weakness or a problem', () => {
    const said = say(rows(['V6', 12], ['V5', 4], ['V4', 30]))!;
    expect(said).not.toMatch(/weak|weakness|problem|wrong|should have|you need to/i);
  });

  /** And when it does advise, it is one thing, at the named grade. */
  it('offers the one thing that fixes it, if it is the first reading', () => {
    const said = say(rows(['V6', 12], ['V5', 4], ['V4', 30]))!;
    expect(said).toMatch(/a block of volume at V5/);
  });

  it('speaks the climber’s own grade dialect', () => {
    const font = (grade: string) => (grade === 'V6' ? '7A' : grade === 'V5' ? '6C+' : grade);
    const said = describePyramid(readPyramid(rows(['V6', 12], ['V5', 4]), 40), font)!;
    expect(said).toMatch(/7A/);
    expect(said).toMatch(/6C\+/);
    expect(said).not.toMatch(/V6|V5/);
  });
});
