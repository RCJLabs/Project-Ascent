import { describe, expect, it } from 'vitest';
import type { Program } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { addDays, startOfWeek } from './dates';
import { blockReport, describeBlock, movementLabel } from './blockReport';
import { getMetric } from '@/content/metrics';

/**
 * The block report (PLAN.md M84).
 *
 * `assessments.test.ts` holds the test weeks. These hold the comparison —
 * above all the two things that would make it lie: a metric where lower is
 * better, and a scale that has no percentage.
 */

const START = '2026-01-04'; // a Sunday
const WEEKS = 12;

const program = (patch: Partial<Program> = {}): Program =>
  ({
    id: 'test_block',
    name: 'Test Block',
    kind: 'program',
    weeks: WEEKS,
    phases: [
      { name: 'Base', weekStart: 1 },
      { name: 'Build', weekStart: 5 },
      { name: 'Peak', weekStart: 9 },
    ],
    assessments: ['dead_hang'],
    sessionTypes: [],
    ...patch,
  }) as Program;

let seq = 0;
const entry = (metricId: string, date: string, value: number): MetricEntry =>
  ({ id: `e${seq++}`, metricId, date, value, createdAt: `${date}T10:00:00.000Z` }) as MetricEntry;

const report = (p: Program, entries: MetricEntry[], today = '2026-03-01') =>
  blockReport({ program: p, startDate: START, entries, today });

describe('the block window', () => {
  it('runs from week one to the last day of the last week', () => {
    const r = report(program(), [])!;
    expect(r.from).toBe(startOfWeek(START));
    expect(r.to).toBe(addDays(r.from, WEEKS * 7 - 1));
  });

  it('starts on the Sunday of the week the climber began, not on the day', () => {
    // The fixture start is itself a Sunday, so this was invisible until a
    // mid-week one was used — and it matters: `programWeek` snaps to the
    // week too, so a Wednesday start would otherwise put the report window
    // three days out of step with the week numbers it is reporting on.
    const wednesday = '2026-01-07';
    const r = blockReport({ program: program(), startDate: wednesday, entries: [], today: '2026-03-01' })!;
    expect(r.from).toBe('2026-01-04');
    expect(r.tests[0]!.from).toBe('2026-01-04');
  });

  it('stops at today while the block is still running', () => {
    const r = report(program(), [], '2026-02-01')!;
    expect(r.through).toBe('2026-02-01');
    expect(r.finished).toBe(false);
  });

  it('stops at the block end once it is over', () => {
    const r = report(program(), [], '2027-01-01')!;
    expect(r.through).toBe(r.to);
    expect(r.finished).toBe(true);
  });

  it('puts a test week on its own seven days', () => {
    const r = report(program(), [])!;
    expect(r.tests.map((t) => t.week)).toEqual([1, 5, 9, 12]);
    expect(r.tests[0]!.from).toBe(r.from);
    expect(r.tests[0]!.to).toBe(addDays(r.from, 6));
    expect(r.tests[1]!.from).toBe(addDays(r.from, 28));
  });

  it('has nothing to report for a mode, which has no test weeks', () => {
    expect(report(program({ kind: 'mode', weeks: 52 }), [])).toBeNull();
  });

  it('has nothing to report before the block starts', () => {
    expect(report(program(), [], '2025-12-01')).toBeNull();
  });
});

describe('what counts as a comparison', () => {
  it('takes the first reading in the block as the baseline and the last as the after', () => {
    const r = report(program(), [
      entry('dead_hang', '2026-01-05', 30),
      entry('dead_hang', '2026-02-02', 38),
      entry('dead_hang', '2026-02-20', 42),
    ])!;
    const row = r.results[0]!;
    expect(row.baseline!.value).toBe(30);
    expect(row.latest!.value).toBe(42);
    expect(row.points.length).toBe(3);
  });

  it('ignores a reading from before the block', () => {
    const r = report(program(), [
      entry('dead_hang', '2025-11-01', 10),
      entry('dead_hang', '2026-01-05', 30),
      entry('dead_hang', '2026-02-02', 38),
    ])!;
    expect(r.results[0]!.baseline!.value).toBe(30);
  });

  it('ignores a reading after the day the report covers', () => {
    const r = report(
      program(),
      [entry('dead_hang', '2026-01-05', 30), entry('dead_hang', '2026-02-20', 99)],
      '2026-02-01',
    )!;
    expect(r.results[0]!.latest).toBeNull();
    expect(r.results[0]!.gap).toBe('once-only');
  });

  it('says a metric has a baseline and no retest', () => {
    const r = report(program(), [entry('dead_hang', '2026-01-05', 30)])!;
    expect(r.results[0]!.gap).toBe('once-only');
    expect(r.results[0]!.moved).toBeNull();
    expect(r.untested).toBe(1);
  });

  it('says a metric was never taken', () => {
    const r = report(program(), [])!;
    expect(r.results[0]!.gap).toBe('never-tested');
  });
});

