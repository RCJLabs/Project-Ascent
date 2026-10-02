import { describe, expect, it } from 'vitest';
import type { SharedBlock, SharedResult } from './blockFile';
import { blockSeries, oldestFirst, sameBlock } from './blockSeries';

/**
 * An athlete's blocks side by side, from open files (PLAN.md M362).
 *
 * The page test is `features/shared/sharedBlock.test.tsx`. This is the rule
 * underneath it: which block is first, which metrics get a row, and what a
 * row says when a block measured nothing.
 */

const result = (metricId: string, latest: number | null, over: Partial<SharedResult> = {}): SharedResult => ({
  metricId: metricId as SharedResult['metricId'],
  label: `their ${metricId}`,
  baseline: latest === null ? null : latest - 1,
  latest,
  moved: latest === null ? null : 'better',
  percent: null,
  steps: null,
  gap: latest === null ? 'never-tested' : null,
  ...over,
});

const block = (through: string, results: SharedResult[], over: Partial<SharedBlock> = {}): SharedBlock => ({
  program: 'Iron Grip',
  from: `${through.slice(0, 4)}-01-01`,
  through,
  weeksRun: 12,
  outcome: 'completed',
  sessions: 30,
  planned: 36,
  better: 1,
  worse: 0,
  flat: 0,
  lightBetter: 0,
  lightWorse: 0,
  untested: 0,
  results,
  summary: '',
  ...over,
});

describe('the blocks', () => {
  it('come oldest first, whatever order they were opened in', () => {
    const spring = block('2026-03-29', []);
    const summer = block('2026-06-28', []);
    const autumn = block('2026-09-27', []);
    expect(blockSeries([autumn, spring, summer]).blocks).toEqual([spring, summer, autumn]);
  });

  it('two that end on the same day are put in the order they began', () => {
    const long = block('2026-06-28', [], { from: '2026-04-05' });
    const short = block('2026-06-28', [], { from: '2026-05-31' });
    expect(oldestFirst([short, long])).toEqual([long, short]);
  });

  it('are the same block only with the same program and the same days', () => {
    const a = block('2026-06-28', []);
    expect(sameBlock(a, { ...a, results: [result('max_hang_20mm_7s', 18)] })).toBe(true);
    expect(sameBlock(a, { ...a, through: '2026-06-27' })).toBe(false);
    expect(sameBlock(a, { ...a, from: '2026-04-06' })).toBe(false);
    expect(sameBlock(a, { ...a, program: 'Cruiser' })).toBe(false);
  });
});

describe('the rows', () => {
  it('put what each block ended on side by side, in the blocks’ order', () => {
    const series = blockSeries([
      block('2026-06-28', [result('max_hang_20mm_7s', 15)]),
      block('2026-03-29', [result('max_hang_20mm_7s', 12)]),
      block('2026-09-27', [result('max_hang_20mm_7s', 18)]),
    ]);
    expect(series.rows).toHaveLength(1);
    expect(series.rows[0]!.readings).toEqual(['12', '15', '18']);
  });

  it('use the block’s own words for a reading when it gave some', () => {
    const series = blockSeries([
      block('2026-03-29', [result('max_boulder_grade', 5, { latestDisplay: 'V5' })]),
      block('2026-06-28', [result('max_boulder_grade', 6, { latestDisplay: 'V6' })]),
    ]);
    expect(series.rows[0]!.readings).toEqual(['V5', 'V6']);
  });

  it('leave a gap where a block measured nothing, rather than closing it up', () => {
    // Three blocks, the middle one untested: closing the gap would put
    // autumn's 18 under summer's date.
    const series = blockSeries([
      block('2026-03-29', [result('max_hang_20mm_7s', 12)]),
      block('2026-06-28', [result('max_hang_20mm_7s', null)]),
      block('2026-09-27', [result('max_hang_20mm_7s', 18)]),
    ]);
    expect(series.rows[0]!.readings).toEqual(['12', null, '18']);
  });

  it('leave a gap for a block that did not list the test at all', () => {
    const series = blockSeries([
      block('2026-03-29', [result('max_hang_20mm_7s', 12)]),
      block('2026-06-28', []),
      block('2026-09-27', [result('max_hang_20mm_7s', 18)]),
    ]);
    expect(series.rows[0]!.readings).toEqual(['12', null, '18']);
  });

  it('read a baseline-only or listed-only test as nothing measured', () => {
    // A latest value can ride along on a row whose gap says it is not a
    // reading: once-only has one point, not-a-number has text.
    const series = blockSeries([
      block('2026-03-29', [result('max_hang_20mm_7s', 12)]),
      block('2026-06-28', [result('max_hang_20mm_7s', 14, { gap: 'once-only' })]),
      block('2026-09-27', [result('max_hang_20mm_7s', 18)]),
    ]);
    expect(series.rows[0]!.readings).toEqual(['12', null, '18']);
  });

  it('give no row to a test only one block measured, because one reading is not a comparison', () => {
    const series = blockSeries([
      block('2026-03-29', [result('max_hang_20mm_7s', 12), result('pull_ups_max', 9)]),
      block('2026-06-28', [result('max_hang_20mm_7s', 15), result('pull_ups_max', null)]),
    ]);
    expect(series.rows.map((r) => r.metricId)).toEqual(['max_hang_20mm_7s']);
  });

  it('list the tests in the order they first appear, oldest block first', () => {
    const series = blockSeries([
      block('2026-06-28', [result('pull_ups_max', 10), result('max_hang_20mm_7s', 15)]),
      block('2026-03-29', [result('max_hang_20mm_7s', 12), result('pull_ups_max', 9)]),
    ]);
    expect(series.rows.map((r) => r.metricId)).toEqual(['max_hang_20mm_7s', 'pull_ups_max']);
  });

  it('name a test as this app does, falling back to the sender’s name', () => {
    const series = blockSeries([
      block('2026-03-29', [result('max_hang_20mm_7s', 12), result('their_own_test', 3)]),
      block('2026-06-28', [result('max_hang_20mm_7s', 15), result('their_own_test', 4)]),
    ]);
    expect(series.rows[0]!.label).not.toBe('their max_hang_20mm_7s');
    expect(series.rows[1]!.label).toBe('their their_own_test');
  });

  it('is empty, not wrong, for one block', () => {
    expect(blockSeries([block('2026-03-29', [result('max_hang_20mm_7s', 12)])]).rows).toEqual([]);
  });
});
