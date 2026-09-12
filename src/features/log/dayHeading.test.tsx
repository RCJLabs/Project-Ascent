// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { logHref } from '@/ui/routes';
import { DayHeading } from './DayHeading';
import { LogPage } from './LogPage';

/**
 * One address per day (PLAN.md M117).
 *
 * Today is Home and every other day is `/log/:date`. The heading's arrows,
 * the `/today` redirect and the log page's own bounce all go through
 * `logHref`, so the rule is written once — and checked here from the
 * outside, by where the app actually goes.
 */
describe('logHref', () => {
  it('sends today home and every other day to its log', () => {
    expect(logHref('2026-09-12', '2026-09-12')).toBe('/');
    expect(logHref('2026-09-11', '2026-09-12')).toBe('/log/2026-09-11');
    expect(logHref('2026-09-13', '2026-09-12')).toBe('/log/2026-09-13');
  });
});

describe('the day heading', () => {
  const TODAY = today();

  it('names the day', async () => {
    await reset();
    await hydrate();
    renderAt('/', <DayHeading date={TODAY} />);
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1.textContent).toMatch(/\w+, \w+ \d+/);
  });

  it('steps from yesterday to Home rather than to a second address for today', async () => {
    await reset();
    await hydrate();
    const yesterday = addDays(TODAY, -1);
    renderAt(`/log/${yesterday}`, <DayHeading date={yesterday} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Next day' }));
    expect(window.location.hash).toBe('#/');
  });

  it('steps from Home to yesterday', async () => {
    await reset();
    await hydrate();
    renderAt('/', <DayHeading date={TODAY} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Previous day' }));
    expect(window.location.hash).toBe(`#/log/${addDays(TODAY, -1)}`);
  });
});

describe('the log page', () => {
  it('bounces today to Home', async () => {
    await reset();
    await hydrate();
    const date = today();
    renderAt(`/log/${date}`, <LogPage params={{ date }} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(window.location.hash).toBe('#/');
  });

  it('renders any other day where it is', async () => {
    await reset();
    await hydrate();
    const date = addDays(today(), -3);
    renderAt(`/log/${date}`, <LogPage params={{ date }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(window.location.hash).toBe(`#/log/${date}`);
    // Its back link is the calendar, which is where a past day is opened from.
    expect(screen.getByRole('link', { name: /Calendar/ }).getAttribute('href')).toBe('#/calendar');
  });
});