describe('direction, not magnitude', () => {
  it('calls a rise better when higher is better', () => {
    const r = report(program(), [
      entry('dead_hang', '2026-01-05', 30),
      entry('dead_hang', '2026-02-02', 40),
    ])!;
    expect(getMetric('dead_hang')!.higherIsBetter).toBe(true);
    expect(r.results[0]!.moved).toBe('better');
    expect(r.results[0]!.percent).toBeCloseTo(33.33, 1);
  });

  it('calls a fall better when lower is better', () => {
    // `toe_touch` and `min_edge` are the two in the real batteries. Without
    // the flag they would both read backwards.
    const metric = getMetric('toe_touch')!;
    expect(metric.higherIsBetter).toBe(false);
    const r = report(program({ assessments: ['toe_touch'] }), [
      entry('toe_touch', '2026-01-05', 10),
      entry('toe_touch', '2026-02-02', 4),
    ])!;
    expect(r.results[0]!.moved).toBe('better');
    expect(r.results[0]!.percent).toBeCloseTo(60, 1);
  });

  it('calls a rise worse when lower is better', () => {
    const r = report(program({ assessments: ['toe_touch'] }), [
      entry('toe_touch', '2026-01-05', 4),
      entry('toe_touch', '2026-02-02', 10),
    ])!;
    expect(r.results[0]!.moved).toBe('worse');
    expect(r.results[0]!.percent).toBeCloseTo(-150, 1);
  });

  it('reads a negative baseline as a size, not as a direction', () => {
    // `weighted_pullup_3rm` is in BW+lbs, so a climber on band assistance
    // logs a negative. Going from −20 to −5 is fifteen pounds of progress;
    // dividing by the raw baseline would report it as a 75% decline while
    // `moved` said 'better', and the chart would draw the two against each
    // other.
    const r = report(program({ assessments: ['weighted_pullup_3rm'] }), [
      entry('weighted_pullup_3rm', '2026-01-05', -20),
      entry('weighted_pullup_3rm', '2026-02-02', -5),
    ])!;
    expect(r.results[0]!.moved).toBe('better');
    expect(r.results[0]!.percent).toBeCloseTo(75, 1);
  });

  it('calls no change flat', () => {
    const r = report(program(), [
      entry('dead_hang', '2026-01-05', 30),
      entry('dead_hang', '2026-02-02', 30),
    ])!;
    expect(r.results[0]!.moved).toBe('flat');
    expect(r.results[0]!.percent).toBe(0);
  });
});

describe('scales that have no percentage', () => {
  it('gives a grade metric steps rather than a percent', () => {
    const metric = getMetric('flash_grade')!;
    expect(metric.kind).toBe('grade');
    const r = report(program({ assessments: ['flash_grade'] }), [
      entry('flash_grade', '2026-01-05', 4),
      entry('flash_grade', '2026-02-02', 6),
    ])!;
    expect(r.results[0]!.percent).toBeNull();
    expect(r.results[0]!.steps).toBe(2);
    expect(r.results[0]!.moved).toBe('better');
    expect(r.comparable).toEqual([]);
  });

  it('gives a pass/fail metric neither', () => {
    const metric = getMetric('wall_angel')!;
    expect(metric.kind).toBe('passfail');
    const r = report(program({ assessments: ['wall_angel'] }), [
      entry('wall_angel', '2026-01-05', 0),
      entry('wall_angel', '2026-02-02', 1),
    ])!;
    expect(r.results[0]!.percent).toBeNull();
    expect(r.results[0]!.steps).toBeNull();
    expect(r.results[0]!.moved).toBe('better');
  });

  it('refuses a percent on a baseline of zero', () => {
    // Nought pull-ups to three is real and has no percentage.
    const r = report(program({ assessments: ['max_pullups'] }), [
      entry('max_pullups', '2026-01-05', 0),
      entry('max_pullups', '2026-02-02', 3),
    ])!;
    expect(r.results[0]!.moved).toBe('better');
    expect(r.results[0]!.percent).toBeNull();
  });

  it('leaves a text metric out of the comparison entirely', () => {
    // Iron Grip assesses `core_lever`, which is text.
    expect(getMetric('core_lever')!.kind).toBe('text');
    const r = report(program({ assessments: ['core_lever'] }), [
      entry('core_lever', '2026-01-05', 0),
      entry('core_lever', '2026-02-02', 1),
    ])!;
    expect(r.results[0]!.gap).toBe('not-a-number');
    expect(r.results[0]!.moved).toBeNull();
  });

  it('survives a metric the catalogue no longer carries', () => {
    const r = report(program({ assessments: ['gone_from_the_app' as never] }), [])!;
    expect(r.results[0]!.metric.label).toBe('gone_from_the_app');
    expect(r.results[0]!.gap).toBe('not-a-number');
  });
});

