import { describe, expect, it } from 'vitest';
import { METRICS } from '@/content/metrics';
import type { MetricEntry } from '@/db/metrics';
import type { Project } from '@/db/projects';
import { newSession, type Session } from '@/db/sessions';
import { parseCsv } from './csv';
import { attemptsCsv, climbsCsv, metricsCsv, sessionsCsv } from './exportCsv';
import { guessColumns, importCsv } from './importCsv';

/**
 * The same history, back out (PLAN.md M105b).
 *
 * The property that matters is the round trip: a file this app writes is a
 * file this app can read, without the climber answering a question about
 * it. Everything else here is about a spreadsheet being readable by a
 * person, which is the other half of the point.
 */

const day = (date: string, patch: Partial<Session> = {}): Session =>
  newSession(date, 0, { completed: true, ...patch });

const climb = (grade: string, patch: Partial<Session['climbs'][number]> = {}) => ({
  id: `c-${grade}`,
  grade,
  scale: (grade.startsWith('V') ? 'V' : 'YDS') as 'V' | 'YDS',
  count: 1,
  result: 'send' as const,
  ...patch,
});

const rows = (csv: string) => parseCsv(csv);

describe('every climb, one per row', () => {
  const log = [
    day('2026-01-11', { mode: 'outdoor', climbs: [climb('5.11a', { result: 'attempt', count: 3 })] }),
    day('2026-01-09', {
      climbs: [climb('V4', { count: 2, style: 'flash' }), climb('V5')],
      fields: { location: 'The Works' },
      notes: 'good day',
    }),
  ];

  it('writes a header a person can read', () => {
    expect(rows(climbsCsv(log))[0]).toEqual([
      'Date', 'Discipline', 'Grade', 'Result', 'Count', 'Ascent style', 'Mode', 'Place', 'Notes',
    ]);
  });

  it('writes one row per climb, oldest day first', () => {
    const out = rows(climbsCsv(log));
    expect(out.slice(1).map((r) => [r[0], r[2]])).toEqual([
      ['2026-01-09', 'V4'],
      ['2026-01-09', 'V5'],
      ['2026-01-11', '5.11a'],
    ]);
  });

  it('names the discipline a climber would sort on', () => {
    const out = rows(climbsCsv(log));
    expect(out[1]![1]).toBe('boulder');
    expect(out[3]![1]).toBe('route');
  });

  it('carries the day around each climb', () => {
    const out = rows(climbsCsv(log))[1]!;
    expect(out[6]).toBe('indoor');
    expect(out[7]).toBe('The Works');
    expect(out[8]).toBe('good day');
  });

  it('says nothing where the session said nothing', () => {
    const bare = rows(climbsCsv([day('2026-01-09', { climbs: [climb('V4')] })]))[1]!;
    expect([bare[5], bare[7], bare[8]]).toEqual(['', '', '']);
  });

  it('writes nothing but a header for a log with no climbs', () => {
    expect(rows(climbsCsv([day('2026-01-09')]))).toHaveLength(1);
  });
});

/**
 * The round trip, which is the whole promise.
 *
 * A file this app writes has to be one it can read with no questions asked
 * — which is why grades go out canonical rather than as displayed: Font and
 * French are written identically, so the display spelling would produce a
 * file needing a discipline answered for every row (M105).
 */
describe('the round trip', () => {
  const log = [
    day('2026-01-09', {
      climbs: [climb('V4', { count: 2 }), climb('V5', { result: 'attempt' })],
      fields: { location: 'The Works' },
      notes: 'good day',
    }),
    day('2026-01-11', { mode: 'outdoor', climbs: [climb('5.11a'), climb('5.12c', { count: 4 })] }),
  ];

  /** Export, then read it back exactly as the import screen would. */
  const back = () => {
    const table = parseCsv(climbsCsv(log));
    const [header = [], ...body] = table;
    return importCsv({ rows: body, columns: guessColumns(header) });
  };

  it('is read back with nothing refused and nothing asked', () => {
    const out = back();
    expect(out.refused).toEqual([]);
    expect(out.sessions).toHaveLength(2);
  });

  it('brings every climb back as it went out', () => {
    const out = back();
    expect(out.sessions.map((s) => s.climbs.map((c) => [c.grade, c.result, c.count]))).toEqual([
      [['V4', 'send', 2], ['V5', 'attempt', 1]],
      [['5.11a', 'send', 1], ['5.12c', 'send', 4]],
    ]);
  });

  it('brings the day back with it', () => {
    const out = back();
    expect(out.sessions[0]!.fields?.location).toBe('The Works');
    expect(out.sessions[0]!.notes).toBe('good day');
    expect(out.sessions[1]!.mode).toBe('outdoor');
  });

  it('counts the same climbs on the way back', () => {
    expect(back().climbs).toBe(8);
  });

  // The header guesser has to place every column this writer produces,
  // including the ones it deliberately ignores.
  it('is mapped by the guesser without a hand on it', () => {
    const header = parseCsv(climbsCsv(log))[0]!;
    expect(guessColumns(header)).toEqual([
      'date', 'discipline', 'grade', 'result', 'count', 'skip', 'mode', 'place', 'notes',
    ]);
  });
});

