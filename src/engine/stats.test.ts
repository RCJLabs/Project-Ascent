import { describe, expect, it } from 'vitest';
import type { MetricEntry } from '@/db/metrics';
import { newProject } from '@/db/projects';
import { newSession, type Session } from '@/db/sessions';
import { addDays, startOfWeek } from './dates';
import { deriveClimberState } from './derive';
import {
  BASE_STAT,
  CONTRIBUTORS,
  MAX_STAT,
  RUST_PENALTY,
  deriveStats,
  type StatId,
} from './stats';
import {
  GRIND_COST,
  INJURY_COST,
  REST_RELIEF,
  SKIPPED_WARMUP_COST,
  VITALITY_CEILING,
  VITALITY_FLOOR,
  deriveVitality,
} from './vitality';

const TODAY = '2026-09-09';
let counter = 0;

function session(date: string, patch: Partial<Session> = {}): Session {
  return newSession(date, counter++, { completed: true, rpe: 7, durationMin: 60, ...patch });
}
function climb(grade: string, patch: Record<string, unknown> = {}) {
  return {
    id: `c${counter++}`,
    grade,
    scale: (grade.startsWith('V') ? 'V' : 'YDS') as 'V' | 'YDS',
    count: 1,
    result: 'send' as const,
    ...patch,
  };
}
function stateOf(sessions: Session[], weeklyTarget = 3) {
  return deriveClimberState(sessions, { today: TODAY, weeklyTarget });
}
/** Weeks that meet the target, so streak-driven stats have something to read. */
function fullWeeks(count: number): Session[] {
  const out: Session[] = [];
  for (let w = count; w >= 1; w--) {
    const start = addDays(startOfWeek(TODAY), -7 * w);
    for (const d of [0, 2, 4]) out.push(session(addDays(start, d), { warmup: true }));
  }
  return out;
}

describe('the stat table', () => {
  it('is built so a maxed stat is exactly 100, not a clamp', () => {
    for (const id of Object.keys(CONTRIBUTORS) as StatId[]) {
      const total = CONTRIBUTORS[id].reduce((sum, c) => sum + c.cap, 0);
      expect(total, `${id} caps`).toBe(MAX_STAT - BASE_STAT);
    }
  });

  it('starts every stat at the base with nothing logged', () => {
    const stats = deriveStats({ state: stateOf([]) });
    for (const stat of Object.values(stats)) {
      expect(stat.value).toBe(BASE_STAT);
      expect(stat.contributions.every((c) => c.detail === null || c.points === 0)).toBe(true);
    }
  });

  it('never exceeds the cap however extreme the input', () => {
    const metrics: MetricEntry[] = [
      { metricId: 'max_hang_20mm_7s', date: TODAY, value: 500 },
      { metricId: 'weighted_pullup_3rm', date: TODAY, value: 500 },
      { metricId: 'max_pullups', date: TODAY, value: 500 },
      { metricId: 'arc_duration', date: TODAY, value: 500 },
      { metricId: 'flexibility', date: TODAY, value: 500 },
      { metricId: 'box_jump_height', date: TODAY, value: 500 },
      { metricId: 'max_dynamic_grade', date: TODAY, value: 17 },
      { metricId: 'wall_angel', date: TODAY, value: 1, display: 'Pass' },
      { metricId: 'toe_touch', date: TODAY, value: -50 },
    ];
    const sessions = [
      ...fullWeeks(60),
      session(TODAY, { climbs: [climb('V16', { count: 9999, style: 'onsight' })], drillDone: true }),
    ];
    const projects = Array.from({ length: 20 }, (_, i) =>
      newProject({ id: `p${i}`, name: `p${i}`, grade: 'V5', scale: 'V', status: 'sent' }),
    );
    const stats = deriveStats({ state: stateOf(sessions), metrics, projects });
    for (const stat of Object.values(stats)) expect(stat.value).toBeLessThanOrEqual(MAX_STAT);
  });

  it('explains every point it awarded', () => {
    const metrics: MetricEntry[] = [{ metricId: 'max_hang_20mm_7s', date: TODAY, value: 30 }];
    const stats = deriveStats({ state: stateOf([session(TODAY, { climbs: [climb('V6')] })]), metrics });
    const str = stats.STR;
    const sum = str.contributions.reduce((total, c) => total + c.points, 0);
    expect(str.value).toBe(Math.round(BASE_STAT + sum));
    expect(str.contributions.find((c) => c.label === 'Max hang')).toMatchObject({
      points: 15,
      detail: '30 lbs added',
    });
    // Six months of solid training should leave room to grow, not pin the bar.
    const seasoned = deriveStats({ state: stateOf(fullWeeks(26)) });
    for (const stat of Object.values(seasoned)) expect(stat.value).toBeLessThan(70);
    expect(str.contributions.find((c) => c.label === 'Hardest boulder')!.detail).toBe('6 V-grades');
  });

  it('says nothing rather than zero for a benchmark never taken', () => {
    const stats = deriveStats({ state: stateOf([session(TODAY)]) });
    expect(stats.AGI.contributions.find((c) => c.label === 'Flexibility')).toMatchObject({
      points: 0,
      detail: null,
    });
  });

  it('reads a lower-is-better benchmark as distance closed', () => {
    const near = deriveStats({
      state: stateOf([]),
      metrics: [{ metricId: 'toe_touch', date: TODAY, value: 2 }],
    }).AGI;
    const far = deriveStats({
      state: stateOf([]),
      metrics: [{ metricId: 'toe_touch', date: TODAY, value: 11 }],
    }).AGI;
    expect(near.value).toBeGreaterThan(far.value);
  });

  it('ignores a text metric, which has no numeric meaning', () => {
    const stats = deriveStats({
      state: stateOf([]),
      metrics: [{ metricId: 'core_lever', date: TODAY, value: 0, display: 'advanced tuck' }],
    });
    expect(stats.STR.value).toBe(BASE_STAT);
  });

  it('counts an on-sight as double a flash', () => {
    const flashed = stateOf([session(TODAY, { climbs: [climb('V4', { count: 4, style: 'flash' })] })]);
    const onsighted = stateOf([session(TODAY, { climbs: [climb('V4', { count: 2, style: 'onsight' })] })]);
    const points = (s: ReturnType<typeof stateOf>) =>
      deriveStats({ state: s }).TEC.contributions.find((c) => c.label === 'Clean first goes')!.points;
    expect(points(onsighted)).toBe(points(flashed));
  });

  it('applies Rust to technique when the week was missed with no streak', () => {
    // Weeks that all meet the target: no rust.
    const consistent = deriveStats({ state: stateOf(fullWeeks(4)) }).TEC;
    expect(consistent.debuff).toBeUndefined();

    // One old session and nothing since.
    const lapsed = deriveStats({ state: stateOf([session(addDays(TODAY, -40))]) }).TEC;
    expect(lapsed.debuff).toMatchObject({ label: 'Rust', points: RUST_PENALTY });
    expect(lapsed.value).toBe(BASE_STAT - RUST_PENALTY + roundedPoints(lapsed.contributions));
  });

  it('does not rust a climber who has logged nothing at all', () => {
    expect(deriveStats({ state: stateOf([]) }).TEC.debuff).toBeUndefined();
  });
});

