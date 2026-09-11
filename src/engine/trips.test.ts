import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { TRIP_GAP, describeTrips, realTrips, tripName, trips } from './trips';

/**
 * The trip (PLAN.md M88c).
 *
 * `sessionNumber` is labelled "Day of the trip", asked by four session
 * types, and nothing knew what a trip was. The climber's own answer is the
 * authority here; the calendar is the fallback.
 */

const out = (
  date: string,
  patch: { at?: string; day?: number; sends?: [string, string][]; mode?: 'indoor' | 'outdoor' } = {},
): Session => {
  const fields: Record<string, string | number> = {};
  if (patch.at !== undefined) fields.location = patch.at;
  if (patch.day !== undefined) fields.sessionNumber = patch.day;
  return {
    id: `${date}#0`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: patch.mode ?? 'outdoor',
    climbs: (patch.sends ?? []).map(([scale, grade], i) => ({
      id: `${date}-${i}`,
      grade,
      scale,
      count: 1,
      result: 'send',
    })),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
  } as unknown as Session;
};

describe('finding the trips in a log', () => {
  it('joins outdoor days that sit together', () => {
    const list = trips({ sessions: [out('2026-06-05'), out('2026-06-06'), out('2026-06-07')] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ from: '2026-06-05', to: '2026-06-07', days: 3, span: 3 });
  });

  /** A trip with bad weather in the middle is still a trip. */
  it('holds together across a rest day', () => {
    const list = trips({ sessions: [out('2026-06-05'), out('2026-06-07')] });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ days: 2, span: 3 });
  });

  it('holds together across two', () => {
    expect(trips({ sessions: [out('2026-06-05'), out('2026-06-08')] })).toHaveLength(1);
  });

  // Two consecutive weekends are two trips to everyone I have climbed with.
  it('splits on a longer gap', () => {
    expect(trips({ sessions: [out('2026-06-05'), out('2026-06-09')] })).toHaveLength(2);
  });

  it('takes the gap it is given', () => {
    expect(trips({ sessions: [out('2026-06-05'), out('2026-06-09')], gap: 4 })).toHaveLength(1);
    expect(trips({ sessions: [out('2026-06-05'), out('2026-06-07')], gap: 0 })).toHaveLength(2);
    expect(TRIP_GAP).toBe(2);
  });

  it('ignores a day indoors', () => {
    const list = trips({ sessions: [out('2026-06-05'), out('2026-06-06', { mode: 'indoor' }), out('2026-06-07')] });
    expect(list[0]?.days).toBe(2);
  });

  it('ignores a session that was never finished', () => {
    const unfinished = { ...out('2026-06-06'), completed: false } as Session;
    expect(trips({ sessions: [out('2026-06-05'), unfinished] })[0]?.days).toBe(1);
  });

  it('counts a day once however many sessions it held', () => {
    const twice = { ...out('2026-06-05'), id: '2026-06-05#1' } as Session;
    expect(trips({ sessions: [out('2026-06-05'), twice] })[0]?.days).toBe(1);
  });

  it('keeps to a window when it is given one', () => {
    const list = trips({ sessions: [out('2026-01-05'), out('2026-06-05')], from: '2026-05-01', to: '2026-12-31' });
    expect(list).toHaveLength(1);
    expect(list[0]?.from).toBe('2026-06-05');
  });

  it('finds nothing in a log with nothing outdoors', () => {
    expect(trips({ sessions: [out('2026-06-05', { mode: 'indoor' })] })).toEqual([]);
  });
});

/**
 * The whole reason this milestone exists: the field was asked on every
 * Outdoor Climbing session and read by nothing.
 */
