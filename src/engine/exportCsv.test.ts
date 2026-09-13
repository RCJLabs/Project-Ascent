import { describe, expect, it } from 'vitest';
import { METRICS } from '@/content/metrics';
import type { MetricEntry } from '@/db/metrics';
import type { Project } from '@/db/projects';
import { newSession, type Session } from '@/db/sessions';
import { parseCsv } from './csv';
import { attemptsCsv, climbsCsv, exercisesCsv, metricsCsv, sessionsCsv } from './exportCsv';
import { guessColumns, guessKind, importCsv } from './importCsv';

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
      'Date', 'Discipline', 'Grade', 'Result', 'Count', 'Ascent style',
      // The three the logger asked for and the archive forgot (M133).
      'Name', 'Angle', 'Rope',
      'Mode', 'Place', 'Notes',
    ]);
  });

  it('carries what the climb itself said', () => {
    const out = rows(
      climbsCsv([
        day('2026-01-09', {
          climbs: [climb('5.12a', { name: 'The Crucifix', angle: 'overhang', ropeStyle: 'lead' })],
        }),
      ]),
    )[1]!;
    expect([out[6], out[7], out[8]]).toEqual(['The Crucifix', 'overhang', 'lead']);
  });

  it('leaves them blank where the climber did not say', () => {
    // Absent is not vertical and not a top-rope — it is unanswered, and an
    // archive that filled it in would be inventing history.
    const out = rows(climbsCsv([day('2026-01-09', { climbs: [climb('V4')] })]))[1]!;
    expect([out[6], out[7], out[8]]).toEqual(['', '', '']);
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
    expect(out[9]).toBe('indoor');
    expect(out[10]).toBe('The Works');
    expect(out[11]).toBe('good day');
  });

  it('says nothing where the session said nothing', () => {
    const bare = rows(climbsCsv([day('2026-01-09', { climbs: [climb('V4')] })]))[1]!;
    expect([bare[5], bare[10], bare[11]]).toEqual(['', '', '']);
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

  // The header guesser has to place every column this writer produces.
  it('is mapped by the guesser without a hand on it', () => {
    const header = parseCsv(climbsCsv(log))[0]!;
    expect(guessColumns(header)).toEqual([
      'date', 'discipline', 'grade', 'result', 'count',
      // Ascent style, Name, Angle and Rope. Written by M133 for a person
      // and a spreadsheet, skipped by the reader for four milestones, and
      // read back since M139 — which is why *Ascent style* is spelled that
      // way: `style` alone means a result in the files people already have.
      'style', 'name', 'angle', 'rope',
      'mode', 'place', 'notes',
    ]);
  });

  // What M133 added and M139 came back for: the round trip lost these four
  // columns on the way in, silently, and the file looked complete.
  it('brings back what the climb said about itself', () => {
    const table = parseCsv(
      climbsCsv([
        day('2026-01-09', {
          climbs: [
            climb('5.12a', {
              name: 'The Crucifix',
              angle: 'overhang',
              ropeStyle: 'lead',
              style: 'redpoint',
            }),
          ],
        }),
      ]),
    );
    const [header = [], ...body] = table;
    const out = importCsv({ rows: body, columns: guessColumns(header) });
    const back = out.sessions[0]!.climbs[0]!;
    expect([back.name, back.angle, back.ropeStyle, back.style]).toEqual([
      'The Crucifix', 'overhang', 'lead', 'redpoint',
    ]);
  });
});

/**
 * The other two round trips (PLAN.md M139).
 *
 * The archive has written these two files since M133 and nothing could
 * read either of them back, so "the same history, back out" was true of
 * one file in five. The property is the climbs one: a file this app writes
 * is a file this app can read, with no question asked about it.
 */
describe('the round trip of a gym log', () => {
  const log = [
    day('2026-01-09', {
      exercises: [
        { name: 'Max hang', sets: 5, reps: 1, hold: 10, load: 40, note: 'felt strong' },
        { name: 'Pull-up', sets: 4, reps: 6, load: 20 },
      ],
    } as never),
    day('2026-01-11', { exercises: [{ name: 'Max hang', sets: 5, hold: 10, load: 45 }] } as never),
  ];

  const back = () => {
    const [header = [], ...body] = parseCsv(exercisesCsv(log));
    return importCsv({ kind: guessKind(header), rows: body, columns: guessColumns(header, 'exercises') });
  };

  it('is recognised as a gym log from its header alone', () => {
    expect(guessKind(parseCsv(exercisesCsv(log))[0]!)).toBe('exercises');
  });

  it('is read back with nothing refused', () => {
    const out = back();
    expect(out.refused).toEqual([]);
    expect(out.sessions).toHaveLength(2);
    expect(out.exercises).toBe(3);
  });

  it('brings every number back as it went out', () => {
    expect(back().sessions[0]!.exercises).toEqual([
      { name: 'Max hang', sets: 5, reps: 1, hold: 10, load: 40, note: 'felt strong' },
      { name: 'Pull-up', sets: 4, reps: 6, load: 20 },
    ]);
  });

  // The exporter writes a blank rather than a zero, and the reader has to
  // leave it off rather than filling it in — a bodyweight hang is not a
  // zero-pound one.
  it('leaves out what the file left blank', () => {
    expect(back().sessions[1]!.exercises).toEqual([
      { name: 'Max hang', sets: 5, hold: 10, load: 45 },
    ]);
  });
});