function roundedPoints(contributions: { points: number }[]): number {
  return Math.round(contributions.reduce((sum, c) => sum + c.points, 0));
}

describe('vitality', () => {
  const fresh = stateOf([session(addDays(TODAY, -10))]);

  it('scales its ceiling with endurance', () => {
    expect(deriveVitality({ state: fresh, endurance: 10 }).max).toBe(VITALITY_FLOOR);
    expect(deriveVitality({ state: fresh, endurance: 100 }).max).toBe(VITALITY_CEILING);
    expect(deriveVitality({ state: fresh, endurance: 55 }).max).toBe(300);
  });

  it('is full when nothing is wrong', () => {
    const v = deriveVitality({ state: fresh, endurance: 50 });
    expect(v.current).toBe(v.max);
    expect(v.state).toBe('fresh');
    expect(v.penalties).toEqual([]);
  });

  it('drains harder the longer the run of training days', () => {
    // Warmed up, so the only penalty in play is the run of days.
    const run = (days: number) =>
      deriveVitality({
        state: stateOf(
          Array.from({ length: days }, (_, i) => session(addDays(TODAY, -i), { warmup: true })),
        ),
        endurance: 100,
      });
    expect(run(2).penalties).toEqual([]);
    expect(run(3).penalties[0]!.points).toBe(GRIND_COST[3]);
    expect(run(5).penalties[0]!.points).toBe(GRIND_COST[5]);
    // Past six it holds rather than running away.
    expect(run(9).penalties[0]!.points).toBe(GRIND_COST[6]);
  });

  it('charges for skipped warmups only while they are recent', () => {
    const recent = stateOf([session(addDays(TODAY, -2), { warmup: false })]);
    const old = stateOf([session(addDays(TODAY, -30), { warmup: false })]);
    expect(deriveVitality({ state: recent, endurance: 100 }).penalties[0]!.points).toBe(SKIPPED_WARMUP_COST);
    expect(deriveVitality({ state: old, endurance: 100 }).penalties).toEqual([]);
  });

  it('charges for each active injury', () => {
    const v = deriveVitality({ state: fresh, endurance: 100, injuries: ['shoulder', 'pulley'] });
    expect(v.penalties[0]!.points).toBe(2 * INJURY_COST);
  });

  it('softens the damage after a logged rest day', () => {
    const rest = session(TODAY, {
      restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true },
    });
    const hurt = { state: fresh, endurance: 100, injuries: ['shoulder'] };
    const rested = { state: stateOf([session(addDays(TODAY, -10)), rest]), endurance: 100, injuries: ['shoulder'] };
    const a = deriveVitality(hurt);
    const b = deriveVitality(rested);
    expect(b.buff).toMatchObject({ factor: REST_RELIEF });
    expect(b.current).toBeGreaterThan(a.current);
    expect(a.max - a.current).toBe(INJURY_COST);
    expect(b.max - b.current).toBe(Math.round(INJURY_COST / REST_RELIEF));
  });

  it('offers no buff when there is no damage to soften', () => {
    const rest = session(TODAY, {
      restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true },
    });
    expect(deriveVitality({ state: stateOf([rest]), endurance: 50 }).buff).toBeUndefined();
  });

  it('never drops below zero, however bad it gets', () => {
    const grinding = stateOf(
      Array.from({ length: 9 }, (_, i) => session(addDays(TODAY, -i), { warmup: false })),
    );
    const v = deriveVitality({ state: grinding, endurance: 10, injuries: ['a', 'b', 'c', 'd'] });
    expect(v.current).toBe(0);
    expect(v.state).toBe('cooked');
    expect(v.fraction).toBe(0);
  });

  it('always names every reason it dropped', () => {
    const v = deriveVitality({
      state: stateOf(Array.from({ length: 4 }, (_, i) => session(addDays(TODAY, -i), { warmup: false }))),
      endurance: 100,
      injuries: ['elbow'],
    });
    expect(v.penalties.map((p) => p.label)).toEqual([
      '4 training days in a row',
      '4 warmups skipped this week',
      '1 active injury',
    ]);
    expect(v.max - v.current).toBe(v.penalties.reduce((sum, p) => sum + p.points, 0));
  });
});
