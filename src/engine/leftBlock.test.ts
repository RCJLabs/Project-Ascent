import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import type { Session } from '@/db/sessions';
import type { MetricEntry } from '@/db/metrics';
import { blockAdherence } from './adherence';
import { blockReport } from './blockReport';
import { addDays } from './dates';
import { lastBlockFor } from './finderHistory';
import { blockThrough, blockWindow, plannedDay } from './plan';
import { planVsLog } from './planVsLog';
import { planFromLayout } from './weekLayouts';
import type { BlockRecord } from './blocks';

/**
 * A block the climber left is measured to the day they left (PLAN.md M365).
 *
 * Iron Grip, run to the letter for six weeks and then left for Peak
 * Performance — the first successor Iron Grip itself suggests, which shares
 * two of its session types and four of its assessments. Everything after
 * the sixth week is the next block's, and was being counted as this one's.
 */

const IG = getProgram('iron_grip')!;
const PP = getProgram('peak_performance')!;
const START = '2026-03-01'; // a Sunday, so week one starts on it
const LEFT = addDays(START, 41); // the last day of week six
const NEXT = addDays(LEFT, 1);
const TODAY = addDays(START, 20 * 7);
const IG_PLAN = planFromLayout(IG.recommendedLayout!);
const PP_PLAN = planFromLayout(PP.recommendedLayout!);

function session(date: string, programId: string, sessionTypeId: string, patch: Partial<Session> = {}): Session {
  return {
    id: `${date}#0`, date, planned: false, completed: true, rewarded: true, mode: 'indoor',
    durationMin: 90, warmup: true, drillDone: false, rpe: 8, programId, sessionTypeId, climbs: [],
    createdAt: `${date}T18:00:00.000Z`, updatedAt: `${date}T18:00:00.000Z`, ...patch,
  } as Session;
}

/** Every session the plan placed, from `from` to `to`. */
function asPlanned(program: typeof IG, start: string, plan: typeof IG_PLAN, from: string, to: string, patch: Partial<Session> = {}): Session[] {
  const out: Session[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = plannedDay(program, start, plan, d);
    if (day.sessionType && !day.isRest) out.push(session(d, program.id, day.sessionType.id, patch));
  }
  return out;
}

const SIX_WEEKS = asPlanned(IG, START, IG_PLAN, START, LEFT);
const AFTER = asPlanned(PP, NEXT, PP_PLAN, NEXT, TODAY);
const LOG = [...SIX_WEEKS, ...AFTER];

const entry = (metricId: string, date: string, value: number) => ({ id: `${metricId}@${date}`, metricId, date, value }) as unknown as MetricEntry;
const READINGS = [
  entry('max_hang_20mm_7s', addDays(START, 2), 40),
  entry('weighted_pullup_3rm', addDays(START, 2), 30),
  // Peak Performance's own baselines, three days after the climber left.
  entry('max_hang_20mm_7s', addDays(NEXT, 2), 48),
  // Outside the 5 lbs band either way (PLAN.md M367), so uncut they read
  // as moved.
  entry('weighted_pullup_3rm', addDays(NEXT, 2), 22.5),
];

describe('blockThrough', () => {
  it('is the earliest of today, the last day, and the day the climber left', () => {
    expect(blockThrough('2026-06-01', '2026-05-01')).toBe('2026-05-01');
    expect(blockThrough('2026-06-01', '2026-07-01')).toBe('2026-06-01');
    expect(blockThrough('2026-06-01', '2026-07-01', '2026-04-11')).toBe('2026-04-11');
    expect(blockThrough('2026-06-01', '2026-03-01', '2026-04-11'), 'a cutoff after today moved it').toBe('2026-03-01');
    expect(blockThrough('2026-06-01', '2026-07-01', '2026-06-20'), 'a block run past its end was cut late').toBe('2026-06-01');
    expect(blockThrough('2026-06-01', '2026-07-01', null)).toBe('2026-06-01');
  });
});

describe('a block left in week six of twelve', () => {
  it('counts the sessions of the weeks the climber was on it, and only theirs', () => {
    expect(SIX_WEEKS).toHaveLength(24);
    const before = blockAdherence({ program: IG, startDate: START, plan: IG_PLAN, sessions: LOG, today: TODAY });
    // What it said: half the weeks missed, and the next program's matching
    // sessions counted as done.
    expect(before!.planned).toBe(48);
    const after = blockAdherence({ program: IG, startDate: START, plan: IG_PLAN, sessions: LOG, today: TODAY, until: LEFT });
    expect(after!.planned).toBe(24);
    expect(after!.done).toBe(24);
    expect(after!.unplanned, 'the next block\'s sessions were counted as unplanned here').toBe(0);
  });

  it("does not take the next block's baselines for its retests", () => {
    const report = blockReport({ program: IG, startDate: START, entries: READINGS, today: TODAY, until: LEFT })!;
    const hang = report.results.find((r) => r.metric.id === 'max_hang_20mm_7s')!;
    expect(hang.gap).toBe('once-only');
    expect(hang.latest).toBeNull();
    expect(report.better + report.worse + report.flat).toBe(0);
    // And without the cutoff, the fault this pins.
    const uncut = blockReport({ program: IG, startDate: START, entries: READINGS, today: TODAY })!;
    expect(uncut.better + uncut.worse).toBe(2);
  });

  it('keeps a retest taken on the day it was left', () => {
    const report = blockReport({
      program: IG, startDate: START, today: TODAY, until: LEFT,
      entries: [...READINGS, entry('max_hang_20mm_7s', LEFT, 47.5)],
    })!;
    expect(report.results.find((r) => r.metric.id === 'max_hang_20mm_7s')!.moved).toBe('better');
  });

  it('reads its drift from its own weeks', () => {
    // The next block's sessions, rated and timed nothing like Iron Grip's,
    // under Iron Grip's own type ids — so drift read past the cutoff finds
    // something to say.
    const odd = asPlanned(PP, NEXT, PP_PLAN, NEXT, TODAY, { rpe: 2, durationMin: 400 });
    const input = { program: IG, startDate: START, sessions: [...SIX_WEEKS, ...odd], today: TODAY };
    const cut = planVsLog({ ...input, until: LEFT });
    expect(cut).toEqual(planVsLog({ ...input, sessions: SIX_WEEKS, today: LEFT }));
    expect(planVsLog(input), 'the after-weeks said nothing, so this test cannot see the cutoff').not.toEqual(cut);
  });

  it('is what the finder hears about the last block', () => {
    const row: BlockRecord = {
      id: `iron_grip#${START}`, programId: 'iron_grip', name: 'Iron Grip', startDate: START,
      weeks: 12, plan: IG_PLAN, endedAt: LEFT, reason: 'switched',
    };
    const history = lastBlockFor([row], LOG, TODAY)!;
    expect(history.adherence).toEqual({ done: 24, planned: 24 });
  });

  it('changes nothing for a block run to its end', () => {
    const { to } = blockWindow(IG, START);
    const full = asPlanned(IG, START, IG_PLAN, START, to);
    const a = blockAdherence({ program: IG, startDate: START, plan: IG_PLAN, sessions: full, today: TODAY });
    const b = blockAdherence({ program: IG, startDate: START, plan: IG_PLAN, sessions: full, today: TODAY, until: to });
    expect(b).toEqual(a);
    expect(b!.planned).toBe(48);
  });
});
