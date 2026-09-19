import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@/db/schema';
import {
  BlockFileError,
  blockFileName,
  buildBlockFile,
  labelFor,
  outcomeWord,
  parseBlockFile,
  type BlockFile,
  type SharedResult,
} from './blockFile';
import type { BlockReport } from './blockReport';

/**
 * An athlete's block, as a file (PLAN.md M292).
 *
 * `programFile.ts` says what the weight of this is: *"the parser is the
 * substance and the file format is the easy part"*. So most of these are
 * about what a hand-edited file cannot make the app do.
 */

const METRIC = {
  id: 'max_hang_20mm_7s',
  label: 'Max Hang 20mm 7s',
} as const;

function report(over: Partial<BlockReport> = {}): BlockReport {
  return {
    program: { id: 'iron_grip', name: 'Iron Grip', weeks: 12 } as BlockReport['program'],
    from: '2026-06-07',
    to: '2026-08-29',
    through: '2026-08-29',
    finished: true,
    tests: [],
    results: [
      {
        metric: METRIC as never,
        points: [],
        baseline: { metricId: METRIC.id, date: '2026-06-08', value: 12 },
        latest: { metricId: METRIC.id, date: '2026-08-24', value: 15 },
        moved: 'better',
        percent: 25,
        steps: null,
        gap: null,
      },
    ],
    comparable: [],
    better: 1,
    worse: 0,
    flat: 0,
    untested: 0,
    ...over,
  } as BlockReport;
}

const built = (over: Partial<BlockReport> = {}): BlockFile =>
  buildBlockFile({
    report: report(over),
    outcome: 'completed',
    weeksRun: 12,
    sessions: 30,
    planned: 36,
    summary: 'One of one improved.',
  });

const round = (file: BlockFile) => parseBlockFile(JSON.stringify(file));

describe('the file an athlete saves', () => {
  it('names itself, its app and its schema', () => {
    const file = built();
    expect(file.app).toBe('project-ascent');
    expect(file.kind).toBe('block');
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
  });

  /**
   * The rule the whole milestone turns on. A file that carried the log
   * would be an import, and `SharedBlockPage` exists because an import is
   * exactly what this must not be.
   */
  it('carries the report and none of the log it came from', () => {
    const text = JSON.stringify(built());
    expect(text).toContain('Iron Grip');
    expect(text).not.toContain('sessionTypeId');
    expect(text).not.toContain('climbs');
    expect(text).not.toContain('location');
    expect(text).not.toContain('notes');
    // Not even the dated readings: a baseline and a latest, as numbers.
    expect(text).not.toContain('2026-06-08');
  });

  it('is named for the block and the day it closed', () => {
    expect(blockFileName({ program: 'Iron Grip', through: '2026-08-29' }))
      .toBe('iron-grip-2026-08-29.ascent-block.json');
  });

  it('survives a program name that is all punctuation', () => {
    expect(blockFileName({ program: '!!!', through: '2026-08-29' }))
      .toBe('block-2026-08-29.ascent-block.json');
  });

  it('comes back the other side unchanged', () => {
    const block = round(built()).results[0]!;
    expect(block.baseline).toBe(12);
    expect(block.latest).toBe(15);
    expect(block.moved).toBe('better');
    expect(block.percent).toBe(25);
  });
});

describe('reading one somebody else wrote', () => {
  const bad = (text: string) => () => parseBlockFile(text);

  it('refuses something that is not JSON', () => {
    expect(bad('not json')).toThrow(BlockFileError);
  });

  it('refuses another app’s file', () => {
    expect(bad(JSON.stringify({ app: 'something-else', kind: 'block' }))).toThrow(BlockFileError);
  });

  /** A program file is the same app, the same extension and a different thing. */
  it('refuses this app’s other document', () => {
    expect(bad(JSON.stringify({ app: 'project-ascent', kind: 'program', program: {} })))
      .toThrow(BlockFileError);
  });

  it('refuses one written by a newer app than this', () => {
    expect(bad(JSON.stringify({ ...built(), schemaVersion: SCHEMA_VERSION + 1 })))
      .toThrow(/newer version/);
  });

  it('refuses one with no block in it', () => {
    expect(bad(JSON.stringify({ app: 'project-ascent', kind: 'block' }))).toThrow(BlockFileError);
  });
});

