// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { addDays, monthLabel, startOfWeek, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { WeekPage } from '@/features/week/WeekPage';

/**
 * The way back to now (PLAN.md M147).
 *
 * The month and the week both page with arrows and neither had a way home:
 * three months forward was three presses back, and the further you looked
 * the further you had to walk. A control that appears only when it would
 * move you — a Today button on the month that already holds today is an
 * offer a screen reader meets and cannot act on, the trap M135 named for
 * the disabled move rows.
 */

const TODAY = today();
const NOW = new Date(`${TODAY}T00:00`);

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await hydrate();
});

async function calendar() {
  renderAt('/calendar', <CalendarPage />);
  await screen.findByText('Mark days');
}

const page = (by: number) => {
  const label = by < 0 ? 'Previous month' : 'Next month';
  for (let i = 0; i < Math.abs(by); i++) fireEvent.click(screen.getByLabelText(label));
};

/** The month the grid is showing, from its own heading. */
const showing = () => {
  for (let back = -14; back <= 14; back++) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth() + back, 1);
    const label = monthLabel(d.getFullYear(), d.getMonth());
    if (screen.queryByText(label)) return back;
  }
  return null;
};

describe('the month', () => {
  it('offers no way back while it is already showing today', async () => {
    await calendar();
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull();
  });

  it('offers one as soon as you page away', async () => {
    await calendar();
    page(1);
    expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy();
  });

  it('offers one when you page backwards too', async () => {
    await calendar();
    page(-1);
    expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy();
  });

  it('comes back in one press from three months out', async () => {
    await calendar();
    page(3);
    expect(showing()).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(showing()).toBe(0);
  });

  it('puts the way back away again once you are home', async () => {
    await calendar();
    page(2);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull();
  });

  /**
   * A month is a month *of a year*. Comparing the month alone would hide
   * the way back from every anniversary of the one you are in — twelve
   * presses out and the button quietly missing.
   */
  it('offers one a year out, where the month number matches', async () => {
    await calendar();
    page(12);
    expect(showing()).toBe(12);
    expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy();
  });

  // Across a year boundary, which paging three months forward only does
  // for part of the year: the jump has to restore both halves of the date.
  it('comes back across a year boundary', async () => {
    await calendar();
    page(12);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(showing()).toBe(0);
  });

  it('comes back from a year behind', async () => {
    await calendar();
    page(-12);
    expect(showing()).toBe(-12);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(showing()).toBe(0);
  });

  // It sits beside the two controls that were already there, and does not
  // displace either.
  it('leaves the rest of the toolbar alone', async () => {
    await calendar();
    page(1);
    expect(screen.getByRole('button', { name: /Mark days/ })).toBeTruthy();
    // Exactly "Week", not a pattern: the week gutter's cells are links
    // named "Week of Sep 13…", and a regex matches those instead.
    expect(screen.getByRole('link', { name: 'Week' })).toBeTruthy();
  });
});

describe('the week', () => {
  async function week(start: string) {
    renderAt(`/week/${start}`, <WeekPage params={{ start }} />);
    await screen.findByRole('heading', { level: 1 });
  }

  it('offers no way back from the week you are in', async () => {
    await week(TODAY);
    expect(screen.queryByRole('button', { name: 'This week' })).toBeNull();
  });

  it('offers one from a week ahead', async () => {
    await week(addDays(startOfWeek(TODAY), 21));
    expect(screen.getByRole('button', { name: 'This week' })).toBeTruthy();
  });

  it('offers one from a week behind', async () => {
    await week(addDays(startOfWeek(TODAY), -21));
    expect(screen.getByRole('button', { name: 'This week' })).toBeTruthy();
  });

  it('goes to this week when pressed', async () => {
    await week(addDays(startOfWeek(TODAY), 21));
    fireEvent.click(screen.getByRole('button', { name: 'This week' }));
    // The page takes its week from the route, so the address is what moved.
    expect(window.location.hash).toBe(`#/week/${TODAY}`);
  });

  // Any date in the week is that week, so a Saturday three weeks out is
  // still away and the Saturday of this week is still home.
  it('reads the week, not the date', async () => {
    await week(addDays(startOfWeek(TODAY), 6));
    expect(screen.queryByRole('button', { name: 'This week' })).toBeNull();
  });
});
