import { describe, expect, it } from 'vitest';
import { BASE_CAMP, IRON_GRIP, PEAK_PERFORMANCE } from '@/content/programs/catalogue';
import { planFromLayout } from './scheduler';
import { blockStatus, blockWindow, plannedDay } from './plan';
import { addDays } from './dates';

const IG_PLAN = planFromLayout(IRON_GRIP.recommendedLayout!);
// 2026-03-08 is a Sunday.
const START = '2026-03-09'; // Monday of week 1

describe('plannedDay', () => {
  it('places the session type the plan asks for', () => {
    const mon = plannedDay(IRON_GRIP, START, IG_PLAN, '2026-03-09');
    expect(mon.sessionType?.id).toBe('fp');
    expect(mon.isRest).toBe(false);
    const tue = plannedDay(IRON_GRIP, START, IG_PLAN, '2026-03-10');
    expect(tue.sessionType).toBeUndefined();
    expect(tue.isRest).toBe(true);
  });

  it('resolves the drill for the week', () => {
    const wed1 = plannedDay(IRON_GRIP, START, IG_PLAN, '2026-03-11');
    expect(wed1.week).toBe(1);
    expect(wed1.drill?.name).toBe('Limit Boulders on the Crimps');
    // Week 5 swaps in the next phase's drill.
    const wed5 = plannedDay(IRON_GRIP, START, IG_PLAN, '2026-04-08');
    expect(wed5.week).toBe(5);
    expect(wed5.drill?.name).toBe('Power Endurance Circuit');
  });

  it('tracks the phase across the program', () => {
    expect(plannedDay(IRON_GRIP, START, IG_PLAN, '2026-03-09').phase?.id).toBe('anvil');
    expect(plannedDay(IRON_GRIP, START, IG_PLAN, '2026-04-08').phase?.id).toBe('hammer');
    expect(plannedDay(IRON_GRIP, START, IG_PLAN, '2026-05-13').phase?.id).toBe('spark');
  });

  it('flags deload weeks', () => {
    const week4 = plannedDay(IRON_GRIP, START, IG_PLAN, '2026-04-01');
    expect(week4.week).toBe(4);
    expect(week4.isDeload).toBe(true);
    expect(plannedDay(IRON_GRIP, START, IG_PLAN, '2026-03-25').isDeload).toBe(false);
  });

  it('returns no week before the program starts', () => {
    const before = plannedDay(IRON_GRIP, START, IG_PLAN, '2026-03-01');
    expect(before.week).toBeNull();
    expect(before.phase).toBeUndefined();
  });

  it('handles a program whose deloads sit mid-phase', () => {
    const plan = planFromLayout(PEAK_PERFORMANCE.recommendedLayout!);
    const week9 = plannedDay(PEAK_PERFORMANCE, START, plan, '2026-05-04');
    expect(week9.week).toBe(9);
    expect(week9.isDeload).toBe(true);
  });

  it('works for block-based programs with no drills', () => {
    const plan = planFromLayout(BASE_CAMP.recommendedLayout!);
    const tue = plannedDay(BASE_CAMP, START, plan, '2026-03-10');
    expect(tue.sessionType?.id).toBe('eng');
    expect(tue.drill).toBeUndefined();
  });
});

/**
 * The block ends (PLAN.md M85).
 *
 * `programWeek` clamps, so before this every one of the six screens that
 * reads a planned day was being told a twelve-week block a year in the past
 * was still on week twelve — with its sessions, its phase, and its final
 * test week. The whole suite passed while that was true, which is the point
 * of writing these.
 */
describe('the block window', () => {
  it('runs from the Sunday of week one to the last day of the last week', () => {
    const { from, to } = blockWindow(IRON_GRIP, START);
    // START is a Monday; week one began the Sunday before.
    expect(from).toBe('2026-03-08');
    expect(to).toBe(addDays(from, IRON_GRIP.weeks * 7 - 1));
  });

  it('knows before, during and after', () => {
    const { from, to } = blockWindow(IRON_GRIP, START);
    expect(blockStatus(IRON_GRIP, START, addDays(from, -1)).state).toBe('before');
    expect(blockStatus(IRON_GRIP, START, from).state).toBe('running');
    expect(blockStatus(IRON_GRIP, START, to).state).toBe('running');
    expect(blockStatus(IRON_GRIP, START, addDays(to, 1)).state).toBe('ended');
  });

  it('counts the days since it ended', () => {
    const { to } = blockWindow(IRON_GRIP, START);
    expect(blockStatus(IRON_GRIP, START, to).daysSince).toBe(0);
    expect(blockStatus(IRON_GRIP, START, addDays(to, 30)).daysSince).toBe(30);
  });
});

describe('past the last week', () => {
  const { to } = blockWindow(IRON_GRIP, START);
  const after = (days: number) => plannedDay(IRON_GRIP, START, IG_PLAN, addDays(to, days));

  it('still plans the last day of the block', () => {
    const last = plannedDay(IRON_GRIP, START, IG_PLAN, to);
    expect(last.week).toBe(IRON_GRIP.weeks);
    expect(last.over).toBeUndefined();
  });

  it('plans nothing the day after', () => {
    const day = after(1);
    expect(day.over).toBe(true);
    expect(day.week).toBeNull();
    expect(day.sessionType).toBeUndefined();
    expect(day.phase).toBeUndefined();
    expect(day.isRest).toBe(true);
  });

  it('stops calling it a test week, however long ago it was', () => {
    // The banner that would otherwise read "Final week — the after, to put
    // beside the before" every day for the rest of the climber's life.
    expect(plannedDay(IRON_GRIP, START, IG_PLAN, to).test).toBe('final');
    expect(after(1).test).toBeUndefined();
    expect(after(300).test).toBeUndefined();
  });

  it('stops handing out week twelve a year later', () => {
    expect(after(365).week).toBeNull();
    expect(after(365).sessionType).toBeUndefined();
  });

  it('is not confused with the days before the block starts', () => {
    const early = plannedDay(IRON_GRIP, START, IG_PLAN, '2026-03-01');
    expect(early.week).toBeNull();
    expect(early.over).toBeUndefined();
  });
});
