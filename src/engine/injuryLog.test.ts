import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import { badDays, describeInjuryHistory, injuryHistory } from './injuryLog';
import type { TissueFeel } from './readiness';

/**
 * How an injury has actually been (PLAN.md M103).
 *
 * `Injury` records where a part stands now and is overwritten every time it
 * is edited. Nothing held how it got there, so the question every physio
 * asks first had no answer in an app holding both the injury and every
 * session around it.
 */

const TO = '2026-09-30';
const SINCE = '2026-09-01';

function day(date: string, feel?: TissueFeel, patch: Partial<Session> = {}): Session {
  return newSession(date, 0, {
    completed: true,
    ...(feel === undefined ? {} : { checkIn: { fingers: 'good', sleep: 'good', parts: { elbow: feel } } }),
    ...patch,
  });
}

const read = (sessions: Session[]) => injuryHistory({ part: 'elbow', since: SINCE, sessions, to: TO });

describe('reading an injury back', () => {
  it('keeps only the days it was answered, oldest first', () => {
    const history = read([
      day('2026-09-10', 'sore'),
      day('2026-09-04', 'good'),
      day('2026-09-07'),
    ]);
    expect(history.days.map((d) => [d.date, d.feel])).toEqual([
      ['2026-09-04', 'good'],
      ['2026-09-10', 'sore'],
    ]);
  });

  // A question skipped is not a part that felt fine.
  it('does not read an unanswered day as a good one', () => {
    expect(read([day('2026-09-05')]).days).toEqual([]);
    expect(read([day('2026-09-05', 'good')]).fine).toBe(1);
  });

  it('ignores another part entirely', () => {
    const shoulder = newSession('2026-09-05', 0, {
      completed: true,
      checkIn: { fingers: 'good', sleep: 'good', parts: { shoulder: 'sore' } },
    });
    expect(read([shoulder]).days).toEqual([]);
  });

  it('respects the window at both ends', () => {
    expect(read([day('2026-08-20', 'sore'), day('2026-10-05', 'sore')]).days).toEqual([]);
  });

  // Two sessions on one day can each carry a check-in, and the later one is
  // the later word on the same part.
  it('takes the newest answer of a day', () => {
    const morning = day('2026-09-06', 'good');
    const evening: Session = {
      ...newSession('2026-09-06', 1, { completed: true }),
      checkIn: { fingers: 'good', sleep: 'good', parts: { elbow: 'sore' } },
    };
    expect(read([morning, evening]).days.map((d) => d.feel)).toEqual(['sore']);
  });

  it('counts the three answers', () => {
    const history = read([
      day('2026-09-02', 'good'),
      day('2026-09-04', 'tender'),
      day('2026-09-06', 'sore'),
      day('2026-09-08', 'sore'),
    ]);
    expect([history.fine, history.tender, history.worse]).toEqual([1, 1, 2]);
  });

  // A day carries a tone and a date and nothing else. What was around a day
  // is only named on the days it was worse, where `badDays` carries it.
  it('says nothing about what the day was', () => {
    const named = day('2026-09-05', 'sore', { sessionTypeId: 'fp' });
    expect(Object.keys(read([named]).days[0]!)).toEqual(['date', 'feel']);
  });
});

describe('saying how it has been', () => {
  // Coverage first: "worse three times" over thirty days means something
  // different from "worse three times" over four answers.
  it('states coverage before the counts', () => {
    const history = read([day('2026-09-02', 'good'), day('2026-09-05', 'sore')]);
    expect(describeInjuryHistory(history)).toBe(
      'Answered on 2 of the 30 days since you logged it: 1 worse, 1 fine.',
    );
  });

  it('leaves out an answer that never happened', () => {
    const history = read([day('2026-09-02', 'good')]);
    expect(describeInjuryHistory(history)).not.toMatch(/worse|niggly/);
  });

  it('says nothing at all with nothing answered', () => {
    expect(describeInjuryHistory(read([]))).toBeNull();
  });
});

