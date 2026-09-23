/**
 * The sample climber's tests inside the block (PLAN.md M325).
 *
 * Before this the running block had no reading in it at all: two benchmarks
 * every eight weeks, both before the block started, so the block report read
 * nine tests and nought of them taken. Now the climber takes the battery the
 * way the day's nudge tells them to — each test on the session the plan gives
 * it, a missed one on the next session of the same kind, and nothing that
 * loads the elbow they told the app about.
 *
 * Swept over a week of pinned days, like `demoPlanned.test.ts`, because what
 * has elapsed depends on the weekday.
 */

import { describe, expect, it } from 'vitest';
import { getMetric } from '@/content/metrics';
import { getProgram } from '@/content/programs';
import { metricConflict } from './bodyLoad';
import { blockReport } from './blockReport';
import { demoClimber } from './demoClimber';
import { concerning, injuryPolicy } from './injury';
import { addDays } from './dates';
import { plannedDay } from './plan';
import { testWeek } from './testDays';

const WEEK = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'];
const IRON_GRIP = getProgram('iron_grip')!;

/**
 * The sample climber on every weekday, and a dozen other climbers on one.
 *
 * The seed decides which sessions were missed, and the one the app ships
 * with misses only a Wednesday in the weeks that test — so on it alone a
 * make-up, a carried finger test and a carried grade on an unsent top
 * problem are all paths no assertion reaches.
 */
const CASES: { today: string; seed?: number }[] = [
  ...WEEK.map((today) => ({ today })),
  ...Array.from({ length: 12 }, (_, i) => ({ today: '2026-09-23', seed: i + 1 })),
];
const climber = ({ today, seed }: { today: string; seed?: number }) =>
  seed === undefined ? demoClimber(today) : demoClimber(today, seed);
const label = ({ today, seed }: { today: string; seed?: number }) => `${today}${seed === undefined ? '' : ` seed ${seed}`}`;

describe('the tests inside the running block', () => {
  it('are taken, in the baseline week and the phase one', () => {
    for (const c of CASES) {
      const demo = climber(c);
      const today = label(c);
      const inBlock = demo.metrics.filter((m) => m.date >= demo.startDate);
      const weeks = new Set(inBlock.map((m) => plannedDay(IRON_GRIP, demo.startDate, demo.plan, m.date).week));
      expect([...weeks].sort(), today).toEqual([1, 5]);
    }
  });

  it('each land on the session the plan gave them, or a later one of its kind', () => {
    for (const c of CASES) {
      const demo = climber(c);
      const today = label(c);
      for (const entry of demo.metrics.filter((m) => m.date >= demo.startDate)) {
        const week = testWeek(IRON_GRIP, demo.startDate, demo.plan, entry.date)!;
        const given = week.days.find((d) => d.metrics.some((m) => m.id === entry.metricId))!;
        const session = demo.sessions.find((s) => s.date === entry.date && s.sessionTypeId !== undefined)!;
        const where = `${today}: ${entry.metricId} on ${entry.date}`;
        // A Tuesday make-up stands in for the Monday it replaces.
        const standsIn = session.planned === false && given.date < entry.date;
        if (!standsIn) expect(session.sessionTypeId, where).toBe(given.sessionType.id);
        expect(entry.date >= given.date, where).toBe(true);
        // Once: a test taken on Monday is not taken again on Thursday.
        const again = demo.metrics.filter(
          (m) => m.metricId === entry.metricId && m.date >= week.start && m.date <= week.end,
        );
        expect(again, where).toHaveLength(1);
      }
    }
  });

  it('are all taken, bar the elbow, wherever a session of their kind happened', () => {
    // Including the ones a missed session left: Wednesday's grade, taken on
    // Saturday's climbing day, and Monday's finger tests on a Tuesday make-up.
    for (const c of CASES) {
      const demo = climber(c);
      const today = label(c);
      const hurt = concerning(injuryPolicy(demo.injuries));
      for (const start of [demo.startDate, addDays(demo.startDate, 28)]) {
        const week = testWeek(IRON_GRIP, demo.startDate, demo.plan, start)!;
        for (const day of week.days) {
          const later = demo.sessions.some(
            (s) => s.date >= day.date && s.date <= week.end && s.sessionTypeId === day.sessionType.id,
          );
          if (!later) continue;
          for (const m of day.metrics.filter((m) => metricConflict(m, hurt) === null)) {
            const taken = demo.metrics.some((e) => e.metricId === m.id && e.date >= day.date && e.date <= week.end);
            expect(taken, `${today}: ${m.id} in the week of ${start}`).toBe(true);
          }
        }
      }
    }
  });

  it('never include one that loads the elbow the climber is carrying', () => {
    for (const c of CASES) {
      const demo = climber(c);
      const hurt = concerning(injuryPolicy(demo.injuries));
      expect(hurt).toContain('elbow');
      for (const entry of demo.metrics.filter((m) => m.date >= demo.startDate)) {
        expect(metricConflict(getMetric(entry.metricId)!, hurt), `${label(c)}: ${entry.metricId}`).toBeNull();
      }
    }
  });

  it('leave the elbow ones for another day, which the battery still lists', () => {
    const demo = demoClimber('2026-09-23');
    const hurt = concerning(injuryPolicy(demo.injuries));
    const week = testWeek(IRON_GRIP, demo.startDate, demo.plan, demo.startDate)!;
    const skipped = week.days
      .flatMap((d) => d.metrics)
      .filter((m) => metricConflict(m, hurt) !== null)
      .map((m) => m.id);
    expect(skipped.sort()).toEqual(['core_lever', 'lock_off_90', 'max_pullups', 'weighted_pullup_3rm']);
  });

  it('take the grade off what the session sent', () => {
    for (const c of CASES) {
      const demo = climber(c);
      const today = label(c);
      for (const entry of demo.metrics.filter((m) => m.date >= demo.startDate && m.metricId === 'max_boulder_grade')) {
        const session = demo.sessions.find((s) => s.date === entry.date && s.sessionTypeId === 'perf')!;
        const sent = session.climbs!.filter((c) => c.result === 'send').map((c) => c.grade);
        expect(sent, today).toContain(entry.display);
        expect(sent.every((g) => Number(g.slice(1)) <= entry.value), today).toBe(true);
      }
    }
  });

  it('give the block report something to say', () => {
    for (const today of WEEK) {
      const demo = demoClimber(today);
      const report = blockReport({ program: IRON_GRIP, startDate: demo.startDate, entries: demo.metrics, today })!;
      const moved = report.results.filter((r) => r.moved !== null).map((r) => r.metric.id);
      // The four it measured twice. Which of them moved which way is the
      // generator's to say, and the plateau is part of this climber's story.
      expect(moved, today).toEqual(expect.arrayContaining(['max_hang_20mm_7s', 'repeater_weight', 'dead_hang', 'max_pushups']));
      expect(report.results.find((r) => r.metric.id === 'max_hang_20mm_7s')!.moved, today).toBe('better');
    }
  });
});
