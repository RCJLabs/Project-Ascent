import { beforeAll, describe, expect, it } from 'vitest';
import { getDrill } from '@/content/drills';
import { loadPrograms } from '@/content/programs';
import { GRAVITY_DEFIED, GROUND_ZERO, IRON_GRIP, PEAK_PERFORMANCE } from '@/content/programs/catalogue';
import type { Program } from '@/content/types';
import { newSession, type Session } from '@/db/sessions';
import { addDays, dayOfWeek, startOfWeek } from './dates';
import { DELOAD_STEP } from './plan';
import { intensityOf, type WeekPlan } from './scheduler';
import { describeWeekDays, nextLimitDay, weekOutline, type WeekOutline } from './week';

/**
 * The week, as the program sees it (PLAN.md M135).
 *
 * Every fact a program states is per week and the app showed a day, a
 * month and a block. This is the reading the week screen and Home's card
 * share, held against real catalogue programs on real dates: the status of
 * a day, the count over the week, what the week asks that the last one did
 * not, and the deload, test and drill it carries.
 */

/** A Wednesday, so the week has days on both sides of "today". */
const TODAY = '2026-09-16';
const SUNDAY = startOfWeek(TODAY);
const DOW = dayOfWeek(TODAY);

beforeAll(async () => {
  await loadPrograms();
});

const done = (date: string, patch: Partial<Session> = {}): Session =>
  newSession(date, 0, { completed: true, ...patch });

/** A block whose week `week` is the one containing TODAY. */
const startedFor = (week: number): string => addDays(SUNDAY, -(week - 1) * 7);

function outline(
  program: Program | undefined,
  plan: WeekPlan | undefined,
  sessions: Session[] = [],
  patch: Partial<Parameters<typeof weekOutline>[0]> = {},
): WeekOutline {
  return weekOutline({
    date: TODAY,
    today: TODAY,
    sessions,
    program,
    startDate: program ? startedFor(1) : undefined,
    plan,
    ...patch,
  });
}

const on = (o: WeekOutline, date: string) => o.days.find((d) => d.date === date)!;

describe('what a day is', () => {
  const plan: WeekPlan = { [DOW]: 'fp', [(DOW + 1) % 7]: 'perf', [(DOW + 6) % 7]: 'fp' } as WeekPlan;

  it('is today when today is planned and nothing has happened yet', () => {
    expect(on(outline(IRON_GRIP, plan), TODAY).status).toBe('today');
  });

  it('is missed when a planned day has gone by empty', () => {
    expect(on(outline(IRON_GRIP, plan), addDays(TODAY, -1)).status).toBe('missed');
  });

  it('is planned when the day is still to come', () => {
    expect(on(outline(IRON_GRIP, plan), addDays(TODAY, 1)).status).toBe('planned');
  });

  it('is rest when nothing is planned and nothing was logged', () => {
    // Saturday is three days on from a Wednesday and carries nothing.
    expect(on(outline(IRON_GRIP, plan), addDays(TODAY, 3)).status).toBe('rest');
  });

  it('is rest when the plan places a rest session', () => {
    // Iron Grip has a rest type; placing it is not placing training.
    const withRest: WeekPlan = { ...plan, [(DOW + 3) % 7]: 'rest' } as WeekPlan;
    const d = on(outline(IRON_GRIP, withRest), addDays(TODAY, 3));
    expect(d.status).toBe('rest');
    expect(d.training).toBe(false);
    expect(d.spent).toBeNull();
  });

  it('is done once a session is finished, whatever the plan said', () => {
    // A climber who trained on a rest day did train.
    const o = outline(IRON_GRIP, plan, [done(addDays(TODAY, 3))]);
    expect(on(o, addDays(TODAY, 3)).status).toBe('done');
  });

  it('is started while a session exists and is not finished', () => {
    const o = outline(IRON_GRIP, plan, [newSession(TODAY, 0, { completed: false })]);
    expect(on(o, TODAY).status).toBe('started');
  });

  it('reads the plan through a week override', () => {
    const moved: WeekPlan = { [(DOW + 2) % 7]: 'fp' } as WeekPlan;
    const o = outline(IRON_GRIP, plan, [], { overrides: { [SUNDAY]: moved } });
    expect(on(o, TODAY).status).toBe('rest');
    expect(on(o, addDays(TODAY, 2)).day?.sessionType?.id).toBe('fp');
  });

  it('carries every record on the day', () => {
    const o = outline(IRON_GRIP, plan, [done(TODAY), newSession(TODAY, 1, { completed: false })]);
    expect(on(o, TODAY).sessions).toHaveLength(2);
  });
});

