import { describe, expect, it } from 'vitest';
import { deriveClimberState } from './derive';
import { deriveStats } from './stats';
import {
  BENCHMARKS,
  EMPTY_BASELINE,
  answeredCount,
  baselineEntries,
  benchmarksFor,
  finderInputFrom,
  readBaseline,
  type BaselineAnswers,
} from './onboarding';

const DATE = '2026-03-01';

function answers(patch: Partial<BaselineAnswers> = {}): BaselineAnswers {
  return { ...EMPTY_BASELINE, ...patch };
}

describe('the battery', () => {
  it('drops tests the climber has no way to run', () => {
    const ids = benchmarksFor(['wall']).map((b) => b.metricId);
    expect(ids).not.toContain('max_hang_20mm_7s');
    expect(ids).not.toContain('weighted_pullup_3rm');
    expect(ids).toContain('arc_duration');
    expect(ids).toContain('max_pullups');
  });

  it('keeps everything for a fully equipped climber', () => {
    expect(benchmarksFor(['wall', 'hangboard', 'campus', 'gym'])).toHaveLength(BENCHMARKS.length);
  });

  it('asks nothing that needs gear when there is none', () => {
    expect(benchmarksFor([]).every((b) => b.requires === undefined)).toBe(true);
  });
});

describe('turning answers into metric entries', () => {
  it('writes only what was answered', () => {
    const entries = baselineEntries(answers({ boulderGrade: 'V6', benchmarks: { max_pullups: '12' } }), DATE);
    expect(entries).toEqual([
      { metricId: 'max_boulder_grade', date: DATE, value: 6, display: 'V6' },
      { metricId: 'max_pullups', date: DATE, value: 12 },
    ]);
  });

  it('drops blanks rather than storing zeroes', () => {
    expect(baselineEntries(answers(), DATE)).toEqual([]);
    expect(baselineEntries(answers({ benchmarks: { max_pullups: '   ' } }), DATE)).toEqual([]);
  });

  // A baseline that invents a number is worse than one with a gap in it.
  it('drops an answer it cannot parse', () => {
    const entries = baselineEntries(answers({ boulderGrade: 'V-nope', benchmarks: { max_pullups: 'lots' } }), DATE);
    expect(entries).toEqual([]);
  });

  it('keeps a legitimate zero and a legitimate negative', () => {
    const entries = baselineEntries(answers({ benchmarks: { max_hang_20mm_7s: '0', toe_touch: '-2' } }), DATE);
    expect(entries.map((e) => [e.metricId, e.value])).toEqual([
      ['max_hang_20mm_7s', 0],
      ['toe_touch', -2],
    ]);
  });

  it('handles the pass/fail and grade forms', () => {
    const entries = baselineEntries(
      answers({ sportGrade: '5.11c', benchmarks: { wall_angel: 'pass' } }),
      DATE,
    );
    expect(entries).toContainEqual({ metricId: 'max_sport_grade', date: DATE, value: 12, display: '5.11c' });
    expect(entries).toContainEqual({ metricId: 'wall_angel', date: DATE, value: 1, display: 'Pass' });
  });

  it('counts only the questions this climber was asked', () => {
    const a = answers({ benchmarks: { max_hang_20mm_7s: '40', max_pullups: '12' } });
    expect(answeredCount(a, ['wall', 'hangboard'])).toBe(2);
    expect(answeredCount(a, ['wall'])).toBe(1);
  });
});

