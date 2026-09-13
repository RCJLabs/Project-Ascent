import { describe, expect, it } from 'vitest';
import { getMetric } from '@/content/metrics';
import { IRON_GRIP, PEAK_PERFORMANCE, THE_CRUISER, THE_LONG_GAME } from '@/content/programs/catalogue';
import type { MetricId, Program } from '@/content/types';
import type { BlockAdherence } from './adherence';
import type { NextStep } from './blockEnd';
import type { AssessmentResult, BlockReport, Movement } from './blockReport';
import { chooseNext } from './nextBlock';

/**
 * What comes next, chosen rather than recited (PLAN.md M134).
 *
 * The report was computed in the same function that returned the successors
 * and ignored by it. These hold the two properties that matter: the order
 * follows what the block left where it was, and a block with nothing to say
 * about its successors leaves them exactly as the author wrote them.
 */

/** Iron Grip's four, in the order it declares them. */
const CANDIDATES: NextStep[] = [
  { program: PEAK_PERFORMANCE, reason: 'You have the finger strength.' },
  { program: THE_LONG_GAME, reason: 'Apply your new crimp strength.' },
  { program: THE_CRUISER, reason: 'Maintain what you built.' },
];

const result = (id: MetricId, moved: Movement | null, gap: AssessmentResult['gap'] = null) =>
  ({
    metric: getMetric(id)!,
    points: [],
    baseline: null,
    latest: null,
    moved,
    percent: null,
    steps: null,
    gap,
  }) as AssessmentResult;

const report = (results: AssessmentResult[]): BlockReport =>
  ({
    program: IRON_GRIP as Program,
    from: '2026-01-01',
    to: '2026-03-26',
    through: '2026-03-26',
    finished: true,
    tests: [],
    results,
    comparable: [],
    better: 0,
    worse: 0,
    flat: 0,
    untested: 0,
  }) as BlockReport;

const names = (input: Parameters<typeof chooseNext>[0]) =>
  chooseNext(input).choices.map((c) => c.program.id);

describe('a block with nothing to say', () => {
  it('leaves the author’s order alone when there is no report', () => {
    expect(names({ candidates: CANDIDATES, report: null })).toEqual([
      'peak_performance',
      'the_long_game',
      'the_cruiser',
    ]);
  });

  it('leaves it alone when nothing was tested', () => {
    const untested = report([
      result('dead_hang', null, 'never-tested'),
      result('max_pullups', null, 'once-only'),
    ]);
    expect(names({ candidates: CANDIDATES, report: untested })).toEqual([
      'peak_performance',
      'the_long_game',
      'the_cruiser',
    ]);
  });

  it('says nothing over the list', () => {
    expect(chooseNext({ candidates: CANDIDATES, report: null }).note).toBeNull();
  });

  it('says nothing about any of them', () => {
    for (const choice of chooseNext({ candidates: CANDIDATES, report: null }).choices) {
      expect(choice.because).toBeNull();
    }
  });

  it('says why the order is the author’s, when the block had benchmarks', () => {
    // The case that makes this milestone quiet for most climbers: test
    // weeks are marked and linked, and a second reading is what is missing.
    const untested = report([result('dead_hang', null, 'never-tested')]);
    expect(chooseNext({ candidates: CANDIDATES, report: untested }).note).toMatch(
      /Nothing was measured twice this block/,
    );
  });

  it('names the program whose order it is', () => {
    const untested = report([result('dead_hang', null, 'never-tested')]);
    expect(chooseNext({ candidates: CANDIDATES, report: untested }).note).toContain('Iron Grip');
  });

  it('stays quiet for a block that declares no benchmarks at all', () => {
    // Trip Prep is four weeks of taper and says in its own pitch that it is
    // not a training block. `blockReport` returns null for it, and
    // explaining an order it never tried to earn would be explaining a
    // choice as though it were a gap.
    expect(chooseNext({ candidates: CANDIDATES, report: null }).note).toBeNull();
  });

  it('carries the author’s reason through untouched', () => {
    const [first] = chooseNext({ candidates: CANDIDATES, report: null }).choices;
    expect(first!.reason).toBe('You have the finger strength.');
  });
});