describe('the count over the week', () => {
  const plan: WeekPlan = { [DOW]: 'fp', [(DOW + 1) % 7]: 'perf', [(DOW + 6) % 7]: 'fp' } as WeekPlan;

  it('counts the days the plan places a session on', () => {
    expect(outline(IRON_GRIP, plan).planned).toBe(3);
  });

  it('does not count a planned rest day', () => {
    const withRest: WeekPlan = { ...plan, [(DOW + 3) % 7]: 'rest' } as WeekPlan;
    expect(outline(IRON_GRIP, withRest).planned).toBe(3);
  });

  it('counts a finished session on a planned day as done', () => {
    expect(outline(IRON_GRIP, plan, [done(TODAY)]).done).toBe(1);
  });

  it('counts a finished session on an unplanned day as extra, not done', () => {
    const o = outline(IRON_GRIP, plan, [done(addDays(TODAY, 3))]);
    expect(o.done).toBe(0);
    expect(o.extra).toBe(1);
  });

  it('does not count a logged rest as extra', () => {
    // Recovery is training to log, and not a session the plan left out.
    const rest = done(addDays(TODAY, 3), {
      restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true },
      climbs: [],
    });
    expect(outline(IRON_GRIP, plan, [rest]).extra).toBe(0);
  });

  it('says the count in the week’s tense', () => {
    // The plan places today (done), yesterday (missed) and tomorrow, so
    // one is to come.
    const current = outline(IRON_GRIP, plan, [done(TODAY)]);
    expect(describeWeekDays(current, TODAY)).toBe('1 of 3 training days done, 1 to come');
    // Today counts as still to come until something happens on it.
    expect(describeWeekDays(outline(IRON_GRIP, plan), TODAY)).toBe('0 of 3 training days done, 2 to come');
    expect(describeWeekDays(current, addDays(TODAY, 7))).toBe('1 of 3 training days done');
    expect(describeWeekDays(current, addDays(TODAY, -7))).toBe('3 training days planned');
  });

  it('mentions the unplanned ones', () => {
    const o = outline(IRON_GRIP, plan, [done(addDays(TODAY, 3))]);
    expect(describeWeekDays(o, addDays(TODAY, 7))).toBe('0 of 3 training days done, and 1 unplanned');
  });

  it('uses the singular for one', () => {
    const one: WeekPlan = { [DOW]: 'fp' } as WeekPlan;
    expect(describeWeekDays(outline(IRON_GRIP, one), addDays(TODAY, -7))).toBe('1 training day planned');
  });

  it('says nothing for a week the plan puts nothing in', () => {
    expect(describeWeekDays(outline(IRON_GRIP, {}), TODAY)).toBeNull();
  });
});

