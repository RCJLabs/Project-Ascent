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
    // A V4 boulderer with two days who wants fundamentals ties Base Camp
    // against Gravity Defied and Lockdown. Base Camp carries an extra
    // warning and sits *earlier* in `PROGRAMS`, so the old sort — which
    // returned nothing for a tie and inherited the array order — handed over
    // the one with more caution on it.
    const tied = recommend(
      input({ goal: 'fundamentals', boulderGrade: 'V4', discipline: 'boulder', daysPerWeek: 2 }),
    ).filter((r) => r.blockers.length === 0);

    const best = tied[0]!;
    const alsoTied = tied.filter((r) => r.score === best.score);
    expect(alsoTied.length, 'the tie this test is about has gone').toBeGreaterThan(1);
    const worse = alsoTied.find((r) => r.cautions.length > best.cautions.length);
    expect(worse, 'nothing in the tie carries more warnings').toBeDefined();
    expect(best.program.id).not.toBe(worse!.program.id);
  });

  it('gives the same answer to the same question', () => {
    const ask = () => recommend(input({ goal: 'prep', experience: 'returning', daysPerWeek: 3 })).map((r) => r.program.id);
    expect(ask()).toEqual(ask());
  });

  /**
   * Required kit blocks; helpful kit never does (PLAN.md M36).
   *
   * Seven of nine programs required a weights gym for between one and eight
   * prescriptions out of thirty to a hundred and thirty — several of which
   * wrote their own bodyweight alternative — so a climbing wall and a
   * hangboard together unlocked nothing at all.
   */
  describe('required and helpful equipment', () => {
    const viableFor = (equipment: FinderInput['equipment']) => {
      const found = new Set<string>();
      for (const goal of ['prep', 'fundamentals', 'technique', 'power', 'fingers', 'dynamic', 'endurance', 'project', 'maintain'] as const) {
        for (const r of recommend(input({ goal, equipment, daysPerWeek: 4 }))) {
          if (r.blockers.length === 0) found.add(r.program.id);
        }
      }
      return [...found].sort();
    };

    it('gives a climber with only a wall something to run', () => {
      const viable = viableFor(['wall']);
      expect(viable.length, 'a wall alone unlocks nothing').toBeGreaterThan(2);
      expect(viable).toContain('the_cruiser');
      expect(viable).toContain('the_long_game');
    });

    it('gives a wall and a hangboard more than a wall alone', () => {
      expect(viableFor(['wall', 'hangboard']).length).toBeGreaterThan(viableFor(['wall']).length);
      expect(viableFor(['wall', 'hangboard'])).toContain('lockdown');
    });

    it('still blocks on kit a program genuinely cannot run without', () => {
      // Iron Grip's third phase is campus work.
      const ironGrip = recommend(input({ goal: 'fingers', equipment: ['wall', 'hangboard'] })).find(
        (r) => r.program.id === 'iron_grip',
      )!;
      expect(ironGrip.blockers.join(' ')).toContain('campus');
      // Base Camp's strength block is genuinely barbell-shaped.
      const baseCamp = recommend(input({ goal: 'fundamentals', equipment: ['wall'] })).find(
        (r) => r.program.id === 'base_camp',
      )!;
      expect(baseCamp.blockers.join(' ')).toContain('gym');
    });

    it('says what the missing helpful kit would add, and does not block on it', () => {
      const without = recommend(input({ goal: 'maintain', equipment: ['wall'] })).find(
        (r) => r.program.id === 'the_cruiser',
      )!;
      expect(without.blockers).toEqual([]);
      expect(without.cautions.join(' ')).toMatch(/Runs without/);
      expect(without.cautions.join(' ')).toMatch(/improvising/);
    });

    it('does not score the absence of helpful kit', () => {
      // Scoring it would rebuild the same wall one step lower down.
      const bare = recommend(input({ goal: 'maintain', equipment: ['wall'] })).find((r) => r.program.id === 'the_cruiser')!;
      const kitted = recommend(input({ goal: 'maintain', equipment: ['wall', 'gym', 'weight', 'hangboard'] })).find((r) => r.program.id === 'the_cruiser')!;
      expect(bare.score).toBe(kitted.score);
      expect(bare.cautions.length).toBeGreaterThan(kitted.cautions.length);
    });

    it('names added weight in words a climber would use', () => {
      const found = recommend(input({ goal: 'power', equipment: ['wall', 'hangboard'] })).find(
        (r) => r.program.id === 'peak_performance',
      )!;
      expect(found.cautions.join(' ')).toContain('a way to add weight');
      expect(found.cautions.join(' ')).not.toMatch(/\bweight\b —/);
    });
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
    // One day a week fits no structured block in the catalogue.
    const result = findProgram(
      input({ experience: 'intermediate', goal: 'prep', daysPerWeek: 1, equipment: [], boulderGrade: 'V4' }),
    );
    expect(result.top).toBeDefined();
    expect(result.fallback).toBe(true);
  });

  it('gives a beginner with no equipment a real program, not a shrug', () => {
    // Ground Zero is floor and band work: two dumbbell exercises in
    // fifty-two prescriptions. It used to declare `gym` and be ruled out for
    // exactly the climber it was written for (PLAN.md M36).
    const result = findProgram(
      input({ experience: 'new', goal: 'prep', daysPerWeek: 3, equipment: [], boulderGrade: 'V0' }),
    );
    expect(result.fallback).toBe(false);
    expect(result.top.program.id).toBe('ground_zero');
    expect(result.top.blockers).toEqual([]);
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
