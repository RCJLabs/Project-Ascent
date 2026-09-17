import { describe, expect, it } from 'vitest';
import type { RestChecklist, Session } from '@/db/sessions';
import { compareBlocks, describeBlocks } from './blockCompare';
import { addDays } from './dates';
import { deriveClimberState } from './derive';
import { diagnose, RULES } from './plateau';
import { reviewRange, totalsFor } from './yearReview';

/**
 * A rest day is not a session (PLAN.md M246).
 *
 * `isRestSession` has been the one definition since M112e, and `derive.ts`
 * calls it on the first line of its loop — then counts every completed
 * record as a session anyway, because `nonRest` was tallied and dropped at
 * the return. Three numbers a climber reads on Progress were the total,
 * rest days included, and the whole existing suite passed without pinning
 * one of them.
 */

const TODAY = '2026-09-17';
const CHECKLIST: RestChecklist = { hydration: true, mobility: true, zone1: false, sleep: true };

const train = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 6,
    durationMin: 60,
    climbs: [{ id: `c${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send' }],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

/** A rest day with an hour of mobility on it, which is the awkward case. */
const rest = (date: string): Session =>
  train(date, { climbs: [], restChecklist: CHECKLIST, durationMin: 60, rpe: undefined });

/** Twenty rest days and two sessions: the measured fixture. */
const RESTING = [
  ...Array.from({ length: 20 }, (_, i) => rest(addDays(TODAY, -2 - i * 3))),
  train(addDays(TODAY, -4)),
  train(addDays(TODAY, -10)),
];

const state = (sessions: Session[]) => deriveClimberState(sessions, { today: TODAY });

describe('what the climber state counts', () => {
  it('keeps every record in the total and the training in its own number', () => {
    const s = state(RESTING);
    expect(s.completedSessions, 'records, for the callers that want records').toBe(22);
    expect(s.restSessions).toBe(20);
    expect(s.trainingSessions, 'of those, the ones that were training').toBe(2);
    expect(s.trainingSessions + s.restSessions).toBe(s.completedSessions);
  });

  it('counts only training in the last thirty days', () => {
    // Ten rest days fall inside the window and two sessions do.
    expect(state(RESTING).recentSessions).toBe(2);
  });
});

describe('the training state that could not be read', () => {
  const diagnosisOf = (sessions: Session[]) =>
    diagnose({ state: state(sessions), sessions, injuries: [], today: TODAY });

  /**
   * The measured symptom. The gate is an *or*, history was the half that was
   * short, and the evidence printed both counters — so a climber saw
   * **"Sessions logged | 22 of 8"**, a requirement met, shown as the reason
   * it was not.
   */
  it('never reports more than the requirement it is asking for', () => {
    const d = diagnosisOf(RESTING);
    expect(d.verdict).toBe('insufficient-data');
    for (const row of d.evidence) {
      const [have, want] = (row.value.match(/^(\d+) of (\d+)/) ?? []).slice(1).map(Number);
      if (have === undefined || want === undefined) continue;
      expect(have, `${row.label} reads "${row.value}"`).toBeLessThan(want);
    }
  });

  it('counts rest days out of the sessions it is waiting for', () => {
    const row = diagnosisOf(RESTING).evidence.find((e) => e.label === 'Sessions logged');
    expect(row?.value).toBe(`2 of ${RULES.minSessions}`);
  });

  /** And drops the counter entirely once that half is satisfied. */
  it('names only what is still missing', () => {
    // Enough training sessions, but not enough days behind them. Every
    // other day rather than consecutively, so the run does not trip the
    // recovery check that is read before this one.
    const short = Array.from({ length: RULES.minSessions }, (_, i) =>
      train(addDays(TODAY, -i * 2)),
    );
    const d = diagnosisOf(short);
    expect(d.verdict).toBe('insufficient-data');
    expect(d.evidence.map((e) => e.label)).toEqual(['History']);
  });
});

describe('the totals behind the four-week comparison', () => {
  it('puts a rest day in the rest-day count and nowhere else', () => {
    const totals = totalsFor(RESTING, addDays(TODAY, -27), TODAY);
    expect(totals.restDays).toBe(9);
    expect(totals.sessions, 'two sessions, not eleven').toBe(2);
    // The hour of mobility on each rest day is not nine hours of training.
    expect(totals.hours).toBe(2);
    expect(totals.sessions + totals.restDays).toBe(11);
  });

  /**
   * The table used to read "Sessions 11 · Hours 2h · Sends 6" in one column,
   * which is the same contradiction M245 found in the check-in card: a
   * number that disagrees with the number beside it.
   */
  it('does not describe a month of rest as a month of sessions', () => {
    const compare = compareBlocks({ sessions: RESTING, to: TODAY });
    // Both windows hold nine rest days. The earlier one holds no training
    // at all, and used to report nine sessions, no hours and no sends.
    expect(compare.now.sessions).toBe(2);
    expect(compare.now.restDays).toBe(9);
    expect(compare.before?.sessions).toBe(0);
    expect(compare.before?.restDays).toBe(9);
    // Every row that moved is a row about training, and they agree: two
    // sessions, two hours, six sends against nothing.
    expect(compare.now.hours).toBe(2);
    expect(compare.now.sends).toBe(6);
    expect(describeBlocks(compare)).toBe('2 more sessions than the four weeks before.');
  });
});

describe('the year in review', () => {
  it('does not call a week of rest days your best week', () => {
    const sessions = [
      ...Array.from({ length: 5 }, (_, i) => rest(`2026-03-0${i + 2}`)),
      train('2026-04-06'),
      train('2026-04-07'),
    ];
    const review = reviewRange(
      { sessions, records: [], today: '2026-12-31' },
      '2026-01-01',
      '2026-12-31',
    );
    expect(review.bestWeek?.sessions).toBe(2);
    expect(review.busiest?.month).toBe('2026-04');
  });
});
