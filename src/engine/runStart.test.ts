import { beforeAll, describe, expect, it } from 'vitest';
import { getProgram, loadPrograms } from '@/content/programs';
import type { Program } from '@/content/types';
import type { Session } from '@/db/sessions';
import { pickUp, type BlockRecord } from './blocks';
import { addDays, dayOfWeek } from './dates';
import { plannedDay } from './plan';
import { pausedOn, segmentsOf } from './blockRun';
import { startOn } from './runStart';
import { weekOutline } from './week';
import { planFromLayout } from './weekLayouts';

/**
 * The day's start, for a block that was picked up (PLAN.md M374).
 *
 * Iron Grip from a fixed Sunday, run three weeks, stopped on the Saturday,
 * and resumed three weeks later — through `pickUp`, the rule the app uses,
 * so the row here is the row a climber gets.
 */

const S = '2026-01-04';
let IG: Program;
let plan: ReturnType<typeof planFromLayout>;
let row: BlockRecord;

beforeAll(async () => {
  await loadPrograms();
  IG = getProgram('iron_grip')!;
  plan = planFromLayout(IG.recommendedLayout!);
  const stopped: BlockRecord = {
    id: `iron_grip#${S}`, programId: 'iron_grip', name: 'Iron Grip', startDate: S, weeks: 12, plan,
    endedAt: addDays(S, 20), reason: 'stopped',
  };
  row = pickUp(stopped, addDays(S, 42))!;
});

describe('the fixture', () => {
  it('is a three-week pause, recorded by the rule the app uses', () => {
    expect(dayOfWeek(S)).toBe(0);
    expect(row.startDate).toBe(addDays(S, 21));
    expect(row.resumed).toEqual([{ on: addDays(S, 42), weeks: 3, stoppedOn: addDays(S, 20) }]);
    expect(segmentsOf(row)[0]!.startDate).toBe(S);
  });
});

describe('startOn', () => {
  it('numbers a day before the stop from the start it had then', () => {
    expect(startOn(row, row.startDate, addDays(S, 10))).toBe(S);
    expect(startOn(row, row.startDate, addDays(S, 20))).toBe(S);
  });

  it('gives a day in the pause no start at all', () => {
    for (const d of [21, 30, 41]) expect(startOn(row, row.startDate, addDays(S, d)), `day ${d}`).toBeNull();
  });

  it('gives the resume day and after the live start', () => {
    expect(startOn(row, row.startDate, addDays(S, 42))).toBe(row.startDate);
    expect(startOn(row, 'live', addDays(S, 60))).toBe('live');
  });

  it('gives the live start to a row never picked up, and to no row', () => {
    const plain = { ...row, resumed: undefined, startDate: S };
    expect(startOn(plain, 'live', addDays(S, 10))).toBe('live');
    expect(startOn(null, 'live', addDays(S, 10))).toBe('live');
  });

  /** M149's pick-up has no stop, so its gap is the first stretch's, missed. */
  it('leaves a pick-up without a stop a gap, not a pause', () => {
    const picked = { ...row, resumed: [{ on: addDays(S, 42), weeks: 3 }] };
    expect(startOn(picked, picked.startDate, addDays(S, 30))).toBe(S);
  });
});

