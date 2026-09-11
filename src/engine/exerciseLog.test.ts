import { describe, expect, it } from 'vitest';
import { newSession, type LoggedExercise, type Session } from '@/db/sessions';
import {
  describeChange,
  describeEntry,
  describeLoad,
  exerciseKey,
  exerciseMovement,
  exerciseSeries,
  hasNumbers,
  lastLogged,
} from './exerciseLog';

/**
 * What you actually lifted (PLAN.md M98).
 *
 * The fixture is the case the milestone exists for: Iron Grip's Hammer
 * phase, whose stated goal is "Progress added load weekly" and whose
 * prescription is one static string for four weeks.
 */

function logged(date: string, exercises: LoggedExercise[], patch: Partial<Session> = {}): Session {
  return { ...newSession(date, 0, { completed: true, ...patch }), exercises };
}

const HANG = 'Max Hangs';

/** Four weeks of hangs, adding 5lb a week, plus noise around them. */
const BLOCK: Session[] = [
  logged('2026-02-02', [{ name: HANG, sets: 5, hold: 10, load: 20 }]),
  logged('2026-02-09', [{ name: HANG, sets: 5, hold: 10, load: 25 }]),
  logged('2026-02-16', [{ name: HANG, sets: 5, hold: 10, load: 30 }]),
  logged('2026-02-23', [{ name: HANG, sets: 5, hold: 10, load: 35 }]),
];

describe('a reading, versus a tick', () => {
  it('counts any one number as a reading', () => {
    expect(hasNumbers({ name: HANG, sets: 3 })).toBe(true);
    expect(hasNumbers({ name: HANG, load: 0 })).toBe(true);
    expect(hasNumbers({ name: HANG, hold: 7 })).toBe(true);
    expect(hasNumbers({ name: HANG, reps: 5 })).toBe(true);
  });

  // The whole of what `completedExercises` could say. It is not a number.
  it('does not count a bare tick, nor a note', () => {
    expect(hasNumbers({ name: HANG })).toBe(false);
    expect(hasNumbers({ name: HANG, note: 'felt heavy' })).toBe(false);
  });

  it('leaves ticks out of the series', () => {
    const series = exerciseSeries([...BLOCK, logged('2026-03-02', [{ name: HANG }])], HANG);
    expect(series).toHaveLength(4);
  });
});

describe('one exercise, over time', () => {
  it('reads the series oldest first', () => {
    expect(exerciseSeries(BLOCK, HANG).map((p) => p.entry.load)).toEqual([20, 25, 30, 35]);
  });

  it('matches on case and spacing, so one exercise is one line', () => {
    const odd = logged('2026-03-02', [{ name: '  max   hangs ', load: 40 }]);
    expect(exerciseSeries([...BLOCK, odd], HANG).map((p) => p.entry.load)).toEqual([20, 25, 30, 35, 40]);
    expect(exerciseKey(' Max  Hangs ')).toBe('max hangs');
  });

  it('ignores another exercise entirely', () => {
    const other = logged('2026-03-02', [{ name: 'Weighted Pull-Ups', load: 40 }]);
    expect(exerciseSeries([...BLOCK, other], HANG)).toHaveLength(4);
  });

  // An uncompleted session is a plan, not a record of what was lifted.
  it('ignores a session that was never completed', () => {
    const draft = logged('2026-03-02', [{ name: HANG, load: 99 }], { completed: false });
    expect(exerciseSeries([...BLOCK, draft], HANG)).toHaveLength(4);
  });

  it('orders two sessions on one day by their id', () => {
    const first = { ...newSession('2026-03-02', 0, { completed: true }), exercises: [{ name: HANG, load: 1 }] };
    const second = { ...newSession('2026-03-02', 1, { completed: true }), exercises: [{ name: HANG, load: 2 }] };
    expect(exerciseSeries([second, first], HANG).map((p) => p.entry.load)).toEqual([1, 2]);
  });
});