describe('a block that left something where it was', () => {
  /** Fingers moved; the dead hang and the pull-ups did not. */
  const mixed = report([
    result('max_hang_20mm_7s', 'better'),
    result('dead_hang', 'flat'),
    result('max_pullups', 'flat'),
  ]);

  it('puts the program that trains the unmoved first', () => {
    // The Cruiser declares both the dead hang and max pull-ups; Peak
    // Performance declares neither and is written first.
    expect(names({ candidates: CANDIDATES, report: mixed })[0]).toBe('the_cruiser');
  });

  it('names them, in the climber’s words', () => {
    // The whole phrase, conjunction included: a list read out as "dead
    // hang, max pull-ups" is a spreadsheet cell rather than a sentence.
    const cruiser = chooseNext({ candidates: CANDIDATES, report: mixed }).choices[0]!;
    expect(cruiser.because).toContain('This block left your dead hang and max pull-ups where they were');
  });

  it('says one of them in the singular', () => {
    const one = report([result('arc_duration', 'flat')]);
    const long = chooseNext({ candidates: CANDIDATES, report: one }).choices[0]!;
    expect(long.because).toContain('This block left your arc duration where it was, and this trains it.');
  });

  it('counts a benchmark that went backwards as one that did not move', () => {
    const worse = report([result('dead_hang', 'worse'), result('max_pullups', 'worse')]);
    expect(names({ candidates: CANDIDATES, report: worse })[0]).toBe('the_cruiser');
  });

  it('says what it is doing, over the list', () => {
    expect(chooseNext({ candidates: CANDIDATES, report: mixed }).note).toMatch(
      /left where it was/,
    );
  });

  it('ignores a benchmark the program does not train', () => {
    // `arc_duration` is The Long Game's and nobody else's, so a flat one
    // argues for it and for nothing else.
    const arc = report([result('arc_duration', 'flat')]);
    expect(names({ candidates: CANDIDATES, report: arc })[0]).toBe('the_long_game');
  });

  it('keeps the author’s order between two that are equally argued for', () => {
    // Every candidate declares max_pushups, so the unmoved count ties and
    // nothing may reorder them.
    const shared = report([result('max_pushups', 'flat')]);
    expect(names({ candidates: CANDIDATES, report: shared })).toEqual([
      'peak_performance',
      'the_long_game',
      'the_cruiser',
    ]);
  });
});

describe('a block that moved everything it measured', () => {
  const allMoved = report([result('max_hang_20mm_7s', 'better'), result('max_pushups', 'better')]);

  it('does not reorder on the strength of what improved', () => {
    expect(names({ candidates: CANDIDATES, report: allMoved })).toEqual([
      'peak_performance',
      'the_long_game',
      'the_cruiser',
    ]);
  });

  it('says so, without calling it a recommendation', () => {
    const peak = chooseNext({ candidates: CANDIDATES, report: allMoved }).choices[0]!;
    expect(peak.because).toMatch(/consolidation rather than a new stimulus/);
    expect(peak.because).toMatch(/choice rather than a fault/);
  });

  it('stays quiet over the list, because there is no ordering to explain', () => {
    expect(chooseNext({ candidates: CANDIDATES, report: allMoved }).note).toBeNull();
  });

  it('mentions the overlap beside the argument when there is both', () => {
    const both = report([result('dead_hang', 'flat'), result('max_pushups', 'better')]);
    const first = chooseNext({ candidates: CANDIDATES, report: both }).choices[0]!;
    expect(first.because).toMatch(/It also trains max push-ups, which did move/i);
  });
});

describe('a block that was barely run', () => {
  const thin = { planned: 36, done: 4 } as BlockAdherence;
  const mixed = report([result('dead_hang', 'flat')]);

  it('says to run it again rather than follow it', () => {
    const { note } = chooseNext({ candidates: CANDIDATES, report: mixed, adherence: thin });
    expect(note).toMatch(/You did 4 of the 36 sessions/);
    expect(note).toMatch(/running it again is the honest next step/);
  });

  it('still offers the successors, because it is the climber’s call', () => {
    expect(chooseNext({ candidates: CANDIDATES, report: mixed, adherence: thin }).choices).toHaveLength(3);
  });

  it('says nothing of the sort about a block that was run', () => {
    const ran = { planned: 36, done: 30 } as BlockAdherence;
    const { note } = chooseNext({ candidates: CANDIDATES, report: mixed, adherence: ran });
    expect(note).not.toMatch(/You did 30/);
  });

  it('does not call a handful of placed sessions a block that was skipped', () => {
    // Four of seven is under half and is not evidence of anything.
    const few = { planned: 7, done: 3 } as BlockAdherence;
    const { note } = chooseNext({ candidates: CANDIDATES, report: mixed, adherence: few });
    expect(note).not.toMatch(/You did 3 of the 7/);
  });
});
