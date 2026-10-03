// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { getProgram, loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { pickUp, type BlockRecord } from '@/engine/blocks';
import { addDays, shortLabel, startOfWeek, today } from '@/engine/dates';
import { plannedDay } from '@/engine/plan';
import { planFromLayout } from '@/engine/weekLayouts';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { showMonthOf } from '@/test/calendarMonth';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { WeekPage } from '@/features/week/WeekPage';
import { HomeHeading } from '@/features/home/HomeHeading';
import { weekOutline } from '@/engine/week';
import { DayHeading } from '@/features/log/DayHeading';
import { testWeeks } from '@/engine/testWeeks';

/**
 * The weeks of a block that was stopped and picked up again, on the two
 * screens that number weeks (PLAN.md M374).
 *
 * Iron Grip from a Sunday seven weeks back, every planned session done for
 * three weeks, stopped, and resumed a week ago Sunday. Both screens read the
 * live start, which the resume moved: the three weeks trained drew nothing
 * planned, and the three weeks stopped drew as weeks one to three, missed.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

async function resumed(stopDay = 20) {
  const IG = getProgram('iron_grip')!;
  const plan = planFromLayout(IG.recommendedLayout!);
  const S = addDays(startOfWeek(today()), -7 * 7);
  for (let d = 0; d <= stopDay; d++) {
    const date = addDays(S, d);
    const day = plannedDay(IG, S, plan, date);
    if (day.sessionType && !day.isRest) {
      await putSession({ ...newSession(date, 0, { completed: true }), programId: 'iron_grip', sessionTypeId: day.sessionType.id } as never);
    }
  }
  const stopped: BlockRecord = {
    id: `iron_grip#${S}`, programId: 'iron_grip', name: 'Iron Grip', startDate: S, weeks: 12, plan,
    endedAt: addDays(S, stopDay), reason: 'stopped',
  };
  const row = pickUp(stopped, addDays(S, 42))!;
  await hydrate();
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: row.startDate },
    plans: { iron_grip: plan },
    weekOverrides: {},
    blocks: [row],
    injuries: [],
  });
  return { S, row, IG };
}

const gutter = (sunday: string) =>
  screen.queryAllByRole('link').find((a) => (a.getAttribute('aria-label') ?? '').startsWith(`Week of ${shortLabel(sunday)}:`));

describe('the calendar', () => {
  it('draws the weeks trained before the stop as planned and done', async () => {
    const { S } = await resumed();
    renderAt('/calendar', <CalendarPage />);
    for (const week of [0, 1, 2]) {
      const sunday = addDays(S, week * 7);
      showMonthOf(sunday);
      const label = gutter(sunday)?.getAttribute('aria-label') ?? '';
      expect(label, `week ${week + 1}`).toMatch(/: (\d+) of \1 planned sessions? done/);
    }
  });

  it('draws the weeks stopped with nothing planned, so nothing missed', async () => {
    const { S } = await resumed();
    renderAt('/calendar', <CalendarPage />);
    for (const week of [3, 4, 5]) {
      const sunday = addDays(S, week * 7);
      showMonthOf(sunday);
      expect(gutter(sunday), `week of ${sunday}`).toBeUndefined();
    }
  });
});

describe('the week page', () => {
  it('numbers a week trained before the stop as the week it was', async () => {
    const { S } = await resumed();
    const start = addDays(S, 7);
    renderAt(`/week/${start}`, <WeekPage params={{ start }} />);
    expect(await screen.findByText('Week 2 of 12')).toBeTruthy();
  });

  it('says a week inside the pause was paused, and marks its days so', async () => {
    const { S } = await resumed();
    const start = addDays(S, 28);
    renderAt(`/week/${start}`, <WeekPage params={{ start }} />);
    expect(
      await screen.findByText(
        `Iron Grip was paused this week — stopped on ${shortLabel(addDays(S, 20))} and picked up again on ${shortLabel(addDays(S, 42))}. Nothing it would have placed here counts as missed.`,
      ),
    ).toBeTruthy();
    expect(screen.getAllByText('Paused')).toHaveLength(7);
    expect(screen.queryByText('Missed')).toBeNull();
  });
});

describe('a week the stop fell in', () => {
  it('says which of its days the pause took', async () => {
    // Stopped on the Wednesday of week three.
    const { S } = await resumed(17);
    const start = addDays(S, 14);
    renderAt(`/week/${start}`, <WeekPage params={{ start }} />);
    expect(await screen.findByText('Week 3 of 12')).toBeTruthy();
    expect(
      screen.getByText(`Paused from ${shortLabel(addDays(S, 18))} to ${shortLabel(addDays(S, 41))}; those days are not counted.`),
    ).toBeTruthy();
    expect(screen.getAllByText('Paused')).toHaveLength(3);
  });

  /** Home's strip says it of the day too, rather than "rest day". */
  it('is said on Home\'s strip', async () => {
    const { S, row, IG } = await resumed(17);
    const outline = weekOutline({
      date: addDays(S, 14), today: addDays(S, 16), sessions: [], program: IG, startDate: row.startDate,
      plan: planFromLayout(IG.recommendedLayout!), row,
    });
    renderAt('/', <HomeHeading date={addDays(S, 16)} outline={outline} program={IG} />);
    const labels = screen.getAllByRole('link').map((a) => a.getAttribute('aria-label') ?? '');
    expect(labels.filter((l) => / — paused$/.test(l))).toHaveLength(3);
  });
});