describe('the round trip of a benchmark sheet', () => {
  const entries: MetricEntry[] = [
    { metricId: 'max_hang_20mm_7s', date: '2026-01-09', value: 40, note: 'two hands' },
    { metricId: 'max_pullups', date: '2026-01-11', value: 12 },
  ];

  const back = (units: 'metric' | 'imperial') => {
    const [header = [], ...body] = parseCsv(metricsCsv(entries));
    return importCsv({ kind: guessKind(header), rows: body, columns: guessColumns(header, 'benchmarks'), units });
  };

  it('is recognised as a benchmark sheet from its header alone', () => {
    expect(guessKind(parseCsv(metricsCsv(entries))[0]!)).toBe('benchmarks');
  });

  it('brings every reading back on the metric it went out on', () => {
    const out = back('imperial');
    expect(out.refused).toEqual([]);
    expect(out.metrics.map((m) => [m.metricId, m.date, m.value])).toEqual([
      ['max_hang_20mm_7s', '2026-01-09', 40],
      ['max_pullups', '2026-01-11', 12],
    ]);
  });

  /**
   * The reason the file's unit column overrides the climber's preference.
   * Values are stored imperial and the archive writes the stored unit, so
   * a climber who reads kilograms must not have their own 40 lb hang come
   * back as 40 kg — which is what reading it "the way they would type it"
   * would do.
   */
  it('comes back the same for a climber who reads in kilograms', () => {
    expect(back('metric').metrics.map((m) => m.value)).toEqual([40, 12]);
  });

  it('carries the note with it', () => {
    expect(back('imperial').metrics[0]!.note).toBe('two hands');
  });

  // A reading is not a session, so a sheet of them adds no training days.
  it('adds no day to the log', () => {
    expect(back('imperial').sessions).toEqual([]);
  });
});

describe('what the session itself said', () => {
  /**
   * The check-in and the field answers (PLAN.md M133).
   *
   * Both drive the app on the day — the check-in sets an RPE ceiling and
   * suggests a lighter dose, the answers are what a session type asked for —
   * and both vanished from an archive billed as "the same history, back
   * out".
   */
  it('carries the morning check-in', () => {
    const out = rows(
      sessionsCsv({
        sessions: [day('2026-01-09', { checkIn: { fingers: 'tender', sleep: 'short' } } as never)],
      }),
    )[1]!;
    expect([out[11], out[12]]).toEqual(['tender', 'short']);
  });

  it('leaves the check-in blank when it was skipped', () => {
    // A skipped check-in is not a good one, which is the rule the whole
    // readiness engine is built on.
    const out = rows(sessionsCsv({ sessions: [day('2026-01-09')] }))[1]!;
    expect([out[11], out[12]]).toEqual(['', '']);
  });

  it('writes the answers with the labels the climber read', () => {
    const out = rows(
      sessionsCsv({
        sessions: [day('2026-01-09', { fields: { location: 'Malham', pumpLevel: 4 } } as never)],
      }),
    )[1]!;
    expect(out[13]).toBe('Where: Malham; Pump: 4');
  });

  it('writes nothing for a session that answered nothing', () => {
    expect(rows(sessionsCsv({ sessions: [day('2026-01-09')] }))[1]![13]).toBe('');
  });

  it('leaves out a question that was opened and left blank', () => {
    // An empty string in the bag is a field the climber typed into and then
    // cleared, and `Where: ` in a spreadsheet is worse than no column.
    const out = rows(
      sessionsCsv({
        sessions: [day('2026-01-09', { fields: { location: '', pumpLevel: 4 } } as never)],
      }),
    )[1]!;
    expect(out[13]).toBe('Pump: 4');
  });
});

describe('every exercise, one per row', () => {
  const lifted = day('2026-01-09', {
    exercises: [
      { name: 'Max Hangs', sets: 5, hold: 10, load: 20 },
      { name: 'Pull-ups', sets: 3, reps: 8, note: 'slow' },
    ],
  } as never);

  it('writes a header a person can read', () => {
    expect(rows(exercisesCsv([lifted]))[0]).toEqual([
      'Date', 'Session', 'Exercise', 'Sets', 'Reps', 'Hold (s)', 'Load (lb)', 'Note',
    ]);
  });

  it('writes one row per exercise', () => {
    expect(rows(exercisesCsv([lifted])).slice(1).map((r) => r[2])).toEqual(['Max Hangs', 'Pull-ups']);
  });

  it('carries the numbers that were typed', () => {
    const out = rows(exercisesCsv([lifted]))[1]!;
    expect(out.slice(3, 7)).toEqual(['5', '', '10', '20']);
  });

  it('tells a zero apart from a blank', () => {
    // Zero load is bodyweight, which is a real answer and not an absent one.
    const out = rows(exercisesCsv([day('2026-01-09', { exercises: [{ name: 'Dips', load: 0 }] } as never)]))[1]!;
    expect(out[6]).toBe('0');
  });

  it('numbers the sessions within a day, like the sessions sheet', () => {
    const second = newSession('2026-01-09', 1, {
      completed: true,
      exercises: [{ name: 'Rows', sets: 3 }],
    } as never);
    expect(rows(exercisesCsv([lifted, second])).slice(1).map((r) => r[1])).toEqual(['1', '1', '2']);
  });

  it('writes nothing but a header for a log with no exercises', () => {
    expect(rows(exercisesCsv([day('2026-01-09')]))).toHaveLength(1);
  });

  it('survives a record whose exercises are not a list', () => {
    // The types are not wrong about what a `Session` should be; they are
    // wrong about what is on disk.
    expect(rows(exercisesCsv([day('2026-01-09', { exercises: 'broken' } as never)]))).toHaveLength(1);
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
