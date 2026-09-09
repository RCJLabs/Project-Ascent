import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import type { PersonalRecord } from './derive';
import {
  availableYears,
  changes,
  describeYear,
  monthName,
  reviewRange,
  reviewYear,
  totalsFor,
} from './yearReview';

function session(date: string, patch: Partial<Session> = {}): Session {
  return {
    id: `${date}#0`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    climbs: [],
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
    ...patch,
  };
}

/** One session on the `n`th of each listed month. */
function monthly(year: number, months: number[], patch: Partial<Session> = {}): Session[] {
  return months.map((m) => session(`${year}-${String(m).padStart(2, '0')}-10`, patch));
}

const NO_RECORDS: PersonalRecord[] = [];

describe('availableYears', () => {
  it('lists only years with completed sessions, newest first', () => {
    const sessions = [
      session('2024-05-01'),
      session('2026-01-01'),
      session('2025-01-01', { completed: false }),
    ];
    expect(availableYears(sessions)).toEqual([2026, 2024]);
  });
});

describe('totalsFor', () => {
  it('sums only what falls inside the range', () => {
    const sessions = [
      session('2025-12-31', { durationMin: 60 }),
      session('2026-01-01', { durationMin: 90 }),
      session('2026-06-01', { durationMin: 30 }),
      session('2027-01-01', { durationMin: 120 }),
    ];
    const totals = totalsFor(sessions, '2026-01-01', '2026-12-31');
    expect(totals.sessions).toBe(2);
    expect(totals.hours).toBe(2);
  });

  it('counts a day outdoors once however many sessions it holds', () => {
    const sessions = [
      session('2026-03-01', { mode: 'outdoor' }),
      session('2026-03-01', { mode: 'outdoor', id: '2026-03-01#1' }),
    ];
    expect(totalsFor(sessions, '2026-01-01', '2026-12-31').outdoorDays).toBe(1);
  });

  it('splits sends by scale', () => {
    const sessions = [
      session('2026-03-01', {
        climbs: [
          { id: 'a', grade: 'V4', scale: 'V', count: 3, result: 'send' },
          { id: 'b', grade: '5.11a', scale: 'YDS', count: 2, result: 'send' },
          { id: 'c', grade: 'V6', scale: 'V', count: 5, result: 'attempt' },
        ],
      }),
    ];
    const totals = totalsFor(sessions, '2026-01-01', '2026-12-31');
    expect(totals.boulderSends).toBe(3);
    expect(totals.routeSends).toBe(2);
    expect(totals.sends).toBe(5);
  });
});

describe('reviewRange', () => {
  it('finds the busiest month', () => {
    const sessions = [
      ...monthly(2026, [1, 2]),
      session('2026-03-01'),
      session('2026-03-05'),
      session('2026-03-09'),
    ];
    const review = reviewRange(
      { sessions, records: NO_RECORDS, today: '2026-12-31' },
      '2026-01-01',
      '2026-12-31',
    );
    expect(review.busiest?.month).toBe('2026-03');
    expect(review.busiest?.sessions).toBe(3);
  });

  it('reports the hardest send of each kind inside the range', () => {
    const records: PersonalRecord[] = [
      { scale: 'V', grade: 'V4', date: '2025-11-01' },
      { scale: 'V', grade: 'V6', date: '2026-04-01' },
      { scale: 'V', grade: 'V5', date: '2026-02-01' },
      { scale: 'YDS', grade: '5.11c', date: '2026-07-01' },
    ];
    const review = reviewRange(
      { sessions: monthly(2026, [1]), records, today: '2026-12-31' },
      '2026-01-01',
      '2026-12-31',
    );
    expect(review.hardestBoulder?.grade).toBe('V6');
    expect(review.hardestRoute?.grade).toBe('5.11c');
  });

  it('anchors the longest gap at both ends of the range', () => {
    // Nothing until October: a nine-month gap, not "no gap".
    const review = reviewRange(
      { sessions: [session('2026-10-01')], records: NO_RECORDS, today: '2026-12-31' },
      '2026-01-01',
      '2026-12-31',
    );
    expect(review.longestGap?.from).toBe('2026-01-01');
    expect(review.longestGap?.to).toBe('2026-10-01');
  });

  it('finds a gap between two logged days', () => {
    const sessions = [session('2026-01-05'), session('2026-01-08'), session('2026-04-01')];
    const review = reviewRange(
      { sessions, records: NO_RECORDS, today: '2026-04-02' },
      '2026-01-01',
      '2026-04-02',
    );
    expect(review.longestGap?.from).toBe('2026-01-08');
    expect(review.longestGap?.to).toBe('2026-04-01');
  });

  it('has no gap to report when nothing was logged', () => {
    const review = reviewRange(
      { sessions: [], records: NO_RECORDS, today: '2026-12-31' },
      '2026-01-01',
      '2026-12-31',
    );
    expect(review.longestGap).toBeNull();
    expect(review.busiest).toBeNull();
    expect(review.bestWeek).toBeNull();
  });

  it('finds the week with the most sessions', () => {
    const sessions = [
      session('2026-03-02'),
      session('2026-03-03'),
      session('2026-03-05'),
      session('2026-04-06'),
    ];
    const review = reviewRange(
      { sessions, records: NO_RECORDS, today: '2026-12-31' },
      '2026-01-01',
      '2026-12-31',
    );
    expect(review.bestWeek?.sessions).toBe(3);
  });
});

