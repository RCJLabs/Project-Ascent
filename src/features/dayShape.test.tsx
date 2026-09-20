// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { loadPrograms } from '@/content/programs';
import { addDays, dayOfWeek, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { PreSessionCard } from '@/features/log/PreSession';
import { CalendarPage } from '@/features/calendar/CalendarPage';

/**
 * What kind of day this is, and roughly how long (PLAN.md M131).
 *
 * The card that says "Week 3 · The Anvil" said nothing about the two things
 * a climber decides an evening on: whether today is the hard one, and
 * whether there is time for it.
 */

const TODAY = today();
const DOW = dayOfWeek(TODAY);
const TEXT = () => document.body.textContent ?? '';

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

async function running(programId: string, typeId: string): Promise<void> {
  await runningInWeek(programId, typeId, 1);
}

/** The same, with today landing in a given week of the block. */
async function runningInWeek(programId: string, typeId: string, week: number): Promise<void> {
  await hydrate();
  useProfile.setState({
    activeProgramId: programId,
    startDates: { [programId]: addDays(startOfWeek(TODAY), -(week - 1) * 7) },
    plans: { [programId]: { [DOW]: typeId } },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
  });
}

describe('the day says how hard it is', () => {
  it('names the level on a hard day', async () => {
    await running('iron_grip', 'fp');
    renderAt('/', <PreSessionCard date={TODAY} />);
    expect(await screen.findByText('Hard day')).toBeTruthy();
  });

  it('names it on a limit day too', async () => {
    await running('peak_performance', 'perf');
    renderAt('/', <PreSessionCard date={TODAY} />);
    expect(await screen.findByText('Limit day')).toBeTruthy();
  });

  it('says nothing about hardness on a rest day', async () => {
    await running('iron_grip', 'rest');
    renderAt('/', <PreSessionCard date={TODAY} />);
    await screen.findByText(/Rest day/);
    expect(TEXT()).not.toMatch(/Hard day|Limit day|Moderate day|Easy day/);
  });
});

describe('and roughly how long it takes', () => {
  it('estimates a session it can read', async () => {
    // Iron Grip's finger day is nine dosed lines, every one of them a
    // number of sets with a rest between.
    await running('iron_grip', 'fp');
    renderAt('/', <PreSessionCard date={TODAY} />);
    await screen.findByText('Hard day');
    expect(TEXT()).toMatch(/about \d+(-\d+)? min of work/);
  });

  it('says the length its author gave, where the dose cannot', async () => {
    // The Cruiser's volume day is easy climbing counted in problems, which
    // no clock can read — and the program's own rationale says *drill it
    // for 60 minutes* (PLAN.md M138). It said nothing until M138 gave the
    // session type a duration.
    await running('the_cruiser', 'vol');
    renderAt('/', <PreSessionCard date={TODAY} />);
    await screen.findByText('Moderate day');
    expect(TEXT()).toMatch(/about 45-60 min of work/);
  });

  it('shortens on a deload week, because the prescription does', async () => {
    // M128's property, still true through the resolver: Iron Grip's week
    // four takes a set off every block and the card says so.
    await runningInWeek('iron_grip', 'fp', 1);
    renderAt('/', <PreSessionCard date={TODAY} />);
    await screen.findByText('Hard day');
    expect(TEXT()).toContain('about 42-51 min of work');
    cleanup();
    await runningInWeek('iron_grip', 'fp', 4);
    renderAt('/', <PreSessionCard date={TODAY} />);
    await screen.findByText(/Deload week/);
    expect(TEXT()).toContain('about 32-33 min of work');
  });

  it('stays quiet where nobody could know', async () => {
    // A day at the crag is as long as the day is. Outdoor Climbing is a
    // mode with no blocks and no authored length, and inventing one would
    // be the app pretending to know something nobody does.
    await running('outdoor_climbing', 'outdoor_sport');
    renderAt('/', <PreSessionCard date={TODAY} />);
    await screen.findByText('Hard day');
    expect(TEXT()).not.toMatch(/min of work/);
  });
});

describe('the month view marks the limit days', () => {
  it('marks one, and only the limit day', async () => {
    // Peak Performance runs a max-intensity Monday and a technique
    // Wednesday. One of those is the day the week is built around.
    //
    // From the week the month opens in, not from today (PLAN.md M299).
    // Starting the block on `TODAY` puts only the Mondays after today in
    // the month on view, and a block begun in the last week of a month has
    // exactly one of them — so "more than one LIMIT" was a claim about
    // where in its month the suite happened to run. Opening the block on
    // the Sunday the month begins in covers every Monday it holds, on
    // every date, and twelve weeks is longer than any month.
    await hydrate();
    useProfile.setState({
      activeProgramId: 'peak_performance',
      startDates: { peak_performance: startOfWeek(`${TODAY.slice(0, 7)}-01`) },
      plans: { peak_performance: { 1: 'perf', 3: 'tech' } },
      weekOverrides: {},
      adaptations: {},
      injuries: [],
    });
    renderAt('/calendar', <CalendarPage />);
    // The grid is up. Not the legend: it now names only what this month
    // carries, so a block with no limit day has no LIMIT row (PLAN.md M145).
    await screen.findByText('Mark days');
    // One per Monday on the grid. The legend says "LIMIT — the hardest
    // day" in one node, so it is not one of these.
    expect(screen.getAllByText('LIMIT').length).toBeGreaterThan(1);
  });

  it('marks nothing in a block that has no limit day', async () => {
    // Iron Grip's two working days are both hard and neither is a limit
    // day, so the month carries no marks at all. This is the test that
    // holds the marker to `max`: drop it to `hard` and every training day
    // of this block lights up.
    await hydrate();
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: TODAY },
      plans: { iron_grip: { 1: 'fp', 3: 'perf' } },
      weekOverrides: {},
      adaptations: {},
      injuries: [],
    });
    renderAt('/calendar', <CalendarPage />);
    // The grid is up. Not the legend: it now names only what this month
    // carries, so a block with no limit day has no LIMIT row (PLAN.md M145).
    await screen.findByText('Mark days');
    expect(screen.queryAllByText('LIMIT')).toHaveLength(0);
  });
});