describe('last time', () => {
  it('finds the newest earlier reading', () => {
    expect(lastLogged(BLOCK, HANG, '2026-03-02')?.entry.load).toBe(35);
  });

  // The logger asks this while editing today's session, and today's own
  // half-filled row is not "last time".
  it('excludes the day being asked about', () => {
    expect(lastLogged(BLOCK, HANG, '2026-02-23')?.entry.load).toBe(30);
    expect(lastLogged(BLOCK, HANG, '2026-02-02')).toBeNull();
  });

  it('is null on an exercise with no history', () => {
    expect(lastLogged(BLOCK, 'Front Levers', '2026-03-02')).toBeNull();
  });

  it('skips a tick to reach the last real reading', () => {
    const ticked = logged('2026-03-01', [{ name: HANG }]);
    expect(lastLogged([...BLOCK, ticked], HANG, '2026-03-02')?.entry.load).toBe(35);
  });
});

describe('saying a reading out loud', () => {
  it('writes sets against reps', () => {
    expect(describeEntry({ name: 'Pull-Ups', sets: 3, reps: 8 }, 'imperial')).toBe('3 × 8');
  });

  it('writes sets against a hold', () => {
    expect(describeEntry({ name: HANG, sets: 5, hold: 10 }, 'imperial')).toBe('5 × 10s');
  });

  it('keeps a hold that does not fit the sets slot', () => {
    expect(describeEntry({ name: HANG, sets: 5, reps: 3, hold: 7 }, 'imperial')).toBe('5 × 3 (7s hold)');
  });

  it('handles one number on its own, and its plural', () => {
    expect(describeEntry({ name: HANG, sets: 1 }, 'imperial')).toBe('1 set');
    expect(describeEntry({ name: HANG, sets: 4 }, 'imperial')).toBe('4 sets');
    expect(describeEntry({ name: HANG, reps: 1 }, 'imperial')).toBe('1 rep');
    expect(describeEntry({ name: HANG, hold: 12 }, 'imperial')).toBe('12s');
  });

  it('is empty for a tick, so a caller can use the emptiness', () => {
    expect(describeEntry({ name: HANG }, 'imperial')).toBe('');
  });

  it('adds the load in the unit the climber reads', () => {
    expect(describeEntry({ name: HANG, sets: 5, hold: 10, load: 20 }, 'imperial')).toBe('5 × 10s at +20 lbs');
    expect(describeEntry({ name: HANG, sets: 5, hold: 10, load: 20 }, 'metric')).toBe('5 × 10s at +9.1 kg');
  });

  // Zero is a real answer and a different one from absent.
  it('calls a load of zero bodyweight', () => {
    expect(describeLoad(0, 'imperial')).toBe('bodyweight');
    expect(describeEntry({ name: 'Pull-Ups', reps: 8, load: 0 }, 'imperial')).toBe('8 reps at bodyweight');
  });

  it('says weight taken off with a minus, not a smaller plus', () => {
    expect(describeLoad(-20, 'imperial')).toBe('−20 lbs');
    expect(describeLoad(-20, 'metric')).toBe('−9.1 kg');
  });
});