describe('the weeks after the resume', () => {
  it('say nothing about a pause that is over', async () => {
    const { S } = await resumed();
    const start = addDays(S, 49);
    renderAt(`/week/${start}`, <WeekPage params={{ start }} />);
    expect(await screen.findByText('Week 5 of 12')).toBeTruthy();
    expect(screen.queryByText(/Paused from/)).toBeNull();
    expect(screen.queryByText('Paused')).toBeNull();
  });
});

/**
 * Only the running program's row: an open row for another program is not
 * this block's history, whatever it says about pick-ups.
 */
describe('another program\'s row', () => {
  it('is not read for this one', async () => {
    const { S, row } = await resumed();
    useProfile.setState({
      startDates: { iron_grip: addDays(S, 21) },
      blocks: [{ ...row, id: 'other', programId: 'peak_performance', name: 'Peak Performance' }],
    });
    const start = addDays(S, 28);
    renderAt(`/week/${start}`, <WeekPage params={{ start }} />);
    expect(await screen.findByText('Week 2 of 12')).toBeTruthy();
    expect(screen.queryByText('Paused')).toBeNull();
  });
});

/**
 * The tests a week carries, and the logger's own heading, read the same run
 * (PLAN.md M374). The first screenshot of a paused week listed the block's
 * baseline tests on its paused days: the battery read the live start.
 */
describe('the rest of what numbers a day', () => {
  it('lists no tests on a paused week, and the baseline on the first week', async () => {
    const { S } = await resumed();
    const paused = addDays(S, 28);
    renderAt(`/week/${paused}`, <WeekPage params={{ start: paused }} />);
    await screen.findByText(/was paused this week/);
    expect(screen.queryAllByText(/^Test:/)).toHaveLength(0);

    renderAt(`/week/${S}`, <WeekPage params={{ start: S }} />);
    expect(await screen.findByText('Week 1 of 12')).toBeTruthy();
    expect(screen.queryAllByText(/^Test:/).length).toBeGreaterThan(0);
  });

  it('heads a logged day before the stop with its week, and a paused one with none', async () => {
    const { S } = await resumed();
    renderAt(`/log/${addDays(S, 8)}`, <DayHeading date={addDays(S, 8)} />);
    expect(screen.getByText(/^Week 2/)).toBeTruthy();
    renderAt(`/log/${addDays(S, 30)}`, <DayHeading date={addDays(S, 30)} />);
    expect(screen.queryByText(/^Week \d/)).toBeNull();
    renderAt(`/log/${addDays(S, 43)}`, <DayHeading date={addDays(S, 43)} />);
    expect(screen.getByText(/^Week 4/)).toBeTruthy();
  });
});

/**
 * Resumed on a Wednesday into a test week: the week's tests are read off the
 * first day the block was running, not its Sunday, which the pause took.
 */
describe('a test week the resume fell in', () => {
  it('still carries its tests', async () => {
    const IG = getProgram('iron_grip')!;
    const plan = planFromLayout(IG.recommendedLayout!);
    const week = testWeeks(IG).find((t) => t.week > 1)!.week;
    const S = addDays(startOfWeek(today()), -7 * (week + 5));
    // Stopped at the end of the week before it, resumed three weeks on, on a Wednesday.
    const stopped: BlockRecord = {
      id: `iron_grip#${S}`, programId: 'iron_grip', name: 'Iron Grip', startDate: S, weeks: 12, plan,
      endedAt: addDays(S, 7 * (week - 1) - 1), reason: 'stopped',
    };
    const resume = addDays(S, 7 * (week + 2) + 3);
    const row = pickUp(stopped, resume)!;
    await hydrate();
    useProfile.setState({
      activeProgramId: 'iron_grip', startDates: { iron_grip: row.startDate }, plans: { iron_grip: plan },
      weekOverrides: {}, blocks: [row], injuries: [],
    });
    const sunday = startOfWeek(resume);
    renderAt(`/week/${sunday}`, <WeekPage params={{ start: sunday }} />);
    expect(await screen.findByText(`Week ${week} of 12`)).toBeTruthy();
    expect(screen.getAllByText('Paused')).toHaveLength(3);
    expect(screen.queryAllByText(/^Test:/).length).toBeGreaterThan(0);
  });
});
