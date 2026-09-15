import { describe, expect, it } from 'vitest';
import { HISTORY_DAYS, describeVitalityHistory, vitalityHistory } from './vitalityHistory';
import { GRIND_COST } from './vitality';
import { addDays } from './dates';
import type { Session } from '@/db/sessions';
import type { Injury } from '@/store/profile';

/**
 * The month behind the number (PLAN.md M201).
 *
 * `vitality.ts` exists to make the cost of grinding legible and showed one
 * day of it, so three weeks cooked and one bad Tuesday were the same
 * picture. These hold the difference.
 */

const TO = '2026-09-30';

const day = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#a`,
    date,
    completed: true,
    planned: false,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 90,
    warmup: true,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as unknown as Session;

const rest = (date: string): Session => day(date, { restChecklist: {}, climbs: [] } as never);

/** Trained every day for `n` days, ending on `to`. */
const grind = (n: number, to = TO): Session[] =>
  Array.from({ length: n }, (_, i) => day(addDays(to, -(n - 1 - i))));

describe('the window', () => {
  it('is a day per day, oldest first, ending today', () => {
    const history = vitalityHistory({ sessions: grind(3), endurance: 50, to: TO });
    expect(history.days).toHaveLength(HISTORY_DAYS);
    expect(history.days.at(-1)?.date).toBe(TO);
    expect(history.days[0]?.date).toBe(addDays(TO, -(HISTORY_DAYS - 1)));
    const dates = history.days.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('takes its length from the caller', () => {
    expect(vitalityHistory({ sessions: [], endurance: 50, to: TO, days: 7 }).days).toHaveLength(7);
  });

  it('is full vitality on a log with nothing in it', () => {
    // Nothing logged is not the same as nothing wrong, and the app has
    // always said so: no penalties means full.
    const history = vitalityHistory({ sessions: [], endurance: 50, to: TO });
    expect(history.days.every((d) => d.fraction === 1)).toBe(true);
    expect(history.under).toBe(0);
    expect(history.low.state).toBe('fresh');
  });
});

describe('a grind shows as a shape', () => {
  it('drains further the longer the run gets', () => {
    // The whole point of the chart: six days in a row is not six copies of
    // day one. `GRIND_COST` escalates, so the line has to fall.
    const history = vitalityHistory({ sessions: grind(6), endurance: 50, to: TO });
    const last6 = history.days.slice(-6).map((d) => d.current);
    expect(GRIND_COST[3]).toBeLessThan(GRIND_COST[6]!);
    expect(last6.at(-1)!).toBeLessThan(last6[0]!);
    for (let i = 1; i < last6.length; i += 1) expect(last6[i]!).toBeLessThanOrEqual(last6[i - 1]!);
  });

  it('separates a long run from a single bad day', () => {
    /**
     * The two pictures that used to be identical — and the endurance is
     * part of the fixture, not decoration. END 50 puts the ceiling near
     * 278, where even the steepest grind cost (70) lands at 0.75 and
     * reads *Worked*; nothing crosses the band and both sides of this
     * comparison are zero. END 20 is a ceiling of 144, where 70 is 0.51
     * and the run shows. A fixture that cannot reach the threshold proves
     * nothing about it.
     */
    const long = vitalityHistory({ sessions: grind(12), endurance: 20, to: TO });
    const once = vitalityHistory({
      sessions: [...grind(4, addDays(TO, -20)), day(TO)],
      endurance: 20,
      to: TO,
    });
    expect(long.under).toBeGreaterThan(0);
    expect(once.under).toBe(0);
  });

  it('recovers after a rest day', () => {
    const sessions = [...grind(5, addDays(TO, -2)), rest(addDays(TO, -1))];
    const history = vitalityHistory({ sessions, endurance: 50, to: TO });
    const deep = history.days.find((d) => d.date === addDays(TO, -2))!;
    const after = history.days.find((d) => d.date === addDays(TO, -1))!;
    expect(after.current).toBeGreaterThan(deep.current);
  });
});

describe('what it counts', () => {
  it('counts an injury only from the day it was logged', () => {
    const injury = { id: 'i', part: 'elbow', since: addDays(TO, -5), severity: 'managing', status: 'returning' } as unknown as Injury;
    const history = vitalityHistory({ sessions: grind(2), endurance: 50, to: TO, injuries: [injury] });
    const before = history.days.find((d) => d.date === addDays(TO, -10))!;
    const after = history.days.find((d) => d.date === addDays(TO, -3))!;
    expect(before.current).toBeGreaterThan(after.current);
  });

  it('ignores a session that was never finished', () => {
    /**
     * Inside a run, because that is the only place the answer differs. A
     * lone unfinished session costs nothing either way — `GRIND_COST` has
     * no entry below three — so the first version of this test asserted
     * zero against zero and a mutation that counted unfinished sessions
     * survived it.
     */
    const withOpen = [
      ...grind(2, addDays(TO, -3)),
      day(addDays(TO, -2), { completed: false }),
      ...grind(2, TO),
    ];
    const run = vitalityHistory({ sessions: withOpen, endurance: 20, to: TO });
    const unbroken = vitalityHistory({ sessions: grind(5, TO), endurance: 20, to: TO });
    const today = (h: ReturnType<typeof vitalityHistory>) => h.days.at(-1)!.current;
    expect(today(run)).toBeGreaterThan(today(unbroken));
  });

  it('does not count a rest day as a training day', () => {
    // The same shape, and the reason the rest branch returns early: a rest
    // day in the middle has to break the run, not extend it.
    const withRest = [...grind(2, addDays(TO, -3)), rest(addDays(TO, -2)), ...grind(2, TO)];
    const broken = vitalityHistory({ sessions: withRest, endurance: 20, to: TO });
    const unbroken = vitalityHistory({ sessions: grind(5, TO), endurance: 20, to: TO });
    expect(broken.days.at(-1)!.current).toBeGreaterThan(unbroken.days.at(-1)!.current);
  });

  it('counts a rest day yesterday as relief today', () => {
    // `restedWithin24h` is today *or* yesterday, and yesterday is the arm
    // that matters — a climber who rested and trained again the next day
    // is the case the buff was written for. Skipped warmups supply the
    // damage, because a rest day breaks any run that could supply it.
    const skipped = Array.from({ length: 3 }, (_, i) =>
      day(addDays(TO, -(5 - i)), { warmup: false }),
    );
    const withRest = vitalityHistory({
      sessions: [...skipped, rest(addDays(TO, -1))],
      endurance: 20,
      to: TO,
    });
    const without = vitalityHistory({ sessions: skipped, endurance: 20, to: TO });
    expect(withRest.days.at(-1)!.current).toBeGreaterThan(without.days.at(-1)!.current);
  });

  it('lets a skipped warmup expire out of the window', () => {
    const old = vitalityHistory({
      sessions: [day(addDays(TO, -20), { warmup: false })],
      endurance: 20,
      to: TO,
    });
    const recent = vitalityHistory({
      sessions: [day(addDays(TO, -3), { warmup: false })],
      endurance: 20,
      to: TO,
    });
    expect(old.days.at(-1)!.current).toBe(old.days.at(-1)!.max);
    expect(recent.days.at(-1)!.current).toBeLessThan(recent.days.at(-1)!.max);
  });

  it('reads the ceiling off endurance', () => {
    const weak = vitalityHistory({ sessions: [], endurance: 10, to: TO }).days[0]!;
    const strong = vitalityHistory({ sessions: [], endurance: 100, to: TO }).days[0]!;
    expect(strong.max).toBeGreaterThan(weak.max);
  });
});

describe('the sentence under it', () => {
  it('says nothing when there is nothing to say', () => {
    // A flat green month has no story, and inventing one is the app
    // talking for the sake of it.
    expect(describeVitalityHistory(vitalityHistory({ sessions: [], endurance: 50, to: TO }))).toBeNull();
  });

  it('calls a long run a stretch rather than a session', () => {
    const said = describeVitalityHistory(vitalityHistory({ sessions: grind(12), endurance: 20, to: TO }));
    expect(said).toMatch(/in a row/);
    expect(said).toMatch(/stretch rather than a session/);
  });

  it('counts scattered days without calling them a run', () => {
    // Two six-day grinds, far apart. Only the last day of each crosses the
    // band — day five costs 50 of a 144 ceiling and still reads *Worked* —
    // so this is two bad days in runs of one, which is the case the
    // sentence has to describe differently from a stretch.
    const scattered = [
      ...grind(6, addDays(TO, -20)),
      ...grind(6, addDays(TO, -8)),
    ];
    const said = describeVitalityHistory(vitalityHistory({ sessions: scattered, endurance: 20, to: TO }));
    expect(said).toMatch(/in runs of/);
    expect(said).not.toMatch(/stretch rather than a session/);
  });
});