describe('the change in its own terms', () => {
  const labelFor = (assessments: string[], a: number, b: number) =>
    movementLabel(
      report(program({ assessments: assessments as never }), [
        entry(assessments[0]!, '2026-01-05', a),
        entry(assessments[0]!, '2026-02-02', b),
      ])!.results[0]!,
    );

  it('names a number with its unit', () => {
    expect(labelFor(['dead_hang'], 30, 42)).toBe('+12 sec');
    expect(labelFor(['dead_hang'], 42, 30)).toBe('−12 sec');
    expect(labelFor(['dead_hang'], 30, 30)).toBe('no change');
  });

  it('names a grade in grades, singular and plural', () => {
    expect(labelFor(['flash_grade'], 4, 5)).toBe('+1 grade');
    expect(labelFor(['flash_grade'], 4, 6)).toBe('+2 grades');
    expect(labelFor(['flash_grade'], 6, 4)).toBe('−2 grades');
    expect(labelFor(['flash_grade'], 4, 4)).toBe('same grade');
  });

  it('names a pass/fail by what it is now', () => {
    expect(labelFor(['wall_angel'], 0, 1)).toBe('now passing');
    expect(labelFor(['wall_angel'], 1, 0)).toBe('now failing');
    expect(labelFor(['wall_angel'], 1, 1)).toBe('still passing');
    expect(labelFor(['wall_angel'], 0, 0)).toBe('still failing');
  });

  it('has nothing to name without a pair', () => {
    const r = report(program(), [entry('dead_hang', '2026-01-05', 30)])!;
    expect(movementLabel(r.results[0]!)).toBe('—');
  });
});

describe('what it says out loud', () => {
  const two = program({ assessments: ['dead_hang', 'max_pushups'] });

  it('leads with the count, not the winners', () => {
    const text = describeBlock(
      report(two, [
        entry('dead_hang', '2026-01-05', 30),
        entry('dead_hang', '2026-02-02', 40),
        entry('max_pushups', '2026-01-05', 20),
        entry('max_pushups', '2026-02-02', 15),
      ])!,
    );
    expect(text).toMatch(/^one of the 2 retested numbers improved, one went the other way\./);
  });

  it('never says and twice when the list is cut short', () => {
    // "Up: Max Hang, Repeater Weight and Lock-Off and 2 more" — found in a
    // browser, where a nine-metric battery put five names in the list.
    const five = program({
      assessments: ['dead_hang', 'max_pushups', 'max_pullups', 'core_plank', 'lock_off_90'],
    });
    const text = describeBlock(
      report(
        five,
        five.assessments.flatMap((id) => [entry(id, '2026-01-05', 10), entry(id, '2026-02-02', 20)]),
      )!,
    );
    const up = text.slice(text.indexOf('Up:'));
    expect(up.slice(0, up.indexOf('.')).match(/ and /g)?.length).toBe(1);
    expect(up).toContain('and 2 more');
  });

  it('names both directions', () => {
    const text = describeBlock(
      report(two, [
        entry('dead_hang', '2026-01-05', 30),
        entry('dead_hang', '2026-02-02', 40),
        entry('max_pushups', '2026-01-05', 20),
        entry('max_pushups', '2026-02-02', 15),
      ])!,
    );
    expect(text).toContain('Up: Dead Hang');
    expect(text).toContain('Down: Max Push-Ups');
  });

  it('does not hide the ones with no comparison', () => {
    const text = describeBlock(
      report(two, [entry('dead_hang', '2026-01-05', 30), entry('dead_hang', '2026-02-02', 40)])!,
    );
    expect(text).toContain('one of the 2 has no comparison this block');
  });

  it('says when nothing has been taken at all', () => {
    expect(describeBlock(report(two, [])!)).toContain('no before to put an after beside');
  });

  it('says when there are baselines and no retests', () => {
    const text = describeBlock(
      report(two, [
        entry('dead_hang', '2026-01-05', 30),
        entry('max_pushups', '2026-01-05', 20),
      ])!,
    );
    expect(text).toContain('two of the 2');
    expect(text).toContain('baseline and no retest');
  });

  it('pluralises the noun on how many were retested, not on how many rose', () => {
    // "one of the 2 retested number improved" — the first version.
    const text = describeBlock(
      report(two, [
        entry('dead_hang', '2026-01-05', 30),
        entry('dead_hang', '2026-02-02', 40),
        entry('max_pushups', '2026-01-05', 20),
        entry('max_pushups', '2026-02-02', 15),
      ])!,
    );
    expect(text).toContain('of the 2 retested numbers');
    expect(text).not.toContain('retested number improved');
  });

  it('agrees with itself about one', () => {
    const text = describeBlock(
      report(program(), [
        entry('dead_hang', '2026-01-05', 30),
        entry('dead_hang', '2026-02-02', 40),
      ])!,
    );
    expect(text).toContain('one of the 1 retested number improved');
    expect(text).not.toContain('numbers improved');
  });
});
