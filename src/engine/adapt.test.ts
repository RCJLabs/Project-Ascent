import { describe, expect, it } from 'vitest';
import { GRAVITY_DEFIED, PROGRAMS, THE_LONG_GAME } from '@/content/programs';
import { adaptProgram, apportion, lengthsFor, MIN_ADAPTED_WEEKS, MIN_DELOAD_GAP } from './adapt';

/**
 * A program over fewer weeks (PLAN.md M56).
 *
 * The invariants matter more than any one example: phases must still tile
 * the block with no gap or overlap, every phase must still exist so its
 * prescriptions have somewhere to live, and nothing may point at a week the
 * program no longer has.
 */

describe('apportion', () => {
  it('gives every phase a week and spends exactly the weeks it has', () => {
    for (const weeks of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const out = apportion([4, 4, 4], weeks);
      expect(out.reduce((n, l) => n + l, 0), `${weeks}`).toBe(weeks);
      for (const size of out) expect(size, `${weeks}`).toBeGreaterThan(0);
    }
  });

  it('keeps the proportions it was given', () => {
    expect(apportion([6, 3, 3], 8)).toEqual([4, 2, 2]);
    expect(apportion([4, 4, 4], 6)).toEqual([2, 2, 2]);
  });

  it('drops the tail rather than give a phase no weeks at all', () => {
    const out = apportion([4, 4, 4], 2);
    expect(out.reduce((n, l) => n + l, 0)).toBeLessThanOrEqual(2);
    for (const size of out) expect(size).toBeGreaterThan(0);
  });
});

describe('adaptProgram', () => {
  it('leaves a program alone when there is nothing to do', () => {
    expect(adaptProgram(GRAVITY_DEFIED, GRAVITY_DEFIED.weeks)).toBe(GRAVITY_DEFIED);
    expect(adaptProgram(GRAVITY_DEFIED, 0)).toBe(GRAVITY_DEFIED);
    expect(adaptProgram(GRAVITY_DEFIED, Number.NaN)).toBe(GRAVITY_DEFIED);
  });

  it('says it is adapted, and says what from', () => {
    const six = adaptProgram(GRAVITY_DEFIED, 6);
    expect(six.weeks).toBe(6);
    expect(six.adaptedFrom).toBe(12);
    expect(GRAVITY_DEFIED.adaptedFrom).toBeUndefined();
  });

  // The invariant `prescription.ts` and every guide check depend on.
  it('keeps phases tiling the block with no gap or overlap', () => {
    for (const program of PROGRAMS) {
      if (program.phases.length === 0) continue;
      for (const weeks of lengthsFor(program)) {
        const out = adaptProgram(program, weeks);
        let expected = 1;
        for (const phase of out.phases) {
          expect(phase.weekStart, `${program.id}@${weeks}`).toBe(expected);
          expect(phase.weekEnd, `${program.id}@${weeks}`).toBeGreaterThanOrEqual(phase.weekStart);
          expected = phase.weekEnd + 1;
        }
        expect(expected - 1, `${program.id}@${weeks}`).toBe(out.weeks);
      }
    }
  });

  // Prescriptions are keyed by phase id, so a lost phase is a lost block.
  it('keeps every phase, with its id and its prescriptions', () => {
    for (const program of PROGRAMS) {
      if (program.phases.length === 0) continue;
      const shortest = lengthsFor(program)[0]!;
      const out = adaptProgram(program, shortest);
      expect(out.phases.map((p) => p.id), program.id).toEqual(program.phases.map((p) => p.id));
      for (const type of out.sessionTypes) {
        const original = program.sessionTypes.find((t) => t.id === type.id)!;
        expect(type.blocks, `${program.id}/${type.id}`).toBe(original.blocks);
      }
    }
  });

  it('never points a drill at a week the program no longer has', () => {
    for (const program of PROGRAMS) {
      for (const weeks of lengthsFor(program)) {
        const out = adaptProgram(program, weeks);
        for (const type of out.sessionTypes) {
          for (const week of Object.keys(type.drillsByWeek ?? {}).map(Number)) {
            expect(week, `${program.id}@${weeks}/${type.id}`).toBeGreaterThanOrEqual(1);
            expect(week, `${program.id}@${weeks}/${type.id}`).toBeLessThanOrEqual(out.weeks);
          }
        }
        for (const week of out.deloadWeeks ?? []) {
          expect(week, `${program.id}@${weeks}`).toBeGreaterThanOrEqual(1);
          expect(week, `${program.id}@${weeks}`).toBeLessThanOrEqual(out.weeks);
        }
      }
    }
  });

  // Reading `drillsByWeek[week]` straight off the adapted week number gives
  // the right *number* of drills and the wrong ones — the last week of a
  // six-week block should be doing week twelve's drill, not week six's.
  it('takes each week\u2019s drill from the week it stands for', () => {
    const six = adaptProgram(GRAVITY_DEFIED, 6);
    for (const type of six.sessionTypes) {
      const original = GRAVITY_DEFIED.sessionTypes.find((t) => t.id === type.id)!;
      if (!original.drillsByWeek || !type.drillsByWeek) continue;
      expect(type.drillsByWeek[6], `${type.id} last week`).toBe(original.drillsByWeek[12]);
      expect(type.drillsByWeek[1], `${type.id} first week`).toBe(original.drillsByWeek[1]);
    }
  });

  it('carries a drill for every week it has, where the program had one', () => {
    const six = adaptProgram(GRAVITY_DEFIED, 6);
    for (const type of six.sessionTypes) {
      const original = GRAVITY_DEFIED.sessionTypes.find((t) => t.id === type.id)!;
      if (!original.drillsByWeek || Object.keys(original.drillsByWeek).length < GRAVITY_DEFIED.weeks) continue;
      expect(Object.keys(type.drillsByWeek ?? {}), type.id).toHaveLength(6);
    }
  });
});

