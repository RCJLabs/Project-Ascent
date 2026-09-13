// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { loadPrograms } from '@/content/programs';
import { dayOfWeek, today } from '@/engine/dates';
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
  await hydrate();
  useProfile.setState({
    activeProgramId: programId,
    startDates: { [programId]: TODAY },
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

  it('stays quiet about one it cannot', async () => {
    // The Cruiser's volume day is easy climbing counted in problems, and
    // the honest answer to how long that takes is that the app does not
    // know. It still says what kind of day it is.
    await running('the_cruiser', 'vol');
    renderAt('/', <PreSessionCard date={TODAY} />);
    await screen.findByText('Moderate day');
    expect(TEXT()).not.toMatch(/min of work/);
  });
});

describe('the month view marks the limit days', () => {
  it('marks one, and only the limit day', async () => {
    // Peak Performance runs a max-intensity Monday and a technique
    // Wednesday. One of those is the day the week is built around.
    await hydrate();
    useProfile.setState({
      activeProgramId: 'peak_performance',
      startDates: { peak_performance: TODAY },
      plans: { peak_performance: { 1: 'perf', 3: 'tech' } },
      weekOverrides: {},
      adaptations: {},
      injuries: [],
    });
    renderAt('/calendar', <CalendarPage />);
    await screen.findByText(/Planned session/);
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
    await screen.findByText(/Planned session/);
    expect(screen.queryAllByText('LIMIT')).toHaveLength(0);
  });
});
