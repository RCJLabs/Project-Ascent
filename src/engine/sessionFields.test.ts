import { describe, expect, it } from 'vitest';
import type { Climb, Session } from '@/db/sessions';
import { addDays } from './dates';
import {
  ENOUGH_POINTS,
  FIELD_DAYS,
  fieldSeries,
  gradeDisagreements,
  hardestLogged,
} from './sessionFields';

/**
 * The logger's own answers, read back (PLAN.md M88).
 *
 * M70 rendered the inputs; nothing ever read one. These hold both halves of
 * the fix — the quantities as a series, and the two grade fields that were
 * never a missing reading but a duplicate one.
 */

const TO = '2026-09-10';

const climb = (grade: string, result: 'send' | 'attempt', scale: 'V' | 'YDS' = 'V'): Climb =>
  ({ id: `${grade}-${result}`, grade, scale, count: 1, result }) as Climb;

const session = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 6,
    durationMin: 60,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

const series = (sessions: Session[]) => fieldSeries({ sessions, to: TO });
const only = (sessions: Session[], id: string) => series(sessions).find((s) => s.spec.id === id);

describe('the quantities, as a series', () => {
  it('collects a number field across sessions, oldest first', () => {
    const found = only(
      [
        session('2026-09-01', { fields: { sessionVolume: 20 } }),
        session('2026-08-01', { fields: { sessionVolume: 12 } }),
      ],
      'sessionVolume',
    )!;
    expect(found.points.map((p) => p.value)).toEqual([12, 20]);
    expect(found.points[0]!.date).toBe('2026-08-01');
  });

  it('collects a scale field too', () => {
    expect(only([session('2026-09-01', { fields: { pumpLevel: 8 } })], 'pumpLevel')!.points).toHaveLength(1);
  });

  it('leaves the text fields alone', () => {
    // A note is not a reading. `highPoint` and `location` are prose.
    const rows = series([session('2026-09-01', { fields: { highPoint: 'the third bolt', location: 'The Works' } })]);
    expect(rows).toEqual([]);
  });

  it('leaves a text field alone even when the answer is a number', () => {
    // The case that separates the kind check from the "is it finite"
    // check: "12" for the twelfth bolt is a note, not a quantity, and
    // both fixtures above are non-numeric so the finite guard was doing
    // all the work.
    expect(series([session('2026-09-01', { fields: { highPoint: '12' } })])).toEqual([]);
    expect(series([session('2026-09-01', { fields: { location: '5' } })])).toEqual([]);
  });

  it('leaves the grade fields alone, which are a different problem', () => {
    expect(series([session('2026-09-01', { fields: { hardestGradeSent: 'V5' } })])).toEqual([]);
  });

  it('reports the range and the mean', () => {
    const found = only(
      [
        session('2026-09-01', { fields: { sessionVolume: 10 } }),
        session('2026-09-02', { fields: { sessionVolume: 20 } }),
        session('2026-09-03', { fields: { sessionVolume: 30 } }),
      ],
      'sessionVolume',
    )!;
    expect([found.min, found.max, found.mean]).toEqual([10, 30, 20]);
  });

  it('says whether there is enough to read a direction from', () => {
    const few = Array.from({ length: ENOUGH_POINTS - 1 }, (_, i) =>
      session(addDays(TO, -i), { fields: { sessionVolume: 10 } }),
    );
    expect(only(few, 'sessionVolume')!.solid).toBe(false);
    expect(only([...few, session('2026-08-01', { fields: { sessionVolume: 10 } })], 'sessionVolume')!.solid).toBe(true);
  });

  it('puts the field with the most answers first', () => {
    const rows = series([
      session('2026-09-01', { fields: { sessionVolume: 10, pumpLevel: 5 } }),
      session('2026-09-02', { fields: { sessionVolume: 12 } }),
      session('2026-09-03', { fields: { sessionVolume: 14 } }),
    ]);
    expect(rows.map((r) => r.spec.id)).toEqual(['sessionVolume', 'pumpLevel']);
  });

  it('ignores a draft, and anything outside the window', () => {
    const rows = series([
      session('2026-09-01', { fields: { sessionVolume: 10 }, completed: false }),
      session(addDays(TO, -FIELD_DAYS), { fields: { sessionVolume: 10 } }),
      session(addDays(TO, 1), { fields: { sessionVolume: 10 } }),
    ]);
    expect(rows).toEqual([]);
  });

  it('keeps a session on the first day of the window', () => {
    expect(only([session(addDays(TO, -(FIELD_DAYS - 1)), { fields: { sessionVolume: 9 } })], 'sessionVolume')).toBeDefined();
  });

  it('survives a value a backup left as a string', () => {
    const found = only([session('2026-09-01', { fields: { sessionVolume: '14' as never } })], 'sessionVolume')!;
    expect(found.points[0]!.value).toBe(14);
  });

  it('drops a value that is not a number at all', () => {
    expect(only([session('2026-09-01', { fields: { sessionVolume: 'lots' as never } })], 'sessionVolume')).toBeUndefined();
  });

  it('ignores a field id the app no longer has', () => {
    expect(series([session('2026-09-01', { fields: { retired: 7 } as never })])).toEqual([]);
  });

  it('makes nothing from nothing', () => {
    expect(series([])).toEqual([]);
    expect(series([session('2026-09-01')])).toEqual([]);
  });
});

