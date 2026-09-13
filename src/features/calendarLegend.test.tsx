// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen } from '@testing-library/react';
import { loadPrograms, getProgram } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';

/**
 * The legend is a key to this month (PLAN.md M145).
 *
 * It was written independently of the loop that draws the squares and
 * drifted from it in both directions: one row reading "Planned session"
 * for a month carrying several different ones, and a row explaining a
 * LIMIT marker on blocks that have no limit day at all — a key to a mark
 * the climber could look for and never find.
 */

const TODAY = today();

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

/** Run a program from the start of this week, on the given weekdays. */
async function running(programId: string, plan: Record<number, string>) {
  await hydrate();
  useProfile.setState({
    activeProgramId: programId,
    startDates: { [programId]: startOfWeek(TODAY) },
    plans: { [programId]: plan },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
  });
}

async function calendar() {
  renderAt('/calendar', <CalendarPage />);
  await screen.findByText('Mark days');
}

/** The legend's rows, as text. Empty when there is no legend at all. */
const legend = (): string[] => {
  const list = screen.queryByRole('list', { name: /What the marks on this month mean/ });
  return list ? [...list.querySelectorAll('li')].map((li) => li.textContent ?? '') : [];
};

const legendText = (): string => legend().join(' | ');

describe('every session the month holds, by name', () => {
  it('names each different session type, not one word for all of them', async () => {
    // Iron Grip runs a finger day and a performance day. The legend said
    // "Planned session" once and told you which none.
    await running('iron_grip', { 1: 'fp', 3: 'perf' });
    await calendar();
    const program = getProgram('iron_grip')!;
    const fp = program.sessionTypes.find((t) => t.id === 'fp')!;
    const perf = program.sessionTypes.find((t) => t.id === 'perf')!;
    expect(legendText()).toContain(fp.name);
    expect(legendText()).toContain(perf.name);
    expect(legendText()).not.toContain('Planned session');
  });

  it('carries the icon the grid draws beside each name', async () => {
    await running('iron_grip', { 1: 'fp', 3: 'perf' });
    await calendar();
    const fp = getProgram('iron_grip')!.sessionTypes.find((t) => t.id === 'fp')!;
    expect(legendText()).toContain(`${fp.icon} ${fp.name}`);
  });

  it('names a session type once however many days it falls on', async () => {
    await running('iron_grip', { 1: 'fp', 3: 'fp', 5: 'fp' });
    await calendar();
    const fp = getProgram('iron_grip')!.sessionTypes.find((t) => t.id === 'fp')!;
    expect(legend().filter((row) => row.includes(fp.name))).toHaveLength(1);
  });

  // A rest day draws no icon, so it is not something the key explains.
  it('leaves rest days out of it', async () => {
    await running('iron_grip', { 1: 'fp', 2: 'rest' });
    await calendar();
    const rest = getProgram('iron_grip')!.sessionTypes.find((t) => t.isRest);
    if (rest) expect(legendText()).not.toContain(rest.name);
  });
});

