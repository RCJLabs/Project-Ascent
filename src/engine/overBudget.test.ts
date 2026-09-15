import { beforeAll, describe, expect, it } from 'vitest';
import { findProgram, type FinderInput } from './finder';
import { loadPrograms } from '@/content/programs';

/**
 * The promise the page could not keep (PLAN.md M193).
 *
 * `recommend` never filters on the clock and `finder.test.ts` pins that.
 * `findProgram` shows three programs, so the ten points a long session costs
 * were enough to push one off the screen — and the finder tells the climber,
 * in words, that this does not happen.
 */

const base: FinderInput = {
  discipline: 'boulder',
  experience: 'intermediate',
  boulderGrade: 'V4',
  goal: 'power',
  daysPerWeek: 3,
  equipment: ['wall', 'hangboard', 'weight'],
};

const GOALS = [
  'prep', 'fundamentals', 'technique', 'power', 'fingers',
  'endurance', 'dynamic', 'project', 'maintain',
] as const;
const EXPERIENCE = ['new', 'returning', 'intermediate', 'advanced'] as const;
const BUDGETS = [45, 60, 90] as const;

/** Every answer profile the sweep below walks. */
function* profiles(): Generator<{ open: FinderInput; budget: number }> {
  for (const goal of GOALS) {
    for (const experience of EXPERIENCE) {
      for (const daysPerWeek of [2, 3, 4, 5]) {
        for (const budget of BUDGETS) {
          yield { open: { ...base, goal, experience, daysPerWeek }, budget };
        }
      }
    }
  }
}

const onScreen = (r: ReturnType<typeof findProgram>): string[] =>
  [r.top, ...r.alternatives, ...r.overBudget].map((x) => x.program.id);

beforeAll(async () => {
  await loadPrograms();
});

describe('the clock moves a program down the list and never off it', () => {
  it('has profiles where a budget costs a program its place — or this proves nothing', () => {
    // The self-check the rest of the file rests on (PLAN.md M169). An
    // absence assertion over a sweep that never reaches the interesting
    // case passes for the wrong reason, and that is exactly how the defect
    // lived through M138's tests.
    let affected = 0;
    let cases = 0;
    for (const { open, budget } of profiles()) {
      const tight = findProgram({ ...open, minutesPerSession: budget });
      if (tight.overBudget.length > 0) {
        affected++;
        cases += tight.overBudget.length;
      }
    }
    expect(affected).toBe(90);
    expect(cases).toBe(94);
  });

  it('keeps every program the budget would have displaced', () => {
    for (const { open, budget } of profiles()) {
      const before = findProgram(open);
      const after = findProgram({ ...open, minutesPerSession: budget });
      const wasShown = [before.top, ...before.alternatives].map((r) => r.program.id);
      const nowShown = new Set(onScreen(after));
      for (const id of wasShown) {
        expect(nowShown.has(id), `${id} at ${budget} min, ${open.goal}/${open.experience}`).toBe(true);
      }
    }
  });

  it('says by how much, on every card it rescues', () => {
    // Half a promise is the failure mode this rule was written around: the
    // counterfactual ranks with the clock unset, and a recommendation from
    // that ranking carries no fit line at all.
    let checked = 0;
    for (const { open, budget } of profiles()) {
      for (const rec of findProgram({ ...open, minutesPerSession: budget }).overBudget) {
        expect(rec.cautions.some((c) => c.includes(`past ${budget} min`))).toBe(true);
        checked++;
      }
    }
    expect(checked).toBe(94);
  });

  it('is empty when no evening was stated', () => {
    for (const { open } of profiles()) {
      expect(findProgram(open).overBudget).toEqual([]);
    }
  });

  it('never repeats a program already on the page', () => {
    for (const { open, budget } of profiles()) {
      const ids = onScreen(findProgram({ ...open, minutesPerSession: budget }));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('cannot name a program that is out of reach', () => {
    // Out of reach is a different section and a harder fact, and the rule
    // does not need a guard against it: the ids come from the
    // counterfactual's pick and alternatives, and those are drawn from the
    // viable list. A guard filtered nothing across every profile here, so
    // this pins the invariant that makes it unnecessary rather than the
    // dead branch — an assertion inside a loop that never runs is how the
    // first draft of this test passed for no reason (PLAN.md M169).
    let named = 0;
    for (const { open } of profiles()) {
      // `['none']` earns its place: it leaves exactly one program
      // unblocked, so the pick and both alternatives cannot all come from
      // the viable list unless the code puts them there. The richer sets
      // leave five and eight, which is enough slack to hide that.
      for (const equipment of [['none'], ['wall'], ['wall', 'hangboard', 'weight']]) {
        const before = findProgram({ ...open, equipment: equipment as FinderInput['equipment'] });
        for (const rec of [before.top, ...before.alternatives]) {
          named++;
          expect(rec.blockers).toEqual([]);
        }
      }
    }
    // The self-check: the loop above has to have run on something, and on
    // more than the pick alone.
    expect(named).toBe(3024);
  });

  it('leaves the pick and the alternatives alone', () => {
    // The signal stays soft in both directions: rescuing the displaced
    // program must not also undo the ranking that displaced it.
    const open: FinderInput = { ...base, goal: 'maintain', daysPerWeek: 4 };
    const tight = findProgram({ ...open, minutesPerSession: 45 });
    expect(tight.overBudget.map((r) => r.program.id)).toEqual(['gravity_defied']);
    expect(tight.top.program.id).not.toBe('gravity_defied');
    expect(tight.alternatives.map((r) => r.program.id)).not.toContain('gravity_defied');
  });

  it('does not rescue a program the fallback never showed', () => {
    // Below the catalogue's floor the answer is open logging, which no
    // ranking put on screen, so there is nothing for the clock to have
    // taken away (PLAN.md M150).
    const thin = findProgram({ ...base, daysPerWeek: 1, minutesPerSession: 45 });
    expect(thin.fallback).toBe(true);
    expect(thin.overBudget).toEqual([]);
  });
});