describe('where the deloads land', () => {
  // Gravity Defied deloads on weeks 4 and 8 — the last week of its first two
  // phases. Compressed to six, that rule alone would deload every other
  // week, which is a holiday rather than a block.
  it('thins deloads that compression would stack up', () => {
    const six = adaptProgram(GRAVITY_DEFIED, 6);
    expect(GRAVITY_DEFIED.deloadWeeks).toEqual([4, 8]);
    expect(six.deloadWeeks).toEqual([4]);
  });

  it('never leaves two deloads closer than the minimum gap', () => {
    for (const program of PROGRAMS) {
      for (const weeks of lengthsFor(program)) {
        const out = adaptProgram(program, weeks);
        const deloads = out.deloadWeeks ?? [];
        for (let i = 1; i < deloads.length; i += 1) {
          expect(deloads[i]! - deloads[i - 1]!, `${program.id}@${weeks}`).toBeGreaterThanOrEqual(MIN_DELOAD_GAP);
        }
      }
    }
  });

  // A block that ends on a deload ends on nothing — of an *adapted* one.
  // The Cruiser deloads on its own week 12 on purpose: it is a maintenance
  // program, and where the author puts a deload is the author's business.
  it('never ends an adapted block on a deload', () => {
    for (const program of PROGRAMS) {
      for (const weeks of lengthsFor(program)) {
        if (weeks === program.weeks) continue;
        const out = adaptProgram(program, weeks);
        expect(out.deloadWeeks ?? [], `${program.id}@${weeks}`).not.toContain(out.weeks);
      }
    }
  });

  it('keeps a phase-final deload on the last week of its phase', () => {
    const eight = adaptProgram(THE_LONG_GAME, 8);
    for (const week of eight.deloadWeeks ?? []) {
      const phase = eight.phases.find((p) => week >= p.weekStart && week <= p.weekEnd)!;
      expect(week, `week ${week}`).toBe(phase.weekEnd);
    }
  });
});

describe('lengthsFor', () => {
  it('never offers fewer weeks than the program has phases', () => {
    for (const program of PROGRAMS) {
      for (const weeks of lengthsFor(program)) {
        expect(weeks, program.id).toBeGreaterThanOrEqual(program.phases.length);
      }
    }
  });

  it('never offers to compress a written block below four weeks', () => {
    for (const program of PROGRAMS) {
      for (const weeks of lengthsFor(program)) {
        if (weeks === program.weeks) continue;
        expect(weeks, program.id).toBeGreaterThanOrEqual(MIN_ADAPTED_WEEKS);
      }
    }
  });

  // The floor is the greater of the two: a program with more phases than
  // four weeks can hold cannot be compressed to four.
  it('never offers fewer weeks than a phase-heavy program needs', () => {
    const many = {
      ...GRAVITY_DEFIED,
      weeks: 24,
      phases: Array.from({ length: 6 }, (_, i) => ({
        ...GRAVITY_DEFIED.phases[0]!,
        id: `p${i}` as (typeof GRAVITY_DEFIED.phases)[number]['id'],
        weekStart: i * 4 + 1,
        weekEnd: i * 4 + 4,
      })),
    };
    expect(lengthsFor(many)[0]).toBeGreaterThanOrEqual(6);
    expect(lengthsFor(many)).not.toContain(4);
  });

  it('leaves a program written short at its own length', () => {
    const short = { ...GRAVITY_DEFIED, weeks: 3, phases: GRAVITY_DEFIED.phases.slice(0, 1) };
    expect(lengthsFor(short)).toEqual([3]);
  });

  it('ends at the program as written', () => {
    for (const program of PROGRAMS) {
      const offered = lengthsFor(program);
      expect(offered[offered.length - 1], program.id).toBe(program.weeks);
      expect(new Set(offered).size, program.id).toBe(offered.length);
    }
  });
});
