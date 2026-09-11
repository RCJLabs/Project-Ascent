import { describe, expect, it } from 'vitest';
import { BASE_CAMP, IRON_GRIP, PEAK_PERFORMANCE } from '@/content/programs/catalogue';
import { planFromLayout } from './scheduler';
import { plannedDay } from './plan';

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
