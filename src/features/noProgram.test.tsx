// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { newSession, putSession } from '@/db/sessions';
import { today } from '@/engine/dates';
import { hydrate, renderAt } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { HomePage } from '@/features/home/HomePage';

/**
 * The app between programs (PLAN.md M45).
 *
 * A real climber finishes a twelve-week block and is not in another one for
 * a while, and every new install starts that way. With 1,600 sessions logged
 * and no active program, `/calendar` rendered "No active program yet… your
 * sessions will appear here" — nine years of history invisible, under a
 * promise it was breaking. Home's Today card, which holds the only prominent
 * route to the logger, was gated the same way. A crawl of 38 screens from a
 * fresh install found logging reachable only from Coach's Corner and search.
 *
 * A program decides what you *should* do. It has never had anything to do
 * with what you already did.
 */

async function logged(): Promise<string> {
  const day = today();
  await putSession({
    ...newSession(day, 0),
    completed: true,
    climbs: [{ id: 'c1', grade: 'V5', scale: 'V', count: 2, result: 'send' }],
  });
  // A second, older one, so the month grid has more than today in it.
  await putSession({ ...newSession('2026-01-06', 0), completed: true, climbs: [] });
  await hydrate();
  return day;
}

describe('with no active program', () => {
  it('the calendar still shows the days you logged', async () => {
    const day = await logged();
    const view = renderAt('/calendar', <CalendarPage />);
    await view.findByRole('heading', { level: 1 });
    const cell = view.container.querySelector(`a[href="#/log/${day}"]`);
    expect(cell, 'today is not on the calendar at all').not.toBeNull();
    expect(view.container.textContent ?? '').toMatch(/Logged/);
  });

  it('the calendar still opens a day', async () => {
    await logged();
    const view = renderAt('/calendar', <CalendarPage />);
    await view.findByRole('heading', { level: 1 });
    const links = view.container.querySelectorAll('a[href^="#/log/"]');
    expect(links.length, 'no day on the grid is reachable').toBeGreaterThan(27);
  });

  it('the calendar still says how to get a plan', async () => {
    // Showing the history is not a reason to stop offering the thing that
    // fills the other half of the page.
    await logged();
    const view = renderAt('/calendar', <CalendarPage />);
    await view.findByRole('heading', { level: 1 });
    expect(view.container.querySelector('a[href="#/find"]')).not.toBeNull();
  });

  it('home offers a way to log today', async () => {
    const day = await logged();
    const view = renderAt('/', <HomePage />);
    await view.findByRole('heading', { level: 1 });
    expect(
      view.container.querySelector(`a[href="#/log/${day}"]`),
      'the front door has no route to the logger',
    ).not.toBeNull();
  });
});
