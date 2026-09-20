// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { addDays, dayOfWeek, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { showMonthOf } from '@/test/calendarMonth';
import { CalendarPage } from '@/features/calendar/CalendarPage';

/**
 * How each week went, beside the week (PLAN.md M146).
 *
 * A training week and a rest week looked alike on the month grid until you
 * counted icons. The gutter reads `weekTally` — the rule the week screen
 * reads — so the two cannot disagree about one week.
 */

const TODAY = today();
const THIS_WEEK = startOfWeek(TODAY);

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

/** Iron Grip from the start of this week, training on two weekdays. */
async function running(plan: Record<number, string> = { 1: 'fp', 3: 'perf' }) {
  await hydrate();
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: THIS_WEEK },
    plans: { iron_grip: plan },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
  });
}

async function calendar() {
  renderAt('/calendar', <CalendarPage />);
  await screen.findByText('Mark days');
}

/**
 * The gutter cell for a week, by the Sunday it starts on.
 *
 * By its label as well as its href: the toolbar above the grid carries its
 * own "Week" link to the week you are in, at the same address.
 */
const gutter = (start: string) =>
  ([...document.querySelectorAll(`a[href="#/week/${start}"]`)].find((a) =>
    (a.getAttribute('aria-label') ?? '').startsWith('Week of '),
  ) ?? null) as HTMLElement | null;

const said = (start: string) => gutter(start)?.getAttribute('aria-label') ?? '';
const shown = (start: string) => gutter(start)?.textContent ?? '';

describe('the week gutter', () => {
  it('gives the month an eighth column, headed', async () => {
    await running();
    await calendar();
    expect(screen.getByText('Wk')).toBeTruthy();
  });

  it('counts the planned days of the week', async () => {
    await running();
    await calendar();
    expect(shown(THIS_WEEK)).toContain('0/2');
  });

  it('counts a planned day that was finished', async () => {
    // Train on the day the plan asks for, whichever weekday that is.
    const monday = addDays(THIS_WEEK, 1);
    await putSession(newSession(monday, 0, { completed: true, rpe: 7 }));
    await running();
    await calendar();
    expect(shown(THIS_WEEK)).toContain('1/2');
  });

  it('links to that week, so the gutter is a way in', async () => {
    await running();
    await calendar();
    expect(gutter(THIS_WEEK)).toBeTruthy();
  });

  /** The meter's value, as the primitive reports it. */
  const fill = (start: string) =>
    gutter(start)?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') ?? '';

  it('fills the meter by the share of the week that is done', async () => {
    const monday = addDays(THIS_WEEK, 1);
    await putSession(newSession(monday, 0, { completed: true, rpe: 7 }));
    await running();
    await calendar();
    expect(fill(THIS_WEEK)).toBe('50');
  });

  it('leaves the meter empty with nothing done yet', async () => {
    await running();
    await calendar();
    expect(fill(THIS_WEEK)).toBe('0');
  });

  /** The meter's fill class, which is where its tone shows. */
  const tone = (start: string) =>
    (gutter(start)?.querySelector('[role="progressbar"] > div') as HTMLElement | null)?.className ??
    '';

  it('fills it completely when the week is finished, and marks it done', async () => {
    for (const offset of [1, 3]) {
      await putSession(newSession(addDays(THIS_WEEK, offset), 0, { completed: true, rpe: 7 }));
    }
    await running();
    await calendar();
    expect(fill(THIS_WEEK)).toBe('100');
    // A finished week reads as finished, not as merely full: the same
    // distinction the session cards draw between on-track and complete.
    expect(tone(THIS_WEEK)).toContain('bg-positive');
  });

  it('leaves an unfinished week in the ordinary tone', async () => {
    await putSession(newSession(addDays(THIS_WEEK, 1), 0, { completed: true, rpe: 7 }));
    await running();
    await calendar();
    expect(tone(THIS_WEEK)).toContain('bg-accent');
    expect(tone(THIS_WEEK)).not.toContain('bg-positive');
  });

  // Saturday is in the week. Reading six days instead of seven loses it,
  // and a plan that trains on the last day of the week would go uncounted.
  it('reads all seven days, including the last', async () => {
    await running({ 1: 'fp', 6: 'perf' });
    await calendar();
    expect(shown(THIS_WEEK)).toContain('0/2');
  });

  it('says in words what the bar says in fill', async () => {
    const monday = addDays(THIS_WEEK, 1);
    await putSession(newSession(monday, 0, { completed: true, rpe: 7 }));
    await running();
    await calendar();
    expect(said(THIS_WEEK)).toMatch(/1 of 2 planned sessions done/);
  });
});