describe('what a hand-edited file cannot do', () => {
  const withBlock = (block: unknown) =>
    parseBlockFile(JSON.stringify({ app: 'project-ascent', kind: 'block', block }));

  it('cannot hand over forty thousand results', () => {
    const many = Array.from({ length: 9_000 }, () => ({ metricId: METRIC.id, label: 'x' }));
    expect(withBlock({ results: many }).results.length).toBeLessThanOrEqual(40);
  });

  it('cannot claim a block of nine hundred weeks', () => {
    expect(withBlock({ weeksRun: 90_000 }).weeksRun).toBe(520);
    expect(withBlock({ weeksRun: -4 }).weeksRun).toBe(0);
  });

  it('cannot smuggle a movement or a gap the app does not have', () => {
    const one = withBlock({ results: [{ metricId: METRIC.id, moved: 'amazing', gap: 'lost' }] });
    expect(one.results[0]!.moved).toBeNull();
    expect(one.results[0]!.gap).toBeNull();
  });

  it('cannot put an outcome the app has no word for on screen', () => {
    expect(withBlock({ outcome: 'triumphant' }).outcome).toBe('unknown');
    expect(outcomeWord(withBlock({ outcome: 'triumphant' }).outcome))
      .toBe('no record of how it ended');
  });

  /**
   * `Infinity` is not JSON and `1e999` is — it parses to `Infinity`, which
   * would print as a reading nobody can act on.
   *
   * Written as **text** rather than through `JSON.stringify`, which is what
   * the first draft did: stringify turns `Infinity` into `null`, so the
   * parser never saw one and the test passed whatever the parser did. A
   * mutant that accepted any number survived it.
   */
  it('cannot hand over a number that is not one', () => {
    const one = parseBlockFile(
      '{"app":"project-ascent","kind":"block","block":{"results":' +
        `[{"metricId":"${METRIC.id}","percent":1e999,"steps":-1e999}]}}`,
    );
    expect(one.results[0]!.percent, 'Infinity reached the percentage').toBeNull();
    expect(one.results[0]!.steps, '-Infinity reached the steps').toBeNull();
  });

  it('cannot hand over a number that is a word', () => {
    const one = withBlock({ results: [{ metricId: METRIC.id, percent: 'loads', steps: 'lots' }] });
    expect(one.results[0]!.percent).toBeNull();
    expect(one.results[0]!.steps).toBeNull();
  });

  it('cannot carry a date that is not one', () => {
    expect(withBlock({ from: 'yesterday', through: '2026-08-29' }).from).toBe('');
    expect(withBlock({ through: '2026-08-29' }).through).toBe('2026-08-29');
  });

  it('drops a result that names no metric at all', () => {
    expect(withBlock({ results: [{ percent: 4 }, { metricId: METRIC.id }] }).results)
      .toHaveLength(1);
  });

  it('falls back to a name rather than showing nothing', () => {
    expect(withBlock({}).program).toBe('Their block');
  });
});

describe('the label a row reads under', () => {
  it('uses this app’s own spelling when it ships the metric', () => {
    expect(labelFor({ metricId: METRIC.id, label: 'Their words' } as SharedResult))
      .toBe(METRIC.label);
  });

  /** A sender on a newer version knows metrics this app does not. */
  it('falls back to the sender’s when it does not', () => {
    expect(labelFor({ metricId: 'not_a_metric', label: 'Their words' } as SharedResult))
      .toBe('Their words');
  });
});
