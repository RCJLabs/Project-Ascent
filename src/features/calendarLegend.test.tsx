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

/**
 * The fifteenth of the month two before this one — a day that exists in
 * every month, in a month two clicks of *Previous month* away.
 */
const TWO_MONTHS_BACK = ((): string => {
  const [year, month] = TODAY.split('-').map(Number) as [number, number];
  const shifted = year * 12 + (month - 1) - 2;
  return `${Math.floor(shifted / 12)}-${String((shifted % 12) + 1).padStart(2, '0')}-15`;
})();

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

  /**
   * A block that never deloads, rather than a month that happens not to
   * (PLAN.md M299).
   *
   * This ran Iron Grip from the start of this week and asserted the month
   * in view drew no DL. Iron Grip deloads on week four, which is twenty-one
   * days after the block starts — inside the month in view whenever this
   * week began before about the tenth, and in the next one when it began
   * after. The test passed one week in three, and had never been run in the
   * other two.
   *
   * Trip Prep is the one shipped program with `deloadWeeks: []`, so there
   * is no date on which the grid could draw a DL here. The card is present
   * to have carried the row — the block's own sessions are in the month —
   * which is what stops this passing on an empty calendar.
   */
  it('says nothing about a deload in a block that never deloads', async () => {
    await running('trip_prep', { 1: 'fp', 3: 'move' });
    await calendar();
    expect(legend().length, 'no legend to have carried a deload row').toBeGreaterThan(0);
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

  /**
   * The month with no markers is one the block does not reach (PLAN.md
   * M299).
   *
   * This scanned six months from this one and asked for a month that had a
   * legend and drew no LIMIT. LIMIT draws on every planned day whose
   * session type is a limit day, and `perf` is one on every Monday of the
   * block — so inside the block there is no such month, and outside it
   * there is no legend either. The only months that satisfied both were
   * the ones the block's last weeks clipped in a particular way, which is a
   * property of where today sits in its month: it held on one week in six
   * and failed on the other five, unnoticed for a hundred and fifty
   * milestones.
   *
   * A logged day two months before the block starts is a month with a
   * legend and nothing else in it, on every date — `worthExplaining` counts
   * a logged day, and a month the block does not reach can draw no marker
   * at all. The scan walks back to it and forward over the whole block, so
   * the run contains both answers by construction rather than by luck.
   */
  it('says a marker in exactly the months that draw one', async () => {
    await putSession(newSession(TWO_MONTHS_BACK, 0, { completed: true, rpe: 6 }));
    await running('peak_performance', { 1: 'perf', 3: 'tech' });
    await calendar();
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByLabelText('Previous month'));
      await screen.findByText('Mark days');
    }
    const months = await scan(8);
    for (const [i, month] of months.entries()) {
      for (const word of ['T', 'DL', 'LIMIT'] as const) {
        expect(month.says[word], `month ${i}: legend ${word}`).toBe(month.grid[word]);
      }
    }
    /*
     * The run has to contain both answers, or the agreement above is the
     * agreement of two constants. Every marker appears somewhere inside the
     * block — LIMIT on each Monday, DL on weeks five and nine, T on week
     * one — and none of them appears in the logged month the scan starts
     * from, which is the absent case for all three.
     */
    for (const word of ['DL', 'LIMIT', 'T'] as const) {
      expect(months.some((m) => m.grid[word]), `no month drew ${word}`).toBe(true);
      expect(
        months.some((m) => m.card && !m.grid[word]),
        `no month had a legend and no ${word}`,
      ).toBe(true);
    }
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