/**
 * A week that has not happened is not a week you missed. The first build
 * read 0/4 down every future row, which is true and reads as failure.
 */
describe('a week still ahead', () => {
  const nextWeek = addDays(THIS_WEEK, 7);

  /**
   * In the month that holds it (PLAN.md M299).
   *
   * The gutter has a row per row of the grid, so next week has one only
   * when next week is on the grid — and in the last week of a month it is
   * not. These three read an absent row as an empty string and a missing
   * meter, and the month they were written in was the only one they held
   * in.
   */
  const ahead = async () => {
    await running();
    await calendar();
    showMonthOf(nextWeek);
  };

  it('says what it asks for, not what was done', async () => {
    await ahead();
    expect(shown(nextWeek).trim()).toBe('2');
    expect(shown(nextWeek)).not.toContain('/');
  });

  it('draws no meter, because there is nothing to fill', async () => {
    await ahead();
    expect(gutter(nextWeek)?.querySelectorAll('span').length).toBe(1);
  });

  it('names it as planned rather than as done', async () => {
    await ahead();
    expect(said(nextWeek)).toMatch(/2 sessions planned/);
    expect(said(nextWeek)).not.toMatch(/done/);
  });
});

describe('a week that held more than it asked for', () => {
  /** A weekday this week that the plan leaves empty. */
  const spare = () => {
    for (let i = 0; i < 7; i++) {
      const date = addDays(THIS_WEEK, i);
      if (![1, 3].includes(dayOfWeek(date)) && date <= TODAY) return date;
    }
    return THIS_WEEK;
  };

  it('shows the off-plan sessions beside the fraction', async () => {
    await putSession(newSession(spare(), 0, { completed: true, rpe: 6 }));
    await running();
    await calendar();
    expect(shown(THIS_WEEK)).toContain('+1');
  });

  // Separate from the fraction, not folded into it: a week that did four
  // different sessions did not do the four it was asked for.
  it('leaves them out of the fraction', async () => {
    await putSession(newSession(spare(), 0, { completed: true, rpe: 6 }));
    await running();
    await calendar();
    expect(shown(THIS_WEEK)).toContain('0/2');
  });

  it('says so in words too', async () => {
    await putSession(newSession(spare(), 0, { completed: true, rpe: 6 }));
    await running();
    await calendar();
    expect(said(THIS_WEEK)).toMatch(/1 more off the plan/);
  });
});

describe('a week with nothing to report', () => {
  it('draws no gutter cell at all with no program running', async () => {
    await hydrate();
    await calendar();
    expect(gutter(THIS_WEEK)).toBeNull();
  });

  // Past the end of the block there is no plan to measure against, and
  // "0/0" down every row is worse than an empty gutter.
  it('draws none for a week past the end of the block', async () => {
    await running();
    await calendar();
    expect(gutter(addDays(THIS_WEEK, 7 * 40))).toBeNull();
  });

  it('still draws one for a week that was only trained off-plan', async () => {
    // On the grid that holds it (PLAN.md M299): two days before the first
    // of a month is last month, and a month beginning on a Sunday lends
    // the grid no leading days to find its row among.
    const trained = addDays(TODAY, -2);
    await putSession(newSession(trained, 0, { completed: true, rpe: 6 }));
    await hydrate();
    await calendar();
    showMonthOf(trained);
    expect(gutter(startOfWeek(trained))).toBeTruthy();
    expect(shown(startOfWeek(trained))).toContain('+1');
  });
});