describe('the hardest a session actually logged', () => {
  it('finds the hardest send', () => {
    const s = session('2026-09-01', { climbs: [climb('V3', 'send'), climb('V5', 'send'), climb('V7', 'attempt')] });
    expect(hardestLogged(s, 'send')!.grade).toBe('V5');
  });

  it('counts an attempt as something touched', () => {
    const s = session('2026-09-01', { climbs: [climb('V3', 'send'), climb('V7', 'attempt')] });
    expect(hardestLogged(s, 'either')!.grade).toBe('V7');
  });

  it('has nothing to say about a session with no climbs', () => {
    expect(hardestLogged(session('2026-09-01'), 'send')).toBeNull();
  });

  it('does not order one ladder against the other', () => {
    // The route grade's ordinal has to be the *larger* number for this to
    // mean anything: with V7 against 5.10a the comparison happened to come
    // out right by accident and the guard was invisible.
    const s = session('2026-09-01', { climbs: [climb('V2', 'send'), climb('5.13a', 'send', 'YDS')] });
    expect(hardestLogged(s, 'send')).toMatchObject({ grade: 'V2', scale: 'V' });
  });

  it('skips a grade that is not on any ladder', () => {
    const s = session('2026-09-01', { climbs: [climb('V4', 'send'), climb('7c+', 'send')] });
    expect(hardestLogged(s, 'send')!.grade).toBe('V4');
  });

  it('has nothing to say about a session whose only grade is off the ladder', () => {
    // What an older export or another app's vocabulary leaves behind. With
    // a real grade beside it the comparison hid the guard.
    expect(hardestLogged(session('2026-09-01', { climbs: [climb('7c+', 'send')] }), 'send')).toBeNull();
  });
});

describe('when the typed grade and the log disagree', () => {
  const said = (fields: Record<string, string>, climbs: Climb[]) =>
    gradeDisagreements(session('2026-09-01', { fields: fields as never, climbs }));

  it('says nothing when they agree', () => {
    expect(said({ hardestGradeSent: 'V5' }, [climb('V5', 'send'), climb('V3', 'send')])).toEqual([]);
  });

  it('reports a typed grade harder than anything logged', () => {
    const found = said({ hardestGradeSent: 'V7' }, [climb('V5', 'send')]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ said: 'V7', logged: 'V5', steps: 2 });
  });

  it('reports one easier than the log too', () => {
    // Both directions: forgetting to update the answer is as likely as
    // over-claiming, and the app has no business guessing which happened.
    expect(said({ hardestGradeSent: 'V3' }, [climb('V5', 'send')])[0]!.steps).toBe(-2);
  });

  it('checks attempts against everything touched, not only sends', () => {
    expect(said({ hardestGradeAttempted: 'V7' }, [climb('V7', 'attempt')])).toEqual([]);
    expect(said({ hardestGradeAttempted: 'V9' }, [climb('V7', 'attempt')])[0]!.logged).toBe('V7');
  });

  it('says nothing when the session logged no climbs', () => {
    // A session typed as a note is not a contradiction.
    expect(said({ hardestGradeSent: 'V7' }, [])).toEqual([]);
  });

  it('says nothing about an unanswered field', () => {
    // Blank included: `canonicalGrade` places nothing for it, which is why
    // there is no separate check for it in the code.
    expect(said({}, [climb('V5', 'send')])).toEqual([]);
    expect(said({ hardestGradeSent: '  ' }, [climb('V5', 'send')])).toEqual([]);
    expect(said({ hardestGradeSent: '' }, [climb('V5', 'send')])).toEqual([]);
  });

  it('says nothing about an answer that is not a grade', () => {
    expect(said({ hardestGradeSent: 'hard' }, [climb('V5', 'send')])).toEqual([]);
  });

  it('does not compare a boulder answer against a route log', () => {
    expect(said({ hardestGradeSent: 'V5' }, [climb('5.12a', 'send', 'YDS')])).toEqual([]);
  });

  it('reports both fields when both disagree', () => {
    const found = said(
      { hardestGradeSent: 'V7', hardestGradeAttempted: 'V9' },
      [climb('V5', 'send'), climb('V6', 'attempt')],
    );
    expect(found.map((d) => d.spec.id)).toEqual(['hardestGradeSent', 'hardestGradeAttempted']);
  });
});
