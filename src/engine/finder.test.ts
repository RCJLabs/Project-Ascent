import { describe, expect, it } from 'vitest';
import {
  catalogueMinDays,
  minDaysIn,
  findProgram,
  fitsTheEvening,
  recommend,
  type Experience,
  type FinderInput,
  type Goal,
} from './finder';
import { PROGRAMS } from '@/content/programs';
import { KIT_NAMES } from './kit';
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
    // Campus work is still off the table with a bad elbow — but the board is
    // optional now, so that is a warning to run the other track rather than a
    // reason the whole program is unavailable (PLAN.md M39).
    expect(ironGrip.blockers).toEqual([]);
    expect(ironGrip.cautions.join(' ')).toMatch(/campus work spikes elbow load/i);
    expect(ironGrip.cautions.join(' ')).toMatch(/no-board track/i);
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

  /**
   * The reasons are read by a person, so they use that person's notation
   * (PLAN.md M47).
   *
   * The range used to be an authored string on the program, and when that
   * became derivable these three sentences read "undefined matches where you
   * climb" — with the whole suite still green, because nothing had ever
   * asserted what they contain.
   */
  describe('the grade range it names', () => {
    const line = (over: Partial<FinderInput>) => {
      const found = recommend(input({ boulderGrade: 'V6', goal: 'fingers', ...over })).find(
        (r) => r.program.id === 'iron_grip',
      )!;
      return [...found.reasons, ...found.cautions].find((l) => /matches where|Written for/.test(l));
    };

    it('says the range, not a hole where one used to be', () => {
      expect(line({})).toBe('V5-V8 matches where you climb');
    });

    it('says it the way this climber reads grades', () => {
      expect(line({ display: { boulder: 'Font', route: 'French' } })).toBe('6C-7B matches where you climb');
    });

    it('keeps an editorial range as it was written', () => {
      // "All Levels" is not V0-V17 in any notation.
      const cruiser = recommend(
        input({ goal: 'maintain', boulderGrade: 'V4', display: { boulder: 'Font', route: 'French' } }),
      ).find((r) => r.program.id === 'the_cruiser')!;
      expect(cruiser.reasons.join(' ')).toContain('All Levels');
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
      // Lockdown's density hangs and weighted lock-offs are the program.
      const lockdown = recommend(input({ goal: 'power', equipment: ['wall'] })).find(
        (r) => r.program.id === 'lockdown',
      )!;
      expect(lockdown.blockers.join(' ')).toContain('hangboard');
      // Base Camp's strength block is genuinely barbell-shaped.
      const baseCamp = recommend(input({ goal: 'fundamentals', equipment: ['wall'] })).find(
        (r) => r.program.id === 'base_camp',
      )!;
      // `weights and bands` rather than `gym` since M236: the blocker used to
      // print the raw enum for four of the six kits, so it read *"Needs gym
      // you do not have access to"* while the chip that turns it on says
      // **Weights & bands**. Both read `KIT_NAMES` now, which is also why
      // this asserts the sentence a climber sees rather than the enum.
      expect(baseCamp.blockers.join(' ')).toContain(KIT_NAMES.gym.word);
      expect(baseCamp.blockers.join(' ')).toBe('Needs weights and bands you do not have access to');
    });

    /**
     * The finger-strength hole (PLAN.md M39, carried from M9).
     *
     * A campus board gated Iron Grip on three exercises out of thirty-eight,
     * all in one phase, so a climber with a hangboard and no board was told
     * their finger-strength program was out of reach and handed Perpetual
     * Maintenance at every grade from V6 up.
     */
    describe('the finger-strength hole', () => {
      const fingers = (kit: FinderInput['equipment'], boulderGrade: string) =>
        findProgram(input({ goal: 'fingers', equipment: kit, boulderGrade }));

      it('runs the finger program on a hangboard alone', () => {
        for (const grade of ['V5', 'V6', 'V7', 'V8']) {
          expect(fingers(['wall', 'hangboard'], grade).top.program.id, grade).toBe('iron_grip');
        }
      });

      it('never answers a finger goal with maintenance', () => {
        // The specific shape of the bug: The Cruiser, at V6, for a climber
        // who asked for stronger fingers.
        for (const kit of [['wall', 'hangboard'], ['wall', 'hangboard', 'campus']] as const) {
          for (const grade of ['V5', 'V6', 'V7', 'V8', 'V10']) {
            const { top } = fingers([...kit], grade);
            expect(top.program.id, `${kit.join('+')} at ${grade}`).not.toBe('the_cruiser');
          }
        }
      });

      it('names the hole it cannot fill instead of quietly filling it badly', () => {
        // Without a hangboard there is no honest answer, and saying which
        // single piece of kit changes that beats handing over maintenance
        // with no explanation.
        const { gap, top } = fingers(['wall'], 'V8');
        expect(gap, 'no hangboard is the one gap the catalogue really has').toMatch(/hangboard/i);
        expect(top.program, 'a gap is not a reason to stop recommending').toBeDefined();
      });

      it('says nothing about a gap that is not there', () => {
        expect(fingers(['wall', 'hangboard'], 'V6').gap).toBeUndefined();
        expect(findProgram(input({ goal: 'endurance', equipment: ['wall'] })).gap).toBeUndefined();
      });
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

/**
 * How long the climber has (PLAN.md M57).
 *
 * The finder knew days a week and never asked how many weeks, so a block
 * written to fit a trip could not be recommended for the reason it exists.
 */
describe('weeks available', () => {
  it('changes nothing when there is no deadline', () => {
    const open = recommend(input({ goal: 'fingers' }));
    for (const rec of open) {
      expect(rec.reasons.join(' '), rec.program.id).not.toMatch(/weeks/i);
      expect(rec.cautions.join(' '), rec.program.id).not.toMatch(/Written as/);
    }
  });

  it('says so when a program is written longer than the time there is', () => {
    const rushed = recommend(input({ goal: 'fingers', weeksAvailable: 6 }));
    // Trip Prep is four weeks and fits in six, which is the whole reason it
    // exists (PLAN.md M95) — it has nothing to be cautioned about.
    for (const rec of rushed.filter((r) => r.program.weeks > 6)) {
      expect(rec.cautions.join(' '), rec.program.id).toMatch(/Written as 12 weeks — you would run it over 6/);
    }
  });

  // Twelve weeks is not out of reach for a climber with six — it can be run
  // over six — so it is a caution, never a blocker.
  it('never blocks a program for being longer than the time there is', () => {
    // Entry standards still block; a length never does.
    for (const rec of recommend(input({ weeksAvailable: 4 }))) {
      expect(rec.blockers.join(' '), rec.program.id).not.toMatch(/week/i);
    }
  });

  it('counts a program that fits as a reason to pick it', () => {
    const roomy = recommend(input({ goal: 'fingers', weeksAvailable: 16 }));
    for (const rec of roomy.filter((r) => r.program.weeks === 12)) {
      expect(rec.reasons.join(' '), rec.program.id).toMatch(/Runs in 12 of your 16 weeks/);
    }
    // And the four-week one says the same thing about its own length.
    for (const rec of roomy.filter((r) => r.program.weeks === 4)) {
      expect(rec.reasons.join(' '), rec.program.id).toMatch(/Runs in 4 of your 16 weeks/);
    }
    expect(recommend(input({ weeksAvailable: 12 }))[0]!.reasons.join(' ')).toMatch(
      /Runs exactly your 12 weeks/,
    );
  });

  // Measured against the same program with no deadline at all, which is the
  // only comparison that says whether the deadline helped or hurt.
  it('scores a program up for fitting and down for being rushed', () => {
    const scoreOf = (over: Partial<FinderInput>, id: string) =>
      recommend(input({ goal: 'fingers', ...over })).find((r) => r.program.id === id)!.score;
    const id = recommend(input({ goal: 'fingers' }))[0]!.program.id;
    const open = scoreOf({}, id);

    expect(scoreOf({ weeksAvailable: 12 }, id)).toBeGreaterThan(open);
    expect(scoreOf({ weeksAvailable: 6 }, id)).toBeLessThan(open);
    expect(scoreOf({ weeksAvailable: 3 }, id)).toBeLessThan(scoreOf({ weeksAvailable: 6 }, id));
  });

  // Four weeks is the floor an adaptation can reach. Below it the honest
  // answer is that the catalogue has nothing written for that, which is
  // exactly the hole M58 fills.
  it('says a block cannot be run at all in too few weeks', () => {
    for (const rec of recommend(input({ weeksAvailable: 3 }))) {
      expect(rec.cautions.join(' '), rec.program.id).toMatch(/3 is too few to run it over/);
    }
  });
});

/**
 * How long an evening is (PLAN.md M138).
 *
 * A note and never a filter. M131 set the rule when it deferred this:
 * telling someone that two of a program's sessions run past their hour is
 * coaching, hiding the program is not.
 */
describe('time for a session', () => {
  const of = (id: string, over: Partial<FinderInput>) =>
    recommend(input(over)).find((r) => r.program.id === id)!;

  it('says nothing at all when no limit is given', () => {
    const said = recommend(input()).flatMap((r) => [...r.reasons, ...r.cautions]);
    expect(said.filter((s) => /\bmin\b/.test(s))).toEqual([]);
  });

  it('names the sessions that run past the limit, and the longest by name', () => {
    // The Cruiser's performance day is 90-120 min against an hour; its
    // other four fit.
    const cruiser = of('the_cruiser', { minutesPerSession: 60 });
    expect(cruiser.cautions.join(' ')).toMatch(/1 of 5 sessions runs past 60 min — Climbing: Performance is 90-120 min/);
    expect(cruiser.blockers).toEqual([]);
  });

  it('counts them, and says two run rather than two runs', () => {
    const two = of('two_day_week', { minutesPerSession: 45 });
    expect(two.cautions.join(' ')).toMatch(/2 of 3 sessions run past 45 min — Climb & Apply is 90-120 min/);
  });

  it('says so when every session fits', () => {
    expect(of('iron_grip', { minutesPerSession: 60 }).reasons.join(' ')).toMatch(/Every session fits your 60 min/);
    // And stops saying it the moment one does not: Peak Performance's
    // projecting day is two and a half hours.
    expect(of('peak_performance', { minutesPerSession: 90 }).cautions.join(' ')).toMatch(
      /2 of 4 sessions run past 90 min — Projecting & Mental is 150 min/,
    );
  });

  it('moves the score, which is the whole of what it does', () => {
    // The sentences are the visible half; a rule that says something and
    // ranks nothing is a rule that does not do its job.
    const score = (id: string, over: Partial<FinderInput>) =>
      recommend(input(over)).find((r) => r.program.id === id)!.score;
    expect(score('iron_grip', { minutesPerSession: 60 })).toBeGreaterThan(score('iron_grip', {}));
    expect(score('the_cruiser', { minutesPerSession: 60 })).toBeLessThan(score('the_cruiser', {}));
  });

  it('never hides a program for running long', () => {
    const tight = recommend(input({ minutesPerSession: 45 }));
    const open = recommend(input());
    expect(tight.map((r) => r.program.id).sort()).toEqual(open.map((r) => r.program.id).sort());
  });

  it('moves a program without overruling the goal', () => {
    // Ten either way against the fifty a stated goal is worth: a climber
    // who asked for fingers and has forty-five minutes still gets fingers.
    const { top } = findProgram(input({ boulderGrade: 'V6', goal: 'fingers', minutesPerSession: 45 }));
    expect(top.program.id).toBe('iron_grip');
  });

  it('has a budget every shipped program can be judged against', () => {
    // The gate M131 set before deferring this: a number absent for half the
    // catalogue would have hidden the projecting programs from anyone who
    // said ninety minutes. Every program the finder ranks now answers, so
    // every one of them either fits or says what does not.
    for (const budget of [45, 60, 90]) {
      for (const r of recommend(input({ minutesPerSession: budget }))) {
        const said = [...r.reasons, ...r.cautions].filter((s) => /\bmin\b/.test(s));
        expect(said.length, `${r.program.id} at ${budget}`).toBe(1);
      }
    }
  });
});

/**
 * The fit rule on its own, where its branches are reachable (PLAN.md M138).
 *
 * Every shipped program answers for every session, so `recommend` can never
 * put a silent one through — which makes the rule that matters most here
 * untestable through the catalogue.
 */
describe('whether a program fits the evening', () => {
  const est = (low: number, high = low) => ({ low, high, read: 1, lines: 1 });
  const sessions = (...mins: [string, number][]) => mins.map(([name, low]) => ({ type: { name }, estimate: est(low) }));

  it('says nothing, and scores nothing, when a session cannot be read', () => {
    const said = fitsTheEvening({ known: sessions(['Fingers', 30]), silent: [{}] }, 60);
    expect(said).toEqual({ score: 0 });
  });

  it('says nothing about a program with no sessions at all', () => {
    expect(fitsTheEvening({ known: [], silent: [] }, 60)).toEqual({ score: 0 });
  });

  it('pays ten for a fit and charges ten for a session that runs long', () => {
    // Half what a short week deducts: a long session can be cut short, and
    // a day that does not exist cannot be invented.
    expect(fitsTheEvening({ known: sessions(['Fingers', 30]), silent: [] }, 60).score).toBe(10);
    expect(fitsTheEvening({ known: sessions(['Project', 90]), silent: [] }, 60).score).toBe(-10);
  });

  it('names the longest of the ones that run over', () => {
    const said = fitsTheEvening(
      { known: sessions(['Fingers', 30], ['Endurance', 75], ['Project', 150]), silent: [] },
      60,
    );
    expect(said.caution).toBe('2 of 3 sessions run past 60 min — Project is 150 min');
  });

  it('counts every session, not only the ones it could read', () => {
    const said = fitsTheEvening({ known: sessions(['Project', 90]), silent: [{}, {}] }, 60);
    // Silence never makes a fit, but it is still part of the count: "1 of 1
    // runs past your hour" would be a lie about a three-session program.
    expect(said.caution).toBe('1 of 3 sessions runs past 60 min — Project is 90 min');
  });

  it('lets a session exactly at the limit fit', () => {
    expect(fitsTheEvening({ known: sessions(['Endurance', 60]), silent: [] }, 60).reason).toBeTruthy();
    expect(fitsTheEvening({ known: sessions(['Endurance', 61]), silent: [] }, 60).caution).toBeTruthy();
  });

  it('reads the bottom of a range, because that is the shortest it can be', () => {
    expect(fitsTheEvening({ known: [{ type: { name: 'X' }, estimate: est(45, 90) }], silent: [] }, 60).reason).toBeTruthy();
  });
});

/**
 * The two the map did not name, and the climber it could not answer
 * (PLAN.md M150).
 */
describe('the programs a constraint is the whole point of', () => {
  it('puts Two Days a Week first for a climber with two days', () => {
    const { top } = findProgram(input({ daysPerWeek: 2, goal: 'maintain' }));
    expect(top.program.id).toBe('two_day_week');
  });

  it('puts Trip Prep first for a climber with four weeks', () => {
    const { top } = findProgram(input({ weeksAvailable: 4, goal: 'project', boulderGrade: 'V5' }));
    expect(top.program.id).toBe('trip_prep');
  });

  /**
   * With weeks enough for anything, the goal is what decides — and Trip
   * Prep scoring nothing for the goal it is actually written around is the
   * defect this milestone started from.
   */
  it('lets Trip Prep compete on the goal it is written around', () => {
    const ranked = recommend(input({ goal: 'project', boulderGrade: 'V5', weeksAvailable: 24 }));
    const trip = ranked.find((r) => r.program.id === 'trip_prep')!;
    expect(trip.reasons.join(' ')).toMatch(/Built for exactly this goal/);
  });

  /**
   * And claims nothing else. A generous goal list is not a harmless one:
   * a climber who wants to maintain what they have should meet the two
   * programs written for that, not a four-week peaking block.
   */
  it('does not let Trip Prep answer a maintenance question', () => {
    const ranked = recommend(input({ goal: 'maintain' }));
    const trip = ranked.find((r) => r.program.id === 'trip_prep')!;
    expect(trip.reasons.join(' ')).not.toMatch(/goal/i);
    expect(ranked[0]!.program.id).not.toBe('trip_prep');
  });

  /**
   * The regression the first draft caused and the measurement caught.
   * Giving Two Days a Week a second goal put it *above* Trip Prep for a
   * climber with four weeks before a trip, because a secondary goal match
   * is worth 30 and running exactly the right number of weeks is worth 10.
   */
  it('does not let a second goal outrank the weeks a trip actually has', () => {
    const { top } = findProgram(input({ weeksAvailable: 4, goal: 'fundamentals', boulderGrade: 'V5' }));
    expect(top.program.id).toBe('trip_prep');
  });

  /**
   * The guard that would have caught this: a program added without a goal
   * silently scores nothing of the 50 a primary match is worth.
   */
  it('has a goal entry for every program it can recommend', () => {
    const scored = PROGRAMS.filter((p) => p.kind !== 'mode');
    const without = scored.filter((p) => recommend(input()).every((r) => r.program.id !== p.id));
    // Everything scored is reachable, and every scored program is in the
    // ranking the finder built — which is only true because the map covers
    // them. A missing key is silent: it costs points, not a crash.
    expect(without).toEqual([]);
    for (const program of scored) {
      const ranked = recommend(input({ goal: 'maintain' })).find((r) => r.program.id === program.id);
      expect(ranked, program.id).toBeTruthy();
    }
  });
});

describe('the climber the catalogue has nothing for', () => {
  /**
   * The rule, against catalogues that are not this one — because a test
   * that only compares against today's twelve programs passes a constant
   * that happens to match today's answer.
   */
  const asks = (kind: 'program' | 'mode', min: number) =>
    ({ kind, constraints: [{ kind: 'sessions-per-week', min, max: min + 1, note: '' }] }) as unknown as (typeof PROGRAMS)[number];

  it('takes the smallest minimum any written program asks for', () => {
    expect(minDaysIn([asks('program', 4), asks('program', 3), asks('program', 5)])).toBe(3);
  });

  it('does not let a logging mode set the floor', () => {
    expect(minDaysIn([asks('mode', 1), asks('program', 3)])).toBe(3);
  });

  it('answers zero for a catalogue with nothing to ask', () => {
    expect(minDaysIn([])).toBe(0);
    expect(minDaysIn([asks('mode', 1)])).toBe(0);
  });

  /**
   * And the adapter reads the catalogue rather than restating its answer.
   *
   * `catalogueMinDays()` is one line, and a constant that happens to equal
   * today's answer passes every comparison against today's catalogue — the
   * battery said so. `PROGRAMS` is the array `loadPrograms` splices into,
   * so the honest check is to put a program in it and ask again.
   */
  it('reads the real catalogue through the same rule', () => {
    expect(catalogueMinDays()).toBe(minDaysIn(PROGRAMS));
    expect(catalogueMinDays()).toBe(2);

    PROGRAMS.push(asks('program', 1));
    try {
      expect(catalogueMinDays()).toBe(1);
    } finally {
      PROGRAMS.pop();
    }
    expect(catalogueMinDays()).toBe(2);
  });

  it('names the gap rather than pointing at a program anyway', () => {
    const result = findProgram(input({ daysPerWeek: 1 }));
    expect(result.top.program.id).toBe('general_training');
    expect(result.fallback).toBe(true);
    expect(result.gap).toMatch(/at least 2 days a week, and you have 1/);
    expect(result.gap).toMatch(/log what you climb/i);
  });

  /**
   * Before this, every program fired `-20` and *"Asks for 2-3 days a week;
   * you have 1"*, and the top pick was whichever structured block disliked
   * them least — a twelve-week power block, scoring 30.
   */
  it('does not hand a twelve-week block to someone with one day', () => {
    const { top } = findProgram(input({ daysPerWeek: 1, goal: 'power' }));
    expect(top.program.weeks).toBeLessThanOrEqual(52);
    expect(top.program.kind).toBe('mode');
  });

  it('still recommends a real program at the floor itself', () => {
    const result = findProgram(input({ daysPerWeek: catalogueMinDays(), goal: 'maintain' }));
    expect(result.top.program.kind).toBe('program');
    expect(result.gap).toBeUndefined();
  });
});