describe('the markers, only where the month carries them', () => {
  /**
   * The complaint that started this: the legend promised *LIMIT — the
   * hardest day* over an Iron Grip month, whose two working days are both
   * hard and neither of which is a limit day. There was no LIMIT anywhere
   * on the grid to find.
   */
  it('says nothing about LIMIT in a block that has no limit day', async () => {
    await running('iron_grip', { 1: 'fp', 3: 'perf' });
    await calendar();
    expect(legendText()).not.toContain('LIMIT');
    expect(screen.queryAllByText('LIMIT')).toHaveLength(0);
  });

  it('explains LIMIT in a block that does have one', async () => {
    await running('peak_performance', { 1: 'perf', 3: 'tech' });
    await calendar();
    expect(legendText()).toContain('LIMIT');
    expect(screen.getAllByText('LIMIT').length).toBeGreaterThan(0);
  });

  /**
   * Counted inside the squares, not across the page: the weekday header
   * row is S M T W T F S, so a bare search for "T" finds Tuesday and
   * Thursday and reports an assessment week that is not there. The first
   * version of this test did exactly that and passed for it.
   */
  const markers = (word: string) =>
    [...document.querySelectorAll('a[href^="#/log/"], button[aria-pressed]')].filter((cell) =>
      [...cell.querySelectorAll('span')].some((s) => s.textContent?.trim() === word),
    ).length;

  it('says nothing about a deload or an assessment in a week that has neither', async () => {
    await running('iron_grip', { 1: 'fp', 3: 'perf' });
    await calendar();
    expect(markers('DL')).toBe(0);
    expect(legendText()).not.toContain('deload week');
  });

  it('explains DL where the month deloads', async () => {
    // Iron Grip deloads on week four, so start the block three weeks back.
    await hydrate();
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: addDays(startOfWeek(TODAY), -21) },
      plans: { iron_grip: { 1: 'fp', 3: 'perf' } },
      weekOverrides: {},
      adaptations: {},
      injuries: [],
    });
    await calendar();
    expect(markers('DL')).toBeGreaterThan(0);
    expect(legendText()).toContain('deload week');
  });

  /**
   * Scanned, not assumed. Which month a block's test or deload week lands
   * in depends on today, so a fixture with a hard-coded offset passes or
   * fails on the date the suite happens to run.
   *
   * The property is the one the whole milestone is about: for every month
   * of the block, the legend says a marker exactly when the grid draws
   * one. Asserting it over a run of months also catches the case a single
   * month cannot — a legend row that is always on, which goes unnoticed in
   * any month where the card is suppressed entirely.
   */
  async function scan(months: number) {
    const seen: { card: boolean; grid: Record<string, boolean>; says: Record<string, boolean> }[] =
      [];
    for (let i = 0; i < months; i++) {
      seen.push({
        card: legend().length > 0,
        grid: { T: markers('T') > 0, DL: markers('DL') > 0, LIMIT: markers('LIMIT') > 0 },
        says: {
          T: legendText().includes('assessment week'),
          DL: legendText().includes('deload week'),
          LIMIT: legendText().includes('the hardest day'),
        },
      });
      fireEvent.click(screen.getByLabelText('Next month'));
      await screen.findByText('Mark days');
    }
    return seen;
  }

  it('says a marker in exactly the months that draw one', async () => {
    // Peak Performance over Iron Grip: twelve weeks with tests on weeks
    // five and nine, so a run of months contains both answers. Iron Grip's
    // blocks are short enough that every month in view carries a test week,
    // and an agreement between two constants proves nothing.
    await running('peak_performance', { 1: 'perf', 3: 'tech' });
    await calendar();
    const months = await scan(6);
    for (const [i, month] of months.entries()) {
      for (const word of ['T', 'DL', 'LIMIT'] as const) {
        expect(month.says[word], `month ${i}: legend ${word}`).toBe(month.grid[word]);
      }
    }
    /*
     * The run has to contain both answers, or the agreement above is the
     * agreement of two constants. DL and LIMIT are the two that vary
     * across a Peak Performance block; every month inside it carries an
     * assessment week, so T's absent case is held by the no-program test
     * below, where the card exists for a logged day and no marker does.
     */
    for (const word of ['DL', 'LIMIT'] as const) {
      expect(months.some((m) => m.grid[word]), `no month drew ${word}`).toBe(true);
      expect(
        months.some((m) => m.card && !m.grid[word]),
        `no month had a legend and no ${word}`,
      ).toBe(true);
    }
    // The assessment week only ever appears, over this block — its absent
    // case is the no-program test below. Asserting it appears at all is
    // what catches the flag failing to reach the grid and the key together,
    // which an agreement between two absences cannot see.
    expect(months.some((m) => m.grid.T), 'no month drew an assessment week').toBe(true);
  });

  /**
   * And no marker lands on a borrowed square. The grid draws LIMIT, DL and
   * T only for days inside the month, and the key counts them the same way
   * — so a cell dimmed as out-of-month carrying one would mean the gate
   * had gone from both at once.
   */
  it('puts no week marker on a day borrowed from the month either side', async () => {
    await hydrate();
    useProfile.setState({
      activeProgramId: 'peak_performance',
      startDates: { peak_performance: addDays(startOfWeek(TODAY), -28) },
      plans: { peak_performance: { 1: 'perf', 3: 'tech' } },
      weekOverrides: {},
      adaptations: {},
      injuries: [],
    });
    await calendar();
    const outside = [
      ...document.querySelectorAll('a[href^="#/log/"], button[aria-pressed]'),
    ].filter((cell) => cell.className.includes('opacity-40'));
    expect(outside.length, 'the month borrows no days to check').toBeGreaterThan(0);
    for (const cell of outside) {
      const words = [...cell.querySelectorAll('span')].map((s) => s.textContent?.trim());
      expect(words, cell.getAttribute('href') ?? '').not.toContain('LIMIT');
      expect(words, cell.getAttribute('href') ?? '').not.toContain('DL');
      expect(words, cell.getAttribute('href') ?? '').not.toContain('T');
    }
  });
});

describe('the logged row', () => {
  it('appears once something in view is logged', async () => {
    await running('iron_grip', { 1: 'fp' });
    await putSession(newSession(TODAY, 0, { completed: true, rpe: 7 }));
    await hydrate();
    await calendar();
    expect(legendText()).toContain('Logged');
  });

  it('stays away while nothing is', async () => {
    await running('iron_grip', { 1: 'fp' });
    await calendar();
    expect(legendText()).not.toContain('Logged');
  });
});

describe('with no program running', () => {
  it('shows a key for the logged days and nothing else', async () => {
    await hydrate();
    await putSession(newSession(addDays(TODAY, -1), 0, { completed: true, rpe: 5 }));
    await hydrate();
    await calendar();
    expect(legendText()).toContain('Logged');
    // Every marker absent, with a card present to have carried them. This
    // is the case that catches a legend row wired to draw unconditionally:
    // inside a running block there is always something for one to hide
    // behind, and past the end of it there is no card at all.
    expect(legendText()).not.toContain('LIMIT');
    expect(legendText()).not.toContain('deload week');
    expect(legendText()).not.toContain('assessment week');
    expect(legend()).toHaveLength(1);
  });

  it('draws no legend card at all when there is nothing to explain', async () => {
    await hydrate();
    await calendar();
    // The list itself, not its rows: an empty card with every row
    // suppressed is still a card, and still nothing worth looking at.
    expect(screen.queryByRole('list', { name: /What the marks/ })).toBeNull();
    expect(legend()).toEqual([]);
  });
});
