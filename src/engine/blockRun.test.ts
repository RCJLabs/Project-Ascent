import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import type { MetricEntry } from '@/db/metrics';
import type { Session } from '@/db/sessions';
import { blockAdherence } from './adherence';
import { blockDay, blockEnd, describeBlockEnd } from './blockEnd';
import { pauses, pausedOn, runAdherence, runDrift, runSessions, runSince, segmentsOf } from './blockRun';
import { blockId, moveBlockStart, pickUp, type BlockRecord } from './blocks';
import { addDays, programWeek } from './dates';
import { lastBlockFor } from './finderHistory';
import { plannedDay } from './plan';
import { planVsLog } from './planVsLog';
import { planFromLayout } from './weekLayouts';

/**
 * A block picked up again is one run (PLAN.md M369).
 *
 * Iron Grip from a Sunday, every session it placed done for six weeks, then
 * a stretch off, then back. The coach's two rules: a stop and a resume make
 * the stretch a pause, which counts for nothing; a gap with no stop, picked
 * up through M149's card, stays in the block and is missed.
 */

const IG = getProgram('iron_grip')!;
const PLAN = planFromLayout(IG.recommendedLayout!);
const S = '2026-03-01'; // a Sunday: week one starts on it
const week = (n: number, day = 0) => addDays(S, (n - 1) * 7 + day);

function session(date: string, sessionTypeId: string): Session {
  return { id: `${date}#0`, date, completed: true, programId: 'iron_grip', sessionTypeId, climbs: [] } as unknown as Session;
}
/** Every session a start's plan placed between two days. */
function asPlanned(start: string, from: string, to: string): Session[] {
  const out: Session[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = plannedDay(IG, start, PLAN, d);
    if (day.sessionType && !day.isRest) out.push(session(d, day.sessionType.id));
  }
  return out;
}
const row = (patch: Partial<BlockRecord> = {}): BlockRecord => ({
  id: blockId('iron_grip', S), programId: 'iron_grip', name: 'Iron Grip', startDate: S, weeks: 12, plan: PLAN, endedAt: null, ...patch,
});

describe('pickUp', () => {
  it('resumes a block stopped mid-week at the week it was on', () => {
    const stopped = row({ endedAt: week(6, 3), reason: 'stopped' }); // a Wednesday in week six
    const today = week(10, 2);
    const picked = pickUp(stopped, today)!;
    expect(programWeek(picked.startDate, today, 12)).toBe(6);
    expect(picked.resumed).toEqual([{ on: today, weeks: 4, stoppedOn: week(6, 3) }]);
    expect(picked.endedAt).toBeNull();
    expect(picked.reason).toBeUndefined();
    expect(picked.id).toBe(blockId('iron_grip', picked.startDate));
  });

  it('resumes at the next week when the stop came on the last day of one', () => {
    const today = week(11, 1);
    const picked = pickUp(row({ endedAt: week(6, 6), reason: 'stopped' }), today)!;
    expect(programWeek(picked.startDate, today, 12)).toBe(7);
  });

  it('leaves alone what has nothing to pick up', () => {
    expect(pickUp(row(), week(10)), 'a block still open').toBeNull();
    expect(pickUp(row({ endedAt: week(12, 6) }), week(20)), 'one that ran its course').toBeNull();
    expect(pickUp(row({ endedAt: week(6, 3), reconstructed: true }), week(10)), 'one whose end is a guess').toBeNull();
    expect(pickUp(row({ endedAt: week(6, 3) }), week(6, 5)), 'one resumed in the week it stopped').toBeNull();
  });
});

