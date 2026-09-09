import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import {
  EVEREST,
  HEIGHT,
  LADDER_TOP,
  MILESTONES,
  deriveAltimeter,
  describeWeeks,
  sessionHeight,
  weeklyHeight,
} from './altimeter';
import { addDays } from './dates';

const TODAY = '2026-09-09';
let counter = 0;

function session(date: string, climbs: Record<string, unknown>[], patch: Partial<Session> = {}): Session {
  return newSession(date, counter++, {
    completed: true,
    climbs: climbs.map((c) => ({
      id: `c${counter++}`,
      scale: (String(c.grade).startsWith('V') ? 'V' : 'YDS') as 'V' | 'YDS',
      count: 1,
      result: 'send' as const,
      ...c,
    })) as Session['climbs'],
    ...patch,
  });
}

describe('the ladder', () => {
  it('rises without repeating, from a gym wall to twenty-three summits', () => {
    const feet = MILESTONES.map((m) => m.feet);
    expect(feet).toEqual([...feet].sort((a, b) => a - b));
    expect(new Set(feet).size).toBe(feet.length);
    expect(new Set(MILESTONES.map((m) => m.name)).size).toBe(MILESTONES.length);
    expect(MILESTONES).toHaveLength(23);
    expect(MILESTONES[0]!.name).toBe('First gym wall');
    expect(EVEREST.feet).toBe(29_032);
  });

  it('stacks the remaining eight-thousanders on top of Everest', () => {
    const afterEverest = MILESTONES.slice(MILESTONES.indexOf(EVEREST) + 1);
    expect(afterEverest).toHaveLength(13);
    expect(afterEverest[0]!.name).toBe('K2');
    // Roughly 350k additional feet, as the plan estimates.
    expect(LADDER_TOP - EVEREST.feet).toBeGreaterThan(330_000);
    expect(LADDER_TOP - EVEREST.feet).toBeLessThan(360_000);
  });
});

describe('sessionHeight', () => {
  it('counts boulders and routes at their own rates', () => {
    expect(sessionHeight(session(TODAY, [{ grade: 'V4' }]))).toBe(HEIGHT.boulder);
    expect(sessionHeight(session(TODAY, [{ grade: '5.11a' }]))).toBe(HEIGHT.route);
    expect(sessionHeight(session(TODAY, [{ grade: 'V4', count: 6 }]))).toBe(HEIGHT.boulder * 6);
  });

  it('pays a quarter more for real rock', () => {
    const outdoor = session(TODAY, [{ grade: 'V4' }], { mode: 'outdoor' });
    expect(sessionHeight(outdoor)).toBe(HEIGHT.boulder * HEIGHT.outdoor);
  });

  it('ignores attempts, and an incomplete session entirely', () => {
    expect(sessionHeight(session(TODAY, [{ grade: 'V4', result: 'attempt' }]))).toBe(0);
    expect(sessionHeight(session(TODAY, [{ grade: 'V4' }], { completed: false }))).toBe(0);
  });
});