describe('what moved across a block', () => {
  const moved = exerciseMovement(BLOCK, '2026-02-01', '2026-02-28');

  it('reports the dimension that changed', () => {
    expect(moved).toHaveLength(1);
    expect(moved[0]!.name).toBe(HANG);
    expect(moved[0]!.changed).toEqual([{ dimension: 'load', from: 20, to: 35 }]);
    expect(moved[0]!.readings).toBe(4);
  });

  // Sets and hold were identical all block. Reporting "sets 5 → 5" beside
  // the load that actually moved is noise dressed as a finding.
  it('says nothing about the dimensions that held still', () => {
    expect(moved[0]!.changed.map((c) => c.dimension)).not.toContain('sets');
    expect(moved[0]!.changed.map((c) => c.dimension)).not.toContain('hold');
  });

  it('leaves out an exercise logged only once', () => {
    const once = [...BLOCK, logged('2026-02-10', [{ name: 'Front Levers', hold: 8 }])];
    expect(exerciseMovement(once, '2026-02-01', '2026-02-28').map((m) => m.name)).toEqual([HANG]);
  });

  it('leaves out an exercise that did not move', () => {
    const flat = [
      logged('2026-02-03', [{ name: 'Rows', sets: 3, reps: 10 }]),
      logged('2026-02-10', [{ name: 'Rows', sets: 3, reps: 10 }]),
    ];
    expect(exerciseMovement(flat, '2026-02-01', '2026-02-28')).toEqual([]);
  });

  // Logging sets one week and load the next is two things measured, not a
  // change in either.
  it('does not compare a dimension missing from one end', () => {
    const partial = [
      logged('2026-02-03', [{ name: 'Rows', sets: 3 }]),
      logged('2026-02-10', [{ name: 'Rows', reps: 10 }]),
    ];
    expect(exerciseMovement(partial, '2026-02-01', '2026-02-28')).toEqual([]);
  });

  it('respects the window at both ends', () => {
    expect(exerciseMovement(BLOCK, '2026-02-09', '2026-02-16')[0]!.changed).toEqual([
      { dimension: 'load', from: 25, to: 30 },
    ]);
    expect(exerciseMovement(BLOCK, '2026-03-01', '2026-03-31')).toEqual([]);
  });

  it('ignores sessions that were never completed', () => {
    const drafts = [
      logged('2026-02-03', [{ name: 'Rows', reps: 5 }], { completed: false }),
      logged('2026-02-10', [{ name: 'Rows', reps: 9 }], { completed: false }),
    ];
    expect(exerciseMovement(drafts, '2026-02-01', '2026-02-28')).toEqual([]);
  });

  it('leads with the exercise logged most often', () => {
    const mixed = [
      ...BLOCK,
      logged('2026-02-05', [{ name: 'Rows', reps: 8 }]),
      logged('2026-02-12', [{ name: 'Rows', reps: 10 }]),
    ];
    expect(exerciseMovement(mixed, '2026-02-01', '2026-02-28').map((m) => m.name)).toEqual([HANG, 'Rows']);
  });

  // The spelling a climber typed most recently, not whichever one the first
  // session of the block happened to carry.
  it('names the row by its newest spelling', () => {
    const drift = [
      logged('2026-02-03', [{ name: 'max hangs', load: 20 }]),
      logged('2026-02-10', [{ name: 'Max Hangs', load: 25 }]),
    ];
    expect(exerciseMovement(drift, '2026-02-01', '2026-02-28')[0]!.name).toBe('Max Hangs');
  });

  it('reports more than one moving dimension on the same line', () => {
    const both = [
      logged('2026-02-03', [{ name: 'Pull-Ups', sets: 3, reps: 5 }]),
      logged('2026-02-10', [{ name: 'Pull-Ups', sets: 4, reps: 8 }]),
    ];
    expect(exerciseMovement(both, '2026-02-01', '2026-02-28')[0]!.changed).toEqual([
      { dimension: 'sets', from: 3, to: 4 },
      { dimension: 'reps', from: 5, to: 8 },
    ]);
  });
});

describe('a change, said out loud', () => {
  it('writes a load change in the climber\'s unit', () => {
    expect(describeChange({ dimension: 'load', from: 20, to: 35 }, 'imperial')).toBe('load +20 lbs → +35 lbs');
    expect(describeChange({ dimension: 'load', from: 20, to: 35 }, 'metric')).toBe('load +9.1 kg → +15.9 kg');
  });

  it('writes a hold in seconds and a count bare', () => {
    expect(describeChange({ dimension: 'hold', from: 7, to: 10 }, 'imperial')).toBe('hold 7s → 10s');
    expect(describeChange({ dimension: 'reps', from: 5, to: 8 }, 'imperial')).toBe('reps 5 → 8');
    expect(describeChange({ dimension: 'sets', from: 3, to: 4 }, 'imperial')).toBe('sets 3 → 4');
  });

  // Never "better". An exercise line declares no `higherIsBetter`, and more
  // reps at less load might be a deload, a phase change or a bad day.
  it('never calls a change better or worse', () => {
    const words = [
      describeChange({ dimension: 'load', from: 35, to: 20 }, 'imperial'),
      describeChange({ dimension: 'reps', from: 8, to: 5 }, 'imperial'),
    ].join(' ');
    expect(words).not.toMatch(/better|worse|improve|dropp|gain|lost/i);
  });
});
