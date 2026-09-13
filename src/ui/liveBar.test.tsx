// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { LiveBar, useLiveBanner } from './LiveBar';

/**
 * One clock on a screen (PLAN.md M74, M117, M120, M124).
 *
 * The bar stands down on the page that already shows the session's own
 * clock, and nowhere else. From M117 to M123 that page was Home, because
 * Home was the log; since M124 it is `/log/<today>` like any other day —
 * so the bar now *does* show on Home during a session, which is the point
 * of it: Home carries the card, not the clock, and the bar is the way back
 * to a session in progress from wherever you wandered to.
 */
function Bar() {
  const banner = useLiveBanner();
  return <LiveBar banner={banner} />;
}

async function runningOn(date: string, hoursAgo = 0): Promise<void> {
  await reset();
  const startedAt = new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  await putSession({ ...newSession(date, 0, { completed: false }), startedAt } as never);
  await hydrate();
}

describe('the live bar', () => {
  it("stands down on today's own log, where the clock already is", async () => {
    await runningOn(today());
    renderAt(`/log/${today()}`, <Bar />);
    expect(screen.queryByText('Session in progress')).toBeNull();
  });

  it('shows on any other page, Home included, and points at the day', async () => {
    await runningOn(today());
    renderAt('/train', <Bar />);
    const link = (await screen.findByText('Session in progress')).closest('a')!;
    expect(link.getAttribute('href')).toBe(`#/log/${today()}`);
  });

  it('is the way back to a running session from Home', async () => {
    // The bar that M117 to M123 suppressed here. Home shows the session's
    // card, which says where it got to; the bar is the clock, and a
    // climber who left the log to check the calendar needs both.
    await runningOn(today());
    renderAt('/', <Bar />);
    const link = (await screen.findByText('Session in progress')).closest('a')!;
    expect(link.getAttribute('href')).toBe(`#/log/${today()}`);
  });

  it("stands down on a past day's own log, and points there from elsewhere", async () => {
    // A session left open since yesterday is stale, which is the only way a
    // past day can still be on the bar.
    const yesterday = addDays(today(), -1);
    await runningOn(yesterday, 20);
    renderAt(`/log/${yesterday}`, <Bar />);
    expect(screen.queryByText(/still open/)).toBeNull();
    renderAt('/train', <Bar />);
    const link = (await screen.findByText(/still open/)).closest('a')!;
    expect(link.getAttribute('href')).toBe(`#/log/${yesterday}`);
  });
});