describe('every session, one per row', () => {
  const nameOf = () => ['Iron Grip', 'Finger Protocol'] as [string, string];

  it('carries what a climb row has no column for', () => {
    const out = rows(
      sessionsCsv({
        sessions: [day('2026-01-09', { rpe: 8, durationMin: 95, warmup: true, programId: 'ig', sessionTypeId: 'fp' })],
        nameOf,
      }),
    );
    expect(out[0]).toContain('RPE');
    expect(out[1]!.slice(0, 9)).toEqual([
      '2026-01-09', '1', 'Iron Grip', 'Finger Protocol', 'indoor', 'yes', '8', '95', 'yes',
    ]);
  });

  // Two sessions on one date are two rows, and a reader has to be able to
  // tell which is which.
  it('numbers the sessions within a day from one', () => {
    const two = [day('2026-01-09'), newSession('2026-01-09', 1, { completed: true })];
    expect(rows(sessionsCsv({ sessions: two })).slice(1).map((r) => r[1])).toEqual(['1', '2']);
  });

  it('tells a blank apart from a no', () => {
    const out = rows(sessionsCsv({ sessions: [day('2026-01-09')] }))[1]!;
    // Nothing was said about the warmup, which is not the same as skipping it.
    expect(out[8]).toBe('');
    expect(rows(sessionsCsv({ sessions: [day('2026-01-09', { warmup: false })] }))[1]![8]).toBe('no');
  });

  it('marks a rest day as one', () => {
    const rest = day('2026-01-09', {
      restChecklist: { hydration: true, mobility: false, zone1: false, sleep: false },
    });
    expect(rows(sessionsCsv({ sessions: [rest] }))[1]![10]).toBe('yes');
    expect(rows(sessionsCsv({ sessions: [day('2026-01-09')] }))[1]![10]).toBe('no');
  });

  // A rest day you went climbing on is not a rest day, which is the rule
  // every other reading of a session uses.
  it('does not call a day rest because the checklist is on it', () => {
    const climbed = day('2026-01-09', {
      restChecklist: { hydration: true, mobility: false, zone1: false, sleep: false },
      climbs: [climb('V4')],
    });
    expect(rows(sessionsCsv({ sessions: [climbed] }))[1]![10]).toBe('no');
  });
});

describe('every burn on a project', () => {
  const project = { id: 'p1', name: 'The Wheel of Life', grade: 'V15' } as Project;
  const log = [
    day('2026-01-09', {
      projectAttempts: [
        { id: 'a1', projectId: 'p1', outcome: 'fell-high', highPoint: 80, count: 3 },
        { id: 'a2', projectId: 'p1', outcome: 'fell-crux', from: 30, highPoint: 55, count: 1, note: 'pumped' },
      ],
    }),
  ];

  it('names the project rather than keying it', () => {
    const out = rows(attemptsCsv(log, [project]));
    expect(out[1]!.slice(1, 3)).toEqual(['The Wheel of Life', 'V15']);
  });

  // Absent means the ground for every burn but `worked` (M102). Writing a
  // zero would be the export claiming something the record never said.
  it('leaves an unstated start unstated', () => {
    const out = rows(attemptsCsv(log, [project]));
    expect(out[1]![4]).toBe('');
    expect(out[2]![4]).toBe('30');
  });

  it('falls back to the id for a project that is gone', () => {
    expect(rows(attemptsCsv(log, []))[1]![1]).toBe('p1');
  });

  it('writes nothing but a header where nothing was projected', () => {
    expect(rows(attemptsCsv([day('2026-01-09')], []))).toHaveLength(1);
  });
});

describe('every benchmark reading', () => {
  const entries: MetricEntry[] = [
    { metricId: 'max_hang_20mm_7s', date: '2026-02-01', value: 40, note: 'half crimp' },
    { metricId: 'max_pullups', date: '2026-01-01', value: 12 },
  ];

  it('comes back oldest first', () => {
    expect(rows(metricsCsv(entries)).slice(1).map((r) => r[0])).toEqual(['2026-01-01', '2026-02-01']);
  });

  // "20" is not an answer. Twenty of what is.
  it('carries the unit beside the number', () => {
    const out = rows(metricsCsv(entries));
    expect(out[0]).toContain('Unit');
    expect(out[2]![2]).toBe('40');
    expect(out[2]![3]).not.toBe('');
  });

  it('writes the metric the climber knows it by', () => {
    expect(rows(metricsCsv(entries))[1]![1]).toBe(METRICS.max_pullups!.label);
  });

  it('falls back to the id for a metric the app no longer ships', () => {
    const gone = [{ metricId: 'gone_metric', date: '2026-01-01', value: 1 } as unknown as MetricEntry];
    expect(rows(metricsCsv(gone))[1]![1]).toBe('gone_metric');
  });
});