describe('the days it was worse', () => {
  const week = [
    day('2026-09-03', 'good', { sessionTypeId: 'fp' }),
    // Answered about nothing, but named — so the day before 09-05 reads
    // differently from 09-05 itself, and the two cannot be swapped unseen.
    day('2026-09-04', undefined, { sessionTypeId: 'fp' }),
    day('2026-09-05', 'sore'),
    // Started and abandoned the day before a bad one. Not what you did.
    day('2026-09-08', undefined, { completed: false, sessionTypeId: 'perf' }),
    day('2026-09-09', 'sore', { sessionTypeId: 'perf' }),
  ];
  const nameOf = (id: string) => ({ fp: 'Finger Protocol', perf: 'Performance Day' })[id];

  it('lists only the bad days, newest first', () => {
    expect(badDays(read(week), week, nameOf).map((d) => d.date)).toEqual([
      '2026-09-09',
      '2026-09-05',
    ]);
  });

  /**
   * Around, not before. The check-in is taken *before* the session it sits
   * on, so an injury that flares during a session and one that flares the
   * morning after are different stories — and the app says which is which
   * rather than picking one.
   */
  it('carries the day before and the day itself, separately', () => {
    // 09-04 carries a session that was never answered about — the day still
    // happened, and what happened on it is the point.
    const bad = badDays(read(week), week, nameOf).find((d) => d.date === '2026-09-05')!;
    expect(bad.before).toEqual(['Finger Protocol']);
    expect(bad.after).toEqual(['Climbing session']);

    const later = badDays(read(week), week, nameOf).find((d) => d.date === '2026-09-09')!;
    expect(later.after).toEqual(['Performance Day']);
  });

  // A session you opened and walked away from is not a thing you did, and
  // putting it beside a bad day reads as if it were.
  it('leaves out a session that was never finished', () => {
    const later = badDays(read(week), week, nameOf).find((d) => d.date === '2026-09-09')!;
    expect(later.before).toEqual([]);
  });

  it('says what a day was from the session type, not a guess at its content', () => {
    const bad = badDays(read(week), week, nameOf).find((d) => d.date === '2026-09-05')!;
    expect(bad.before).toEqual(['Finger Protocol']);
  });

  it('falls back to the mode where the type has no name', () => {
    const outdoor = [day('2026-09-05', 'sore', { mode: 'outdoor' })];
    expect(badDays(read(outdoor), outdoor)[0]!.after).toEqual(['Outdoor day']);
  });

  it('calls a rest day a rest day', () => {
    const rest = [
      day('2026-09-04', undefined, {
        restChecklist: { hydration: true, mobility: false, zone1: false, sleep: true },
      }),
      day('2026-09-05', 'sore'),
    ];
    expect(badDays(read(rest), rest)[0]!.before).toEqual(['Rest day']);
  });

  // A rest day you went climbing on is not a rest day, which is the rule
  // every other reading of a session already uses.
  it('does not call a day rest because the checklist is on it', () => {
    const climbed = [
      day('2026-09-04', undefined, {
        restChecklist: { hydration: true, mobility: false, zone1: false, sleep: false },
        climbs: [{ id: 'c1', grade: 'V4', scale: 'V', count: 1, result: 'send' }],
      }),
      day('2026-09-05', 'sore'),
    ];
    expect(badDays(read(climbed), climbed)[0]!.before).toEqual(['Climbing session']);
  });

  it('names a day once however many sessions of it there were', () => {
    const twice = [
      day('2026-09-04'),
      { ...newSession('2026-09-04', 1, { completed: true }) },
      day('2026-09-05', 'sore'),
    ];
    expect(badDays(read(twice), twice)[0]!.before).toEqual(['Climbing session']);
  });

  it('is empty when it never got worse', () => {
    expect(badDays(read([day('2026-09-02', 'good')]), [])).toEqual([]);
  });

  // It reports what was logged, and computes no ratio from it: two counts
  // side by side are a causal claim however they are worded.
  it('computes no comparison', () => {
    const history = read(week);
    expect(Object.keys(history)).not.toContain('ratio');
    expect(describeInjuryHistory(history)).not.toMatch(/after|because|cause|otherwise/i);
  });
});
