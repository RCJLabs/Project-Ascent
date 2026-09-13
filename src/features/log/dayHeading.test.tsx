// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { addDays, today } from '@/engine/dates';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { logHref } from '@/ui/routes';
import { DayHeading } from './DayHeading';
import { LogPage } from './LogPage';

/**
 * One address per day (PLAN.md M124).
 *
 * Every day is `/log/:date`, today included. From M117 to M123 today was
 * Home and this helper was the one place that knew; Home shows the card
 * and the log is a page again, so the special case is gone. The heading's
 * arrows, the `/today` redirect and the live bar all go through it, and
 * this checks from the outside by where the app actually goes.
 */
describe('logHref', () => {
  it('sends every day to its own log, today included', () => {
    expect(logHref('2026-09-12')).toBe('/log/2026-09-12');
    expect(logHref('2026-09-11')).toBe('/log/2026-09-11');
    expect(logHref('2026-09-13')).toBe('/log/2026-09-13');
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

  it('steps from yesterday to today’s own log', async () => {
    await reset();
    await hydrate();
    const yesterday = addDays(TODAY, -1);
    renderAt(`/log/${yesterday}`, <DayHeading date={yesterday} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Next day' }));
    expect(window.location.hash).toBe(`#/log/${TODAY}`);
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
  it('renders today where it is, rather than bouncing it to Home', async () => {
    await reset();
    await hydrate();
    const date = today();
    renderAt(`/log/${date}`, <LogPage params={{ date }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(window.location.hash).toBe(`#/log/${date}`);
  });

  it('sends today back to Home, which is where it was opened from', async () => {
    // Not the calendar: `routes.ts` puts `/log/:date` under it because that
    // is where a past day is opened from, and today is opened from the
    // card on Home (PLAN.md M124).
    await reset();
    await hydrate();
    const date = today();
    renderAt(`/log/${date}`, <LogPage params={{ date }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: /Home/ }).getAttribute('href')).toBe('#/');
  });

  it('does not offer Quick log inside the log it would open', async () => {
    // The second button belongs to Home's copy of the card (PLAN.md M124).
    // In the logger the fold is a toggle inside the session, and a start
    // button that also set it would overwrite the climber's choice every
    // time they began a session.
    await reset();
    await hydrate();
    const date = today();
    renderAt(`/log/${date}`, <LogPage params={{ date }} />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(screen.queryByRole('button', { name: /Quick log/ })).toBeNull();
  });

  it('leaves the fold alone when a session starts from inside the log', async () => {
    // The Quick log button on Home picks the view before arriving; a start
    // button inside the log must not, or every session begun here would
    // reset the climber's own choice (PLAN.md M120, M124).
    await reset();
    await hydrate();
    useSettings.setState({ logView: 'quick' });
    const date = today();
    renderAt(`/log/${date}`, <LogPage params={{ date }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Log a session/ }));
    await waitFor(() => expect(useSessions.getState().byDate[date]?.length).toBe(1));
    expect(useSettings.getState().logView).toBe('quick');
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