describe('reviewYear comparison', () => {
  it('compares a part-finished year with the same slice of the year before', () => {
    // 2025 was busy all year; 2026 has three months in it so far. Comparing
    // against the whole of 2025 would be comparing against the calendar.
    const sessions = [
      ...monthly(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      ...monthly(2026, [1, 2, 3]),
    ];
    const review = reviewYear({ sessions, records: NO_RECORDS, today: '2026-03-31' }, 2026);
    expect(review.complete).toBe(false);
    expect(review.totals.sessions).toBe(3);
    expect(review.previous?.sessions).toBe(3);
    expect(changes(review).find((c) => c.label === 'Sessions')?.delta).toBe(0);
  });

  it('compares a finished year with the whole of the year before', () => {
    const sessions = [...monthly(2025, [1, 2, 3, 4]), ...monthly(2026, [1, 2])];
    const review = reviewYear({ sessions, records: NO_RECORDS, today: '2027-06-01' }, 2026);
    expect(review.complete).toBe(true);
    expect(review.totals.sessions).toBe(2);
    expect(review.previous?.sessions).toBe(4);
  });

  it('has nothing to compare against in the first year', () => {
    const review = reviewYear(
      { sessions: monthly(2026, [1, 2]), records: NO_RECORDS, today: '2026-06-01' },
      2026,
    );
    expect(review.previous).toBeNull();
    expect(changes(review)).toEqual([]);
  });

  it('stops the range at today rather than the end of the year', () => {
    const review = reviewYear(
      { sessions: monthly(2026, [1]), records: NO_RECORDS, today: '2026-03-15' },
      2026,
    );
    expect(review.to).toBe('2026-03-15');
  });

  it('shows a decline as a decline', () => {
    const sessions = [...monthly(2025, [1, 2, 3, 4, 5, 6]), ...monthly(2026, [1, 2])];
    const review = reviewYear({ sessions, records: NO_RECORDS, today: '2027-01-01' }, 2026);
    const sessionsChange = changes(review).find((c) => c.label === 'Sessions');
    expect(sessionsChange?.delta).toBe(-4);
    expect(sessionsChange?.percent).toBe(-67);
  });

  it('does not divide by a year that had nothing in it', () => {
    const sessions = [session('2025-01-01'), ...monthly(2026, [1, 2])];
    const review = reviewYear({ sessions, records: NO_RECORDS, today: '2027-01-01' }, 2026);
    const rock = changes(review).find((c) => c.label === 'Days on rock');
    expect(rock?.then).toBe(0);
    expect(rock?.percent).toBeNull();
  });

  it('keeps the comparison in a fixed order rather than a flattering one', () => {
    const sessions = [...monthly(2025, [1, 2, 3]), ...monthly(2026, [1], { mode: 'outdoor' })];
    const review = reviewYear({ sessions, records: NO_RECORDS, today: '2027-01-01' }, 2026);
    expect(changes(review).map((c) => c.label)).toEqual([
      'Sessions',
      'Hours',
      'Sends',
      'Days on rock',
      'Height',
    ]);
  });
});

describe('describeYear', () => {
  it('says so plainly when there is nothing in it', () => {
    const review = reviewYear({ sessions: [], records: NO_RECORDS, today: '2027-01-01' }, 2026);
    expect(describeYear(review)).toEqual(['Nothing logged this year.']);
  });

  it('distinguishes a year with nothing yet from a year with nothing at all', () => {
    const review = reviewYear({ sessions: [], records: NO_RECORDS, today: '2026-03-01' }, 2026);
    expect(describeYear(review)[0]).toContain('yet');
  });

  it('states a decline without dressing it up', () => {
    const sessions = [...monthly(2025, [1, 2, 3, 4, 5, 6]), ...monthly(2026, [1, 2])];
    const review = reviewYear({ sessions, records: NO_RECORDS, today: '2027-01-01' }, 2026);
    const lines = describeYear(review).join(' ');
    expect(lines).toContain('4 fewer');
    expect(lines).not.toMatch(/great|amazing|crushed|keep it up|proud/i);
  });

  it('mentions a long quiet stretch but not a short one', () => {
    const long = reviewYear(
      { sessions: [session('2026-01-01'), session('2026-06-01')], records: NO_RECORDS, today: '2027-01-01' },
      2026,
    );
    expect(describeYear(long).join(' ')).toContain('quiet stretch');

    const dense = reviewYear(
      { sessions: monthly(2026, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), records: NO_RECORDS, today: '2027-01-01' },
      2026,
    );
    // Monthly sessions leave ~30-day gaps, so this one should be mentioned;
    // a fortnight's rest should not.
    const tight = reviewYear(
      {
        sessions: [session('2026-01-01'), session('2026-01-10'), session('2026-01-20')],
        records: NO_RECORDS,
        today: '2026-01-21',
      },
      2026,
    );
    expect(describeYear(dense).join(' ')).toContain('quiet stretch');
    expect(describeYear(tight).join(' ')).not.toContain('quiet stretch');
  });

  it('makes no prediction about the rest of the year', () => {
    const sessions = [...monthly(2025, [1, 2, 3]), ...monthly(2026, [1, 2])];
    const review = reviewYear({ sessions, records: NO_RECORDS, today: '2026-03-01' }, 2026);
    const lines = describeYear(review).join(' ');
    expect(lines).not.toMatch(/on track|on pace|projected|will (?:reach|hit|end)/i);
  });
});

describe('monthName', () => {
  it('names a month key', () => {
    expect(monthName('2026-03')).toBe('March');
    expect(monthName('2026-12')).toBe('December');
  });
});

describe('month bars', () => {
  it('keeps the empty months so the chart is not misleading', () => {
    const review = reviewYear(
      { sessions: [session('2026-01-05'), session('2026-07-05')], records: NO_RECORDS, today: '2027-01-01' },
      2026,
    );
    expect(review.months).toHaveLength(12);
    expect(review.months.map((m) => m.sessions)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
  });

  it('stops at the current month in a running year', () => {
    const review = reviewYear(
      { sessions: [session('2026-01-05')], records: NO_RECORDS, today: '2026-03-15' },
      2026,
    );
    expect(review.months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('never names an empty month as the busiest one', () => {
    const review = reviewYear(
      { sessions: [session('2026-07-05')], records: NO_RECORDS, today: '2027-01-01' },
      2026,
    );
    expect(review.busiest?.month).toBe('2026-07');
  });
});

describe('describeYear dates', () => {
  it('names months rather than printing date keys', () => {
    const review = reviewYear(
      { sessions: [session('2026-01-01'), session('2026-06-01')], records: NO_RECORDS, today: '2027-01-01' },
      2026,
    );
    // The trailing gap (June to the end of the year) is the longer one.
    const line = describeYear(review).find((l) => l.includes('quiet stretch'));
    expect(line).toContain('June');
    expect(line).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