describe('the week outline', () => {
  const sessions: Session[] = [];
  const outline = (date: string, withRow = true) =>
    weekOutline({ date, today: addDays(S, 50), sessions, program: IG, startDate: row.startDate, plan, row: withRow ? row : null });

  it('draws a week the climber trained before the stop as the week it was', () => {
    const week = outline(addDays(S, 7));
    expect(week.week).toBe(2);
    expect(week.before).toBe(false);
    expect(week.planned).toBeGreaterThan(0);
    expect(week.paused).toBe(false);
    // And without the row, the same week read as before the block began.
    expect(outline(addDays(S, 7), false).before).toBe(true);
  });

  it('draws a week inside the pause as paused, with nothing planned and nothing missed', () => {
    const week = outline(addDays(S, 28));
    expect(week.paused).toBe(true);
    expect(week.week).toBeNull();
    expect(week.planned).toBe(0);
    expect(week.days.every((d) => d.paused === true && d.status !== 'missed')).toBe(true);
    // Without the row, it was weeks one to three of the block, and missed.
    const before = outline(addDays(S, 28), false);
    expect(before.week).toBe(2);
    expect(before.days.some((d) => d.status === 'missed')).toBe(true);
  });

  it('numbers the week after the resume from the live start', () => {
    const week = outline(addDays(S, 42));
    expect(week.week).toBe(4);
    expect(week.paused).toBe(false);
    expect(week.days.some((d) => d.paused)).toBe(false);
  });

  /**
   * A resume on a Wednesday: the week's first three days are the pause's, and
   * the week is still the block's fourth — read off a day that has one.
   */
  it('numbers a week the resume fell in from the days after it', () => {
    const wednesday = pickUp({ ...row, resumed: undefined, startDate: S, endedAt: addDays(S, 20) }, addDays(S, 45))!;
    const week = weekOutline({
      date: addDays(S, 42), today: addDays(S, 50), sessions, program: IG, startDate: wednesday.startDate, plan, row: wednesday,
    });
    expect(week.days.map((d) => d.paused === true)).toEqual([true, true, true, false, false, false, false]);
    expect(week.week).toBe(4);
    expect(week.paused).toBe(false);
  });

  /** A stop on a Wednesday: the week is half the block's and half the pause's. */
  it('splits a week the stop fell in', () => {
    const midweek = pickUp({ ...row, resumed: undefined, startDate: S, endedAt: addDays(S, 17) }, addDays(S, 42))!;
    const week = weekOutline({
      date: addDays(S, 14), today: addDays(S, 50), sessions, program: IG, startDate: midweek.startDate, plan, row: midweek,
    });
    expect(week.week).toBe(3);
    expect(week.paused).toBe(false);
    expect(week.days.map((d) => d.paused === true)).toEqual([false, false, false, false, true, true, true]);
    // The days before the stop keep the plan they had.
    const wednesday = week.days[3]!;
    expect(wednesday.day?.week).toBe(3);
    expect(wednesday.day?.sessionType?.id).toBe(plannedDay(IG, S, plan, addDays(S, 17)).sessionType?.id);
  });
});

/**
 * Walked, not built (PLAN.md M374): `startOn` is in the first load and
 * `segmentsOf` is not, so the two are held to one answer here — every day
 * from before the run to after it, for a stop, a mid-week stop, two stops,
 * and a pick-up without one.
 */
describe('the same answer as the review\'s segments', () => {
  function bySegments(r: BlockRecord, date: string): string | null {
    if (pausedOn(r, date)) return null;
    const segments = segmentsOf(r);
    const segment = segments.find((s) => s.until === null || date <= s.until);
    return segment === undefined || segment === segments.at(-1) ? r.startDate : segment.startDate;
  }

  it('agrees on every day of every shape', () => {
    const base: BlockRecord = { ...row, resumed: undefined, startDate: S, endedAt: null };
    const once = row;
    const midweek = pickUp({ ...base, endedAt: addDays(S, 17), reason: 'stopped' }, addDays(S, 42))!;
    const twice = pickUp({ ...once, endedAt: addDays(S, 55), reason: 'stopped' }, addDays(S, 77))!;
    const noStop = { ...once, resumed: [{ on: addDays(S, 42), weeks: 3 }] };
    expect(twice.resumed).toHaveLength(2);
    for (const r of [once, midweek, twice, noStop]) {
      for (let d = -7; d < 120; d++) {
        const date = addDays(S, d);
        expect(startOn(r, r.startDate, date), `${r.resumed!.length} pick-ups, day ${d}`).toBe(bySegments(r, date));
      }
    }
  });
});