describe('a block stopped and resumed', () => {
  const D = week(6, 6); // stopped at the end of week six
  const R = week(11, 0); // resumed four weeks later, at week seven
  const picked = pickUp(row({ endedAt: D, reason: 'stopped' }), R)!;
  const before = asPlanned(S, S, D);
  const after = asPlanned(picked.startDate, R, addDays(R, 13)); // two more weeks, as planned
  const offPlan = [session(week(8, 2), 'perf'), session(week(9, 4), 'fp')]; // climbing in the pause
  const LOG = [...before, ...offPlan, ...after];
  const today = addDays(R, 13);

  it('is two stretches, with the pause in neither', () => {
    expect(segmentsOf(picked)).toEqual([
      { startDate: S, until: D },
      { startDate: picked.startDate, since: R, until: null },
    ]);
    expect(runSince(picked)).toBe(S);
    expect(pausedOn(picked, week(8, 2))).toBe(true);
    expect(pausedOn(picked, D)).toBe(false);
    expect(pausedOn(picked, R)).toBe(false);
    expect(runSessions(picked, LOG)).toHaveLength(before.length + after.length);
    expect(pauses(picked)).toEqual([{ after: D, weeks: 4 }]);
  });

  it('counts every session the plan placed, and nothing in the pause', () => {
    const run = runAdherence({ program: IG, plan: PLAN, sessions: LOG, today }, picked)!;
    expect(run.planned).toBe(before.length + after.length);
    expect(run.done).toBe(run.planned);
    expect(run.unplanned, 'climbing in the pause counted as this block').toBe(0);
    // Measured as one window from the moved start, as before M369: the first
    // weeks gone, and the pause counted as weeks of the block.
    const single = blockAdherence({ program: IG, startDate: picked.startDate, plan: PLAN, sessions: LOG, today })!;
    expect(single.done).toBeLessThan(run.done);
  });

  it('keeps its week-one baseline', () => {
    const entries = [
      { id: 'a', metricId: 'dead_hang', date: week(1, 2), value: 60 },
      { id: 'b', metricId: 'dead_hang', date: week(8, 2), value: 90 }, // taken in the pause
      { id: 'c', metricId: 'dead_hang', date: addDays(R, 9), value: 70 },
    ] as unknown as MetricEntry[];
    const end = blockEnd({ program: IG, startDate: picked.startDate, entries, today, record: picked });
    const hang = end.report!.results.find((r) => r.metric.id === 'dead_hang')!;
    expect(hang.baseline?.value).toBe(60);
    expect(hang.latest?.value, 'a reading from the pause was read as this block').toBe(70);
    expect(hang.moved).toBe('better');
  });

  it('does not take a reading from the pause for a retest', () => {
    const entries = [
      { id: 'a', metricId: 'dead_hang', date: week(1, 2), value: 60 },
      { id: 'b', metricId: 'dead_hang', date: week(8, 2), value: 90 },
    ] as unknown as MetricEntry[];
    const end = blockEnd({ program: IG, startDate: picked.startDate, entries, today, record: picked });
    expect(end.report!.results.find((r) => r.metric.id === 'dead_hang')!.gap).toBe('once-only');
  });

  it('dates its test weeks by where its start is now', () => {
    // The plan from here is counted from the moved start, so the final test
    // week is the run's last, not four weeks before it.
    const end = blockEnd({ program: IG, startDate: picked.startDate, entries: [], today, record: picked });
    const final = end.report!.tests.find((t) => t.why === 'final')!;
    expect(final.to).toBe(end.report!.to);
  });

  it('says it was paused, and for how long', () => {
    const end = blockEnd({ program: IG, startDate: picked.startDate, entries: [], today, record: picked });
    expect(describeBlockEnd(end, { sessions: true, numbers: true, next: true })).toContain(
      ` It was paused for 4 weeks from ${blockDay(D)}, and those weeks are not counted.`,
    );
  });

  it('is what the finder hears about it', () => {
    const closed = { ...picked, endedAt: today };
    expect(lastBlockFor([closed], LOG, addDays(today, 1))?.adherence).toEqual({
      done: before.length + after.length,
      planned: before.length + after.length,
    });
  });
});

describe('a block picked up without a stop (M149)', () => {
  // Six weeks done, two weeks with nothing, picked up by moving the start
  // two weeks so today is week seven again.
  const R = week(9, 0);
  const open = row();
  const moved = moveBlockStart([open], 'iron_grip', addDays(S, 14), R)[0]!;
  const before = asPlanned(S, S, week(6, 6));
  const after = asPlanned(moved.startDate, R, addDays(R, 6));
  const LOG = [...before, ...after];
  const today = addDays(R, 6);

  it('records the pick-up, with no stop', () => {
    expect(moved.resumed).toEqual([{ on: R, weeks: 2 }]);
    expect(moved.id).toBe(blockId('iron_grip', addDays(S, 14)));
  });

  it('keeps the gap in the block, missed, and the weeks before it', () => {
    expect(segmentsOf(moved)).toEqual([
      { startDate: S, until: addDays(R, -1) },
      { startDate: moved.startDate, since: R, until: null },
    ]);
    const run = runAdherence({ program: IG, plan: PLAN, sessions: LOG, today }, moved)!;
    const gap = asPlanned(S, week(7), week(8, 6)).length;
    expect(gap).toBeGreaterThan(0);
    expect(run.planned).toBe(before.length + gap + after.length);
    expect(run.done).toBe(before.length + after.length);
  });

  it('keeps its week-one baseline', () => {
    const entries = [{ id: 'a', metricId: 'dead_hang', date: week(1, 2), value: 60 }] as unknown as MetricEntry[];
    const end = blockEnd({ program: IG, startDate: moved.startDate, entries, today, record: moved });
    expect(end.report!.results.find((r) => r.metric.id === 'dead_hang')!.gap).toBe('once-only');
  });

  it('names no pause', () => {
    expect(pauses(moved)).toEqual([]);
    const end = blockEnd({ program: IG, startDate: moved.startDate, entries: [], today, record: moved });
    expect(describeBlockEnd(end, { sessions: true, numbers: true, next: true })).not.toMatch(/paused/);
  });

  it('reads drift for each stretch against its own weeks', () => {
    // Week four is Iron Grip's deload, and this climber took it light. Read
    // from the moved start, program week four is calendar week six — a full
    // week — and the deload reads as skipped.
    const timed = (list: Session[]) =>
      list.map((x) => ({ ...x, rpe: 8, durationMin: x.date >= week(4) && x.date <= week(4, 6) ? 40 : 90 }) as Session);
    const log = [...timed(before), ...timed(after)];
    const deloadWeek4 = (f: { kind: string; subject: string }) => f.kind === 'deload' && f.subject === 'Week 4';
    expect(planVsLog({ program: IG, startDate: moved.startDate, sessions: log, today }).some(deloadWeek4), 'the fixture shows nothing').toBe(true);
    expect(runDrift({ program: IG, sessions: log, today }, moved).some(deloadWeek4)).toBe(false);
  });
});

describe('a block never picked up', () => {
  it('is one stretch, measured as before', () => {
    const closed = row({ endedAt: week(6, 6), reason: 'stopped' });
    expect(segmentsOf(closed)).toEqual([{ startDate: S, until: week(6, 6) }]);
    const log = asPlanned(S, S, week(6, 6));
    expect(runAdherence({ program: IG, plan: PLAN, sessions: log, today: week(20) }, closed)).toEqual(
      blockAdherence({ program: IG, startDate: S, plan: PLAN, sessions: log, today: week(20), until: week(6, 6) }),
    );
  });
});
