import { describe, expect, it } from 'vitest';
import { findProgram, recommend, type Experience, type FinderInput, type Goal } from './finder';
import { PROGRAMS } from '@/content/programs';
import type { MetricEntry } from '@/db/metrics';

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
    // The old sort returned nothing for a tie, so equal scores inherited the
    // order of `PROGRAMS` — which handed over the one carrying more caution.
    // Hardcoding one tied fixture made this test move every time a score
    // changed, so sweep the question space instead: every tie anywhere in it
    // must be ordered by caution count, and at least one tie must actually
    // differ in caution or the rule is not being exercised.
    const goals: Goal[] = [
      'prep', 'fundamentals', 'technique', 'power', 'fingers',
      'endurance', 'dynamic', 'project', 'maintain',
    ];
    const experiences: Experience[] = ['new', 'returning', 'intermediate', 'advanced'];
    const grades = [undefined, 'V1', 'V4', 'V6', 'V9'];

    let tiesSeen = 0;
    let tiesThatDiffer = 0;

    for (const goal of goals) {
      for (const experience of experiences) {
        for (const boulderGrade of grades) {
          for (const daysPerWeek of [2, 4, 6]) {
            const ranked = recommend(input({ goal, experience, boulderGrade, daysPerWeek })).filter(
              (r) => r.blockers.length === 0,
            );
            for (let i = 1; i < ranked.length; i += 1) {
              const before = ranked[i - 1]!;
              const after = ranked[i]!;
              if (before.score !== after.score) continue;
              tiesSeen += 1;
              if (before.cautions.length !== after.cautions.length) tiesThatDiffer += 1;
              expect(
                before.cautions.length,
                `${before.program.id} (${before.cautions.length} cautions) ranked above ` +
                  `${after.program.id} (${after.cautions.length}) at an equal score of ${before.score}`,
              ).toBeLessThanOrEqual(after.cautions.length);
            }
          }
        }
      }
    }

    expect(tiesSeen, 'the sweep found no ties at all, so it tests nothing').toBeGreaterThan(10);
    expect(tiesThatDiffer, 'every tie carried identical caution, so the rule is untested').toBeGreaterThan(0);
  });

  /**
   * Entry standards as data (PLAN.md M35).
   *
   * Five programs printed an entry standards table in their guide that
   * nothing checked. Wiring them up found the finder had never read the
   * metric registry at all: it decided `metricId === 'redpoint_grade' ? 'YDS'
   * : 'V'` and then compared the *climber's grade ordinal* against the
   * threshold — so `dead_hang >= 60` compared V8 (ordinal 8) against 60 and
   * would have blocked every climber alive.
   */
  describe('entry standards', () => {
    const logged = (over: Record<string, number>): FinderInput['metrics'] =>
      Object.entries(over).map(([metricId, value]) => ({
        metricId: metricId as MetricEntry['metricId'],
        date: '2026-01-01',
        value,
      }));

    const ironGrip = (over: Partial<FinderInput>) =>
      recommend(input({ boulderGrade: 'V6', goal: 'fingers', ...over })).find(
        (r) => r.program.id === 'iron_grip',
      )!;

    it('compares a benchmark against the benchmark, not against a grade', () => {
      // Iron Grip asks for a 60-second dead hang. A V6 climber's grade
      // ordinal is 6; under the old code that 6 was what got compared.
      const strong = ironGrip({ metrics: logged({ dead_hang: 75, max_pushups: 20 }) });
      expect(strong.blockers).toEqual([]);
      expect(strong.reasons.join(' ')).toMatch(/entry requirements/i);
    });

    it('blocks a climber who has measured the standard and is under it', () => {
      const weak = ironGrip({ metrics: logged({ dead_hang: 20, max_pushups: 20 }) });
      expect(weak.blockers.join(' ')).toMatch(/60-second dead hang/);
    });

    it('says nothing at all about a standard nobody has measured', () => {
      // Absent is not failing. A climber who has logged no benchmarks must
      // not be locked out of five of the nine programs. Base Camp's three
      // standards are all benchmarks, so with nothing logged there is
      // nothing to say — unlike Iron Grip, whose V5 floor the climber
      // answers in question three and which therefore always counts.
      const unmeasured = recommend(input({ goal: 'fundamentals', boulderGrade: 'V2' })).find(
        (r) => r.program.id === 'base_camp',
      )!;
      expect(unmeasured.blockers).toEqual([]);
      expect(unmeasured.reasons.join(' ')).not.toMatch(/entry requirement/i);
    });

    it('counts a grade the climber answered as measured', () => {
      // Iron Grip's V5 floor is `max_boulder_grade`, which question three
      // already asks. Nothing logged is still a partial measurement there.
      const unmeasured = ironGrip({});
      expect(unmeasured.blockers).toEqual([]);
      expect(unmeasured.reasons.join(' ')).toMatch(/entry requirements you have measured/i);
      const belowFloor = recommend(input({ boulderGrade: 'V2', goal: 'fingers' })).find(
        (r) => r.program.id === 'iron_grip',
      )!;
      expect(belowFloor.blockers.join(' ')).toMatch(/V5/);
    });

    it('scores what is measured and stays quiet about the rest', () => {
      const partial = ironGrip({ metrics: logged({ dead_hang: 75 }) });
      expect(partial.blockers).toEqual([]);
      expect(partial.reasons.join(' ')).toMatch(/entry requirements you have measured/i);
    });

    it('scores meeting every standard above meeting one of them', () => {
      // A flat bonus made one logged dead hang worth as much as a full
      // assessment, so a climber who had measured everything and a climber
      // who had measured a third of it ranked identically.
      const all = recommend(
        input({ goal: 'fingers', boulderGrade: 'V6', metrics: logged({ dead_hang: 75, max_pushups: 30 }) }),
      ).find((r) => r.program.id === 'iron_grip')!;
      const one = recommend(
        input({ goal: 'fingers', boulderGrade: 'V6', metrics: logged({ dead_hang: 75 }) }),
      ).find((r) => r.program.id === 'iron_grip')!;
      expect(all.score).toBeGreaterThan(one.score);
    });

    it('warns for a standard the program calls an assumption', () => {
      // Blocking on every unmet standard turned a V6 climber with an
      // 18-second dead hang into "nothing was a confident match" — the app
      // refusing to show a program rather than saying be careful. A floor
      // the program itself calls a safety limit still blocks; one it calls
      // an assumption does not.
      const short = recommend(
        input({ goal: 'fundamentals', boulderGrade: 'V2', metrics: logged({ dead_hang: 18, max_pushups: 2, core_plank: 10 }) }),
      ).find((r) => r.program.id === 'base_camp')!;
      expect(short.blockers).toEqual([]);
      expect(short.cautions.join(' ')).toMatch(/30-second dead hang/);
    });

    it('still blocks a standard the program calls a safety floor', () => {
      const short = ironGrip({ metrics: logged({ dead_hang: 18 }) });
      expect(short.cautions.join(' ')).not.toMatch(/tendons/);
      expect(short.blockers.join(' ')).toMatch(/tendons/);
    });

    it('says the note once, not once per standard', () => {
      // Base Camp names three standards. Pushing the note per failed metric
      // printed the same sentence three times.
      const baseCamp = recommend(
        input({
          goal: 'fundamentals',
          boulderGrade: 'V2',
          metrics: logged({ dead_hang: 5, max_pushups: 1, core_plank: 5 }),
        }),
      ).find((r) => r.program.id === 'base_camp')!;
      expect(baseCamp.cautions.filter((c) => /dead hang/.test(c))).toHaveLength(1);
    });

    it('leaves every program reachable by a climber who has logged nothing', () => {
      // The whole risk of this milestone: a standard nobody can meet on
      // day one silently removing programs from the catalogue.
      const reachable = new Set<string>();
      for (const goal of ['prep', 'fundamentals', 'technique', 'power', 'fingers',
        'endurance', 'dynamic', 'project', 'maintain'] as Goal[]) {
        for (const grade of ['V1', 'V4', 'V6', 'V9']) {
          for (const rec of recommend(input({ goal, boulderGrade: grade, sportGrade: '5.13a' }))) {
            if (rec.blockers.length === 0) reachable.add(rec.program.id);
          }
        }
      }
      const trainable = PROGRAMS.filter((p) => p.kind !== 'mode');
      expect(trainable.length).toBeGreaterThan(8);
      for (const program of trainable) {
        expect(reachable.has(program.id), `${program.id} is unreachable with nothing logged`).toBe(true);
      }
    });
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