describe('what the baseline is allowed to move', () => {
  const measured = answers({
    boulderGrade: 'V7',
    benchmarks: { max_hang_20mm_7s: '60', max_pullups: '15', flexibility: '8', toe_touch: '0', wall_angel: 'pass' },
  });
  const stats = deriveStats({ state: deriveClimberState([]), metrics: baselineEntries(measured, DATE) });

  it('gives a strong climber real Strength and Mobility from day one', () => {
    expect(stats.STR.value).toBeGreaterThan(50);
    expect(stats.AGI.value).toBeGreaterThan(40);
  });

  // The honest half. Nothing here can be demonstrated by a questionnaire,
  // and handing it over spends the app's whole long arc before it starts.
  it('leaves the three built from training on the floor', () => {
    expect(stats.END.value).toBe(10);
    expect(stats.TEC.value).toBe(10);
    expect(stats.MEN.value).toBe(10);
  });

  it('credits a told grade the same as a logged send', () => {
    const told = deriveStats({ state: deriveClimberState([]), metrics: baselineEntries(answers({ boulderGrade: 'V7' }), DATE) });
    const hardest = told.STR.contributions.find((c) => c.label === 'Hardest boulder');
    expect(hardest?.points).toBeCloseTo(7 * 1.6, 5);
  });

  it('never double-counts: the better of the log and the claim wins', () => {
    const entries = baselineEntries(answers({ boulderGrade: 'V3' }), DATE);
    const state = deriveClimberState([
      {
        id: `${DATE}#0`, date: DATE, planned: false, completed: true, rewarded: true, mode: 'indoor',
        climbs: [{ id: 'c', grade: 'V8', scale: 'V', count: 1, result: 'send' }],
        createdAt: DATE, updatedAt: DATE,
      },
    ]);
    const hardest = deriveStats({ state, metrics: entries }).STR.contributions.find(
      (c) => c.label === 'Hardest boulder',
    );
    expect(hardest?.points).toBeCloseTo(8 * 1.6, 5);
  });
});

describe('handing the answers to the finder', () => {
  it('carries them across without asking again', () => {
    const input = finderInputFrom(
      answers({ discipline: 'boulder', goal: 'power', daysPerWeek: 4, boulderGrade: 'V5' }),
      ['wall', 'hangboard'],
      ['elbow'],
    );
    expect(input).toMatchObject({
      discipline: 'boulder', goal: 'power', daysPerWeek: 4,
      boulderGrade: 'V5', equipment: ['wall', 'hangboard'], injuries: ['elbow'],
    });
    expect(input.sportGrade).toBeUndefined();
  });

  it('flags a returning climber as coming off a break', () => {
    expect(finderInputFrom(answers({ experience: 'returning' }), [], []).comingOffBreak).toBe(true);
    expect(finderInputFrom(answers({ experience: 'advanced' }), [], []).comingOffBreak).toBe(false);
  });
});

describe('reading a stored baseline', () => {
  it('keeps a well-formed one intact', () => {
    const stored = {
      discipline: 'boulder',
      experience: 'advanced',
      goal: 'fingers',
      daysPerWeek: 4,
      boulderGrade: 'V7',
      sportGrade: '5.12a',
      benchmarks: { max_pullups: '12' },
    };
    expect(readBaseline(stored)).toEqual(stored);
  });

  it('survives the record that white-screened the finder', () => {
    // The actual reproduction from M13: no boulderGrade, no sportGrade, and
    // a null benchmarks. `finderInputFrom` called .trim() on undefined and
    // took the whole page down.
    const bad = {
      discipline: 'both',
      experience: 'intermediate',
      goal: 'fingers',
      daysPerWeek: 3,
      benchmarks: null,
    };
    const read = readBaseline(bad);
    expect(read).not.toBeNull();
    expect(() => finderInputFrom(read!, ['wall'], [])).not.toThrow();
    expect(read!.boulderGrade).toBe('');
    expect(read!.benchmarks).toEqual({});
  });

  it('replaces a value that is not one of the options', () => {
    const read = readBaseline({ discipline: 'freesolo', experience: 12, goal: 'vibes', daysPerWeek: 3 });
    expect(read?.discipline).toBe(EMPTY_BASELINE.discipline);
    expect(read?.experience).toBe(EMPTY_BASELINE.experience);
    expect(read?.goal).toBe(EMPTY_BASELINE.goal);
  });

  it('keeps days per week inside a week', () => {
    expect(readBaseline({ goal: 'fingers', daysPerWeek: 0 })?.daysPerWeek).toBe(3);
    expect(readBaseline({ goal: 'fingers', daysPerWeek: 99 })?.daysPerWeek).toBe(3);
    expect(readBaseline({ goal: 'fingers', daysPerWeek: '5' })?.daysPerWeek).toBe(5);
    expect(readBaseline({ goal: 'fingers', daysPerWeek: 4.4 })?.daysPerWeek).toBe(4);
  });

  it('says null rather than inventing a climber', () => {
    // A default-filled baseline would hand the finder a confident answer
    // built from nothing.
    expect(readBaseline(null)).toBeNull();
    expect(readBaseline(undefined)).toBeNull();
    expect(readBaseline('a string')).toBeNull();
    expect(readBaseline({})).toBeNull();
    expect(readBaseline({ somethingElse: 1 })).toBeNull();
  });
});