describe('deriveAltimeter', () => {
  it('is empty and honest with nothing logged', () => {
    const a = deriveAltimeter([], { today: TODAY });
    expect(a).toMatchObject({ feet: 0, laps: 0, pace: 0, etaWeeks: null, etaLabel: null });
    expect(a.next).toBe(MILESTONES[0]);
    expect(a.everest.reached).toBe(false);
  });

  it('reports the milestones passed and the one ahead', () => {
    const sessions = [session(TODAY, [{ grade: 'V4', count: 40 }])]; // 600 ft
    const a = deriveAltimeter(sessions, { today: TODAY });
    expect(a.feet).toBe(600);
    expect(a.reached.map((m) => m.name)).toEqual(['First gym wall']);
    expect(a.next!.name).toBe('Devils Tower');
    expect(a.toNext).toBe(867 - 600);
    expect(a.intoSegment).toBe(600 - 45);
    expect(a.segment).toBe(867 - 45);
  });

  it('converts to metres', () => {
    expect(deriveAltimeter([session(TODAY, [{ grade: 'V4', count: 100 }])], { today: TODAY }).meters).toBe(457);
  });

  it('measures pace over the recent window, not all time', () => {
    // A dormant year, then four busy weeks.
    const old = session(addDays(TODAY, -300), [{ grade: 'V4', count: 100 }]);
    const recent = [1, 8, 15, 22].map((back) =>
      session(addDays(TODAY, -back), [{ grade: 'V4', count: 20 }]),
    );
    const a = deriveAltimeter([old, ...recent], { today: TODAY, paceWeeks: 8 });
    // 4 × 300 ft inside the window, over eight weeks.
    expect(a.pace).toBe(150);
  });

  it('does not divide by more weeks than the climber has been logging', () => {
    // Eight days of history, 600 ft in it. Averaging over the full eight-week
    // window would report 75 ft/week for someone climbing seven times that.
    const sessions = [0, 7].map((back) => session(addDays(TODAY, -back), [{ grade: 'V4', count: 20 }]));
    const a = deriveAltimeter(sessions, { today: TODAY, paceWeeks: 8 });
    expect(a.pace).toBe(Math.round(600 / (8 / 7)));
    expect(a.pace).toBeGreaterThan(500);
    // And a rate this noisy is exactly why the projection stays withheld.
    expect(a.etaLabel).toBeNull();
  });

  it('withholds a projection below three weeks of history', () => {
    const sessions = [session(addDays(TODAY, -5), [{ grade: 'V4', count: 20 }])];
    expect(deriveAltimeter(sessions, { today: TODAY }).etaLabel).toBeNull();
  });

  it('projects the next milestone and Everest once there is history', () => {
    const sessions = Array.from({ length: 12 }, (_, i) =>
      session(addDays(TODAY, -i * 3), [{ grade: 'V4', count: 20 }]),
    );
    const a = deriveAltimeter(sessions, { today: TODAY });
    expect(a.pace).toBeGreaterThan(0);
    expect(a.etaLabel).not.toBeNull();
    expect(a.everest.etaLabel).not.toBeNull();
    expect(a.everest.fraction).toBeLessThan(1);
  });

  it('says nothing about Everest once Everest is behind you', () => {
    const sessions = [session(TODAY, [{ grade: '5.12a', count: 700 }])]; // 35,000 ft
    const a = deriveAltimeter(sessions, { today: TODAY });
    expect(a.everest.reached).toBe(true);
    expect(a.everest.toGo).toBe(0);
    expect(a.everest.etaLabel).toBeNull();
  });

  it('starts a second lap once the whole ladder is done', () => {
    // Land just past the top so the lap remainder is a few hundred feet.
    const climbs = Math.ceil((LADDER_TOP + 300) / HEIGHT.route);
    const a = deriveAltimeter([session(TODAY, [{ grade: '5.12a', count: climbs }])], { today: TODAY });
    expect(a.laps).toBe(1);
    expect(a.feet).toBeGreaterThan(LADDER_TOP);
    // The ladder restarts: only the earliest milestones are behind you again.
    expect(a.reached).toHaveLength(1);
    expect(a.next!.name).toBe('Devils Tower');
  });

  it('adds nothing for a game action, because it never sees one', () => {
    const restOnly = newSession(TODAY, counter++, {
      completed: true,
      climbs: [],
      restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true },
    });
    expect(deriveAltimeter([restOnly], { today: TODAY }).feet).toBe(0);
  });
});

describe('describeWeeks', () => {
  it('stays coarse where the data is coarse', () => {
    expect(describeWeeks(0.5)).toBe('this week');
    expect(describeWeeks(1.4)).toBe('about a week');
    expect(describeWeeks(6)).toBe('about 6 weeks');
    expect(describeWeeks(20)).toBe('about 5 months');
    expect(describeWeeks(60)).toBe('about 14 months');
    expect(describeWeeks(100)).toBe('about 2 years');
    expect(describeWeeks(200)).toBe('about 4 years');
    expect(describeWeeks(1000)).toBe('a very long way off');
  });
});

describe('weeklyHeight', () => {
  it('buckets by rolling week, oldest first, with empty weeks kept', () => {
    const sessions = [
      session(addDays(TODAY, -1), [{ grade: 'V4', count: 2 }]),
      session(addDays(TODAY, -20), [{ grade: 'V4' }]),
    ];
    const weeks = weeklyHeight(sessions, 4, TODAY);
    expect(weeks).toHaveLength(4);
    expect(weeks.at(-1)!.feet).toBe(30);
    expect(weeks.map((w) => w.feet).filter((f) => f > 0)).toEqual([15, 30]);
    expect(weeks.at(-1)!.week).toBe(TODAY);
  });
});