describe('the week’s facts', () => {
  const plan: WeekPlan = { 1: 'fp', 3: 'perf', 5: 'fp' };
  const inWeek = (week: number, program: Program = IRON_GRIP, p: WeekPlan = plan) =>
    outline(program, p, [], { startDate: startedFor(week) });

  it('says which week and which phase', () => {
    const o = inWeek(6);
    expect(o.week).toBe(6);
    expect(o.phase?.name).toBe('The Hammer (Max Hangs)');
  });

  it('knows a deload week and that it took something off', () => {
    const o = inWeek(4);
    expect(o.isDeload).toBe(true);
    expect(o.lightened).toBe(true);
  });

  it('carries the program’s own step for the week, in its words', () => {
    // Iron Grip writes week two of the Anvil down; the text is the
    // catalogue's, not this module's.
    const fp = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!;
    const authored = fp.blocks!.find((b) => b.name === 'Finger Protocol')!.perPhase.anvil!.perWeek!.find(
      (w) => w.week === 2,
    )!.step;
    const o = inWeek(2);
    expect(o.steps.map((s) => s.step)).toContain(authored);
    expect(o.steps.find((s) => s.step === authored)?.type.id).toBe('fp');
  });

  it('says a step once for a type placed twice in the week', () => {
    // Monday and Friday are both Finger Protocol; the step is one sentence.
    const o = inWeek(2);
    expect(o.steps.filter((s) => s.type.id === 'fp')).toHaveLength(1);
  });

  it('keeps the derived deload out of the steps and says it separately', () => {
    const o = inWeek(4);
    expect(o.steps.map((s) => s.step)).not.toContain(DELOAD_STEP);
    // The authored deload line for the finger block is still a step.
    expect(o.steps.some((s) => /Deload\./.test(s.step))).toBe(true);
  });

  it('can be a deload week with nothing to take off', () => {
    // Peak Performance deloads on week 5; a week of only climbing sessions
    // has no sets to give and no step written for it.
    const o = inWeek(5, PEAK_PERFORMANCE, { 2: 'perf' });
    expect(o.isDeload).toBe(true);
    expect(o.lightened).toBe(false);
    expect(o.steps).toEqual([]);
  });

  it('names the test week and why', () => {
    expect(inWeek(1).test).toBe('baseline');
    expect(inWeek(5).test).toBe('phase');
    expect(inWeek(12).test).toBe('final');
    expect(inWeek(6).test).toBeUndefined();
  });

  it('lists the drill a session carries this week, by name', () => {
    const o = inWeek(1, GRAVITY_DEFIED, { 2: 'tech' });
    expect(o.drills.map((d) => d.drill.name)).toEqual([getDrill('vertical_deadpoint')!.name]);
    expect(o.drills[0]!.type.id).toBe('tech');
  });

  it('estimates how long a planned day runs, and nothing for a rest day', () => {
    const o = inWeek(2);
    expect(on(o, addDays(SUNDAY, 1)).spent).toMatch(/about \d+/);
    expect(on(o, addDays(SUNDAY, 0)).spent).toBeNull();
  });

  it('counts what a day loads of what is hurt', () => {
    // M89's fixture: Ground Zero's structural day loads an elbow three ways.
    const o = outline(GROUND_ZERO, { [DOW]: 'str' } as WeekPlan, [], { injured: ['elbow'] });
    expect(on(o, TODAY).load.conflicts).toHaveLength(3);
    expect(on(o, addDays(TODAY, 1)).load.conflicts).toHaveLength(0);
  });
});

describe('outside the block', () => {
  it('is before, with no week, when the block has not started', () => {
    const o = outline(IRON_GRIP, { 1: 'fp' }, [], { startDate: addDays(SUNDAY, 7) });
    expect(o.before).toBe(true);
    expect(o.over).toBe(false);
    expect(o.week).toBeNull();
    expect(o.planned).toBe(0);
  });

  it('is over when the block has finished', () => {
    const o = outline(IRON_GRIP, { 1: 'fp' }, [], { startDate: startedFor(13) });
    expect(o.over).toBe(true);
    expect(o.before).toBe(false);
    expect(o.planned).toBe(0);
  });

  it('is a week of the log when no program is running', () => {
    const o = outline(undefined, undefined, [done(TODAY)]);
    expect(o.before).toBe(false);
    expect(o.over).toBe(false);
    expect(on(o, TODAY).day).toBeUndefined();
    expect(on(o, TODAY).status).toBe('done');
    expect(on(o, addDays(TODAY, 1)).status).toBe('rest');
    expect(o.planned).toBe(0);
    expect(o.extra).toBe(1);
  });
});

describe('the hardest day still to come', () => {
  it('is the next limit day, as the calendar marks it', () => {
    // Peak Performance's climbing day is a limit day; Iron Grip's finger
    // day is hard and not the hardest.
    expect(intensityOf(PEAK_PERFORMANCE.sessionTypes.find((t) => t.id === 'perf'))).toBe('max');
    const o = outline(PEAK_PERFORMANCE, { [(DOW + 2) % 7]: 'perf', [DOW]: 'fp' } as WeekPlan);
    expect(nextLimitDay(o)?.date).toBe(addDays(TODAY, 2));
  });

  it('is nothing once the limit day has gone', () => {
    const o = outline(PEAK_PERFORMANCE, { [(DOW + 6) % 7]: 'perf' } as WeekPlan);
    expect(nextLimitDay(o)).toBeNull();
  });

  it('is nothing when the limit day is already done', () => {
    const o = outline(PEAK_PERFORMANCE, { [DOW]: 'perf' } as WeekPlan, [done(TODAY)]);
    expect(nextLimitDay(o)).toBeNull();
  });

  it('is nothing for a program whose hardest day is merely hard', () => {
    const o = outline(IRON_GRIP, { [(DOW + 1) % 7]: 'fp' } as WeekPlan);
    expect(nextLimitDay(o)).toBeNull();
  });
});
