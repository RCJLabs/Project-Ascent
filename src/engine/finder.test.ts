import { describe, expect, it } from 'vitest';
import { findProgram, recommend, type FinderInput } from './finder';

const ALL_GEAR: FinderInput['equipment'] = ['wall', 'hangboard', 'campus', 'gym'];

function input(over: Partial<FinderInput> = {}): FinderInput {
  return {
    discipline: 'both',
    experience: 'intermediate',
    boulderGrade: 'V4',
    goal: 'technique',
    daysPerWeek: 4,
    equipment: ALL_GEAR,
    ...over,
  };
}

describe('finder', () => {
  it('sends a complete beginner to Ground Zero', () => {
    const { top } = findProgram(input({ experience: 'new', goal: 'prep', boulderGrade: undefined }));
    expect(top.program.id).toBe('ground_zero');
    expect(top.reasons.join(' ')).toMatch(/starting point/i);
  });

  it('sends a V6 climber whose goal is fingers to Iron Grip', () => {
    const { top } = findProgram(input({ boulderGrade: 'V6', goal: 'fingers' }));
    expect(top.program.id).toBe('iron_grip');
  });

  it('sends a rope climber chasing endurance to The Long Game', () => {
    const { top } = findProgram(
      input({ discipline: 'sport', sportGrade: '5.11a', boulderGrade: undefined, goal: 'endurance' }),
    );
    expect(top.program.id).toBe('the_long_game');
  });

  it('recommends The Siege, which the prototype could never reach', () => {
    const { top } = findProgram(
      input({ discipline: 'sport', sportGrade: '5.13a', boulderGrade: undefined, goal: 'project' }),
    );
    expect(top.program.id).toBe('the_siege');
  });

  it('blocks The Siege when the redpoint prerequisite is not met', () => {
    const ranked = recommend(
      input({ discipline: 'sport', sportGrade: '5.11a', boulderGrade: undefined, goal: 'project' }),
    );
    const siege = ranked.find((r) => r.program.id === 'the_siege')!;
    expect(siege.blockers.length).toBeGreaterThan(0);
    expect(findProgram(input({ discipline: 'sport', sportGrade: '5.11a', goal: 'project' })).top.program.id).not.toBe(
      'the_siege',
    );
  });

  it('never recommends a program the climber cannot equip', () => {
    const ranked = recommend(input({ boulderGrade: 'V6', goal: 'fingers', equipment: ['wall'] }));
    const ironGrip = ranked.find((r) => r.program.id === 'iron_grip')!;
    expect(ironGrip.blockers.join(' ')).toMatch(/hangboard|campus/);
    const { top } = findProgram(input({ boulderGrade: 'V6', goal: 'fingers', equipment: ['wall'] }));
    expect(top.blockers).toEqual([]);
  });

  it('refuses to send a healing pulley to a finger program', () => {
    const injured = recommend(input({ boulderGrade: 'V6', goal: 'fingers', injuries: ['A2 Pulley'] }));
    const ironGrip = injured.find((r) => r.program.id === 'iron_grip')!;
    expect(ironGrip.blockers.length).toBeGreaterThan(0);
    expect(ironGrip.blockers.join(' ')).toMatch(/healing/i);

    const { top } = findProgram(input({ boulderGrade: 'V6', goal: 'fingers', injuries: ['A2 Pulley'] }));
    expect(top.program.id).not.toBe('iron_grip');
    expect(top.program.equipment).not.toContain('hangboard');
    expect(top.program.equipment).not.toContain('campus');
  });

  it('cautions rather than blocks for an elbow on a hangboard program', () => {
    const injured = recommend(input({ boulderGrade: 'V6', goal: 'fingers', injuries: ['Elbow'] }));
    const ironGrip = injured.find((r) => r.program.id === 'iron_grip')!;
    expect(ironGrip.cautions.join(' ')).toMatch(/elbow/i);
    // Campus work is still off the table with a bad elbow.
    expect(ironGrip.blockers.join(' ')).toMatch(/campus/i);
  });

  it('warns rather than blocks when the week is too short', () => {
    const ranked = recommend(input({ boulderGrade: 'V6', goal: 'fingers', daysPerWeek: 2 }));
    const ironGrip = ranked.find((r) => r.program.id === 'iron_grip')!;
    expect(ironGrip.blockers).toEqual([]);
    expect(ironGrip.cautions.join(' ')).toMatch(/days a week/);
  });

  /**
   * What the days term says, and what it is allowed to claim (PLAN.md M38).
   *
   * `max` was ignored, so the branch that fires when a climber has *more*
   * days than a program asks for was the same branch that fires when they
   * have exactly the right number — and it said "Fits 7 days a week" about
   * a program that asks for four or five. The rest days a hangboard block
   * leaves are the point of it, not slack in the schedule.
   */
  describe('days a week', () => {
    const daysLine = (over: Partial<FinderInput>, id: string) => {
      const found = recommend(input(over)).find((r) => r.program.id === id)!;
      return [...found.reasons, ...found.cautions].filter((line) => /days/i.test(line));
    };

    it('says a program fits only when the week is inside its range', () => {
      // Iron Grip asks for 4-5.
      expect(daysLine({ goal: 'fingers', daysPerWeek: 4 }, 'iron_grip')).toEqual([
        'Fits 4 days a week',
      ]);
      expect(daysLine({ goal: 'fingers', daysPerWeek: 5 }, 'iron_grip')).toEqual([
        'Fits 5 days a week',
      ]);
    });

    it('does not claim to fit a week longer than it asks for', () => {
      const line = daysLine({ goal: 'fingers', daysPerWeek: 7 }, 'iron_grip');
      expect(line).toEqual(['Uses 4-5 of your 7 days']);
      expect(line.join(' ')).not.toContain('Fits 7');
    });

    it('still warns when the week is too short', () => {
      expect(daysLine({ goal: 'fingers', daysPerWeek: 3 }, 'iron_grip')).toEqual([
        'Asks for 4-5 days a week; you have 3',
      ]);
    });

    it('does not write a range for a program that wants one number', () => {
      // The Long Game asks for exactly four.
      expect(daysLine({ discipline: 'sport', sportGrade: '5.11a', goal: 'endurance', daysPerWeek: 6 }, 'the_long_game')).toEqual([
        'Uses 4 of your 6 days',
      ]);
    });

    it('scores a spare day the same as an exact fit', () => {
      // Having days left over is not a misfit; only the sentence was wrong.
      const exact = recommend(input({ goal: 'fingers', daysPerWeek: 5 })).find((r) => r.program.id === 'iron_grip')!;
      const spare = recommend(input({ goal: 'fingers', daysPerWeek: 7 })).find((r) => r.program.id === 'iron_grip')!;
      expect(spare.score).toBe(exact.score);
    });

    it('leaves the pick alone where the goal-matched program really fits', () => {
      // The audit claimed a day-count cliff handed a climber maintenance.
      // It does not: where the matched program is a genuine fit it wins at
      // every week length, and this is the check that says so.
      for (const daysPerWeek of [2, 3, 4, 5, 6, 7]) {
        const { top } = findProgram(
          input({ discipline: 'sport', sportGrade: '5.11a', boulderGrade: undefined, goal: 'endurance', daysPerWeek }),
        );
        expect(top.program.id, `${daysPerWeek} days`).toBe('the_long_game');
      }
    });
  });

  it('breaks a tie by warnings rather than by catalogue order', () => {
    // A returning V4 boulderer with three days who wants preparation ties
    // Ground Zero and Gravity Defied on 60. Ground Zero carries a warning
    // and sits *earlier* in `PROGRAMS`, so the old sort — which returned
    // nothing for a tie and inherited the array order — handed over the
    // one with the caution on it.
    const tied = recommend(
      input({ goal: 'prep', boulderGrade: 'V4', discipline: 'boulder', experience: 'returning', daysPerWeek: 3 }),
    ).filter((r) => r.blockers.length === 0);

    const best = tied[0]!;
    const runnerUp = tied.find((r) => r.score === best.score && r.program.id !== best.program.id)!;
    expect(runnerUp, 'the tie this test is about has gone').toBeDefined();
    expect(best.cautions.length).toBeLessThan(runnerUp.cautions.length);
    expect(best.program.id).toBe('gravity_defied');
  });

  it('gives the same answer to the same question', () => {
    const ask = () => recommend(input({ goal: 'prep', experience: 'returning', daysPerWeek: 3 })).map((r) => r.program.id);
    expect(ask()).toEqual(ask());
  });

  it('never recommends a logging mode as training', () => {
    for (const goal of ['prep', 'fingers', 'endurance', 'maintain'] as const) {
      const { top, alternatives } = findProgram(input({ goal }));
      for (const rec of [top, ...alternatives]) {
        expect(rec.program.kind).toBe('program');
      }
    }
  });

  it('always returns something, and says when the match is weak', () => {
    // A contradictory request: brand new, no gear, one day a week, elite goal.
    const result = findProgram(
      input({ experience: 'new', goal: 'project', daysPerWeek: 1, equipment: [], boulderGrade: 'V0' }),
    );
    expect(result.top).toBeDefined();
    expect(result.fallback).toBe(true);
  });

  it('explains every recommendation it makes', () => {
    const { top, alternatives } = findProgram(input({ boulderGrade: 'V6', goal: 'fingers' }));
    for (const rec of [top, ...alternatives]) {
      expect(rec.reasons.length, rec.program.id).toBeGreaterThan(0);
    }
  });

  it('offers two distinct alternatives', () => {
    const { top, alternatives } = findProgram(input({ boulderGrade: 'V4', goal: 'dynamic' }));
    expect(alternatives).toHaveLength(2);
    const ids = [top.program.id, ...alternatives.map((a) => a.program.id)];
    expect(new Set(ids).size).toBe(3);
  });
});