describe('the day the climber said it was', () => {
  it('starts a trip on day one, whatever the calendar says', () => {
    const list = trips({ sessions: [out('2026-06-05', { day: 1 }), out('2026-06-06', { day: 1 })] });
    expect(list).toHaveLength(2);
  });

  it('keeps a trip together on day two, three, four', () => {
    const list = trips({
      sessions: [out('2026-06-05', { day: 1 }), out('2026-06-06', { day: 2 }), out('2026-06-07', { day: 3 })],
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.numbered).toBe(true);
  });

  // A gap that long is not a rest day, and a stale "day 4" should not span
  // a fortnight.
  it('still splits on a gap too long to be a rest', () => {
    const list = trips({ sessions: [out('2026-06-05', { day: 1 }), out('2026-06-20', { day: 2 })] });
    expect(list).toHaveLength(2);
  });

  /**
   * Numbering day one and then stopping tells the app where a trip started
   * and nothing about where it ended, so the reading must not claim the
   * grouping was the climber's.
   */
  it('is only the climber’s answer when every day carries one', () => {
    const list = trips({ sessions: [out('2026-06-05', { day: 1 }), out('2026-06-06')] });
    expect(list[0]?.numbered).toBe(false);
  });

  it('is the app’s guess when nobody numbered anything', () => {
    expect(trips({ sessions: [out('2026-06-05'), out('2026-06-06')] })[0]?.numbered).toBe(false);
  });
});

describe('what a trip was', () => {
  // A road trip reads as the order you drove it, not alphabetically.
  it('names equally-visited places in the order you got to them', () => {
    const list = trips({
      sessions: [out('2026-06-06', { at: 'Stanage' }), out('2026-06-07', { at: 'Burbage North' })],
    });
    expect(list[0]?.places).toEqual(['Stanage', 'Burbage North']);
  });

  it('names the places, busiest first', () => {
    const list = trips({
      sessions: [
        out('2026-06-05', { at: 'Burbage North' }),
        out('2026-06-06', { at: 'Stanage' }),
        out('2026-06-07', { at: 'Stanage' }),
      ],
    });
    expect(list[0]?.places).toEqual(['Stanage', 'Burbage North']);
    expect(tripName(list[0]!)).toBe('Stanage and Burbage North');
  });

  // A road trip over five crags is not five crags in a title.
  it('cuts a long list of places rather than listing them all', () => {
    const list = trips({
      sessions: [
        out('2026-06-05', { at: 'Stanage' }),
        out('2026-06-06', { at: 'Burbage North' }),
        out('2026-06-07', { at: 'Froggatt' }),
        out('2026-06-08', { at: 'Curbar' }),
      ],
    });
    expect(list[0]?.places).toHaveLength(4);
    expect(tripName(list[0]!)).toBe('Stanage, Burbage North and 2 more');
  });

  // The same crag typed two ways is one crag, on the M88b rule.
  it('groups two spellings of one place', () => {
    const list = trips({ sessions: [out('2026-06-05', { at: 'Stanage' }), out('2026-06-06', { at: 'stanage' })] });
    expect(list[0]?.places).toEqual(['Stanage']);
  });

  it('has a name even with nowhere named', () => {
    expect(tripName(trips({ sessions: [out('2026-06-05')] })[0]!)).toBe('Somewhere outdoors');
  });

  it('counts the sends and finds the hardest on each ladder', () => {
    const list = trips({
      sessions: [
        out('2026-06-05', { sends: [['V', 'V4'], ['V', 'V6']] }),
        out('2026-06-06', { sends: [['YDS', '5.11a'], ['V', 'V5']] }),
      ],
    });
    expect(list[0]?.sends).toBe(4);
    expect(list[0]?.best).toEqual([{ scale: 'V', grade: 'V6' }, { scale: 'YDS', grade: '5.11a' }]);
  });

  it('does not count an attempt as a send', () => {
    const tried = out('2026-06-05');
    tried.climbs = [{ id: 'a', grade: 'V7', scale: 'V', count: 2, result: 'attempt' }];
    expect(trips({ sessions: [tried, out('2026-06-06')] })[0]?.sends).toBe(0);
  });
});

describe('which of those is a trip', () => {
  // One outdoor day is a day out, not a trip.
  it('leaves out a single day', () => {
    expect(realTrips(trips({ sessions: [out('2026-06-05')] }))).toEqual([]);
  });

  it('counts a weekend, which is what most trips are', () => {
    expect(realTrips(trips({ sessions: [out('2026-06-06'), out('2026-06-07')] }))).toHaveLength(1);
  });
});

describe('said out loud', () => {
  const say = (sessions: Session[]) => describeTrips(trips({ sessions }));

  it('says nothing about a year with no trip in it', () => {
    expect(say([out('2026-06-05')])).toBeNull();
    expect(say([])).toBeNull();
  });

  // Trips of different lengths, or "longest" is whichever comes first.
  it('counts the trips and the days, and finds the longest', () => {
    expect(
      say([
        out('2026-06-05', { at: 'Stanage' }),
        out('2026-06-06', { at: 'Stanage' }),
        out('2026-08-01', { at: 'Fontainebleau' }),
        out('2026-08-02', { at: 'Fontainebleau' }),
        out('2026-08-03', { at: 'Fontainebleau' }),
      ]),
    ).toMatch(/^2 trips, 5 days out\. The longest was 3 days at Fontainebleau\.$/);
  });

  it('agrees with itself about one trip', () => {
    expect(say([out('2026-06-05', { at: 'Stanage' }), out('2026-06-06', { at: 'Stanage' })])).toMatch(
      /^One trip, 2 days out\. The longest was 2 days at Stanage\.$/,
    );
  });
});
