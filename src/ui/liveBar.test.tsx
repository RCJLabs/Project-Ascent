// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { LiveBar, useLiveBanner } from './LiveBar';

/**
 * One clock on a screen (PLAN.md M74, M117, M120).
 *
 * The bar stands down on the page that already shows the session's own
 * clock. Since M117 today's log is Home, and a bar that compared against
 * `/log/<today>` put a second clock over the day's own — found while
 * gym mode's clause was being retired in M120.
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
  it('stands down on Home while today runs there', async () => {
    await runningOn(today());
    renderAt('/', <Bar />);
    expect(screen.queryByText('Session in progress')).toBeNull();
  });

  it('shows on any other page, and points home', async () => {
    await runningOn(today());
    renderAt('/train', <Bar />);
    const link = (await screen.findByText('Session in progress')).closest('a')!;
    expect(link.getAttribute('href')).toBe('#/');
  });

  it("stands down on a past day's own log, and points there from elsewhere", async () => {
    // A session left open since yesterday is stale, which is the only way a
    // past day can still be on the bar.
    const yesterday = addDays(today(), -1);
    await runningOn(yesterday, 20);
    renderAt(`/log/${yesterday}`, <Bar />);
    expect(screen.queryByText(/still open/)).toBeNull();
    renderAt('/', <Bar />);
    const link = (await screen.findByText(/still open/)).closest('a')!;
    expect(link.getAttribute('href')).toBe(`#/log/${yesterday}`);
  });
});
