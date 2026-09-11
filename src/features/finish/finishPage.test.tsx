// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { loadPrograms } from '@/content/programs';
import { IRON_GRIP } from '@/content/programs/catalogue';
import { addDays, daysBetween, startOfWeek, today } from '@/engine/dates';
import { blockWindow } from '@/engine/plan';
import { planFromLayout } from '@/engine/scheduler';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinishPage } from './FinishPage';
import { HomePage } from '@/features/home/HomePage';

/**
 * The end of a block reaches the climber (PLAN.md M85).
 *
 * `engine/blockEnd.test.ts` proves the content. These prove it is reachable
 * from where a climber actually is — which was the whole problem: the
 * graduation line and the authored next programs existed, on a page nobody
 * visits mid-block.
 */

/**
 * A start date whose block has already finished, and how long ago.
 *
 * Computed rather than searched: the window's last day is always a
 * Saturday, because `blockWindow` snaps the start to its Sunday, so a loop
 * hunting for an exact "ended N days ago" never terminates for most N. A
 * first draft did exactly that and hung the suite.
 */
function endedBlock(weeksAgo: number): { start: string; daysSince: number } {
  const start = addDays(startOfWeek(today()), -(IRON_GRIP.weeks + weeksAgo) * 7);
  return { start, daysSince: daysBetween(blockWindow(IRON_GRIP, start).to, today()) };
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  reset();
  await loadPrograms();
});

function running(start: string) {
  // The plan too: Home reads `plannedDay` only when it has one, so without
  // it the page falls through to "no program is running" for a reason that
  // has nothing to do with the block being over.
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: start },
    plans: { iron_grip: planFromLayout(IRON_GRIP.recommendedLayout!) },
  });
}

describe('the finish page', () => {
  it('says there is nothing to review with no program', async () => {
    await hydrate();
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText(/No program is running/)).toBeTruthy();
  });

  it('shows the block while it is still running', async () => {
    await hydrate();
    running(addDays(today(), -14));
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText(/Runs to/)).toBeTruthy();
  });

  it('says how long ago it ran out', async () => {
    await hydrate();
    const { start, daysSince } = endedBlock(1);
    running(start);
    renderAt('/finish', <FinishPage />);
    expect(daysSince).toBeGreaterThan(0);
    expect(screen.getByText(/ran out .* ago/)).toBeTruthy();
  });

  it('carries the graduation line the catalogue page had', async () => {
    await hydrate();
    running(endedBlock(1).start);
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText(IRON_GRIP.intro.graduation)).toBeTruthy();
  });

  it('carries every authored next program with its reason', async () => {
    await hydrate();
    running(endedBlock(1).start);
    renderAt('/finish', <FinishPage />);
    for (const step of IRON_GRIP.nextPrograms) {
      expect(screen.getByText(step.reason)).toBeTruthy();
    }
  });

  it('names a retest owed and links it to the assessments page', async () => {
    const { start } = endedBlock(1);
    await putMetricEntry({ metricId: 'dead_hang', date: addDays(start, 3), value: 40 });
    await hydrate();
    running(start);
    renderAt('/finish', <FinishPage />);
    // Scoped to the card: the block report above lists every assessment by
    // name too, which is what a bare getByText found first.
    const card = screen.getByText('The retest you owe').closest('section, div')!;
    const link = [...card.querySelectorAll('a')].find((a) => a.textContent?.includes('Dead Hang'));
    expect(link?.getAttribute('href')).toContain('/assessments');
    expect(link?.textContent).toContain('Baseline 40 sec');
  });

  it('shows no retest card when nothing has a lonely baseline', async () => {
    await hydrate();
    running(endedBlock(1).start);
    renderAt('/finish', <FinishPage />);
    expect(screen.queryByText(/retest you owe|retests you owe/)).toBeNull();
  });
});

describe('home, once the block has run out', () => {
  it('stops saying it is week twelve and offers the review', async () => {
    await hydrate();
    running(endedBlock(4).start);
    renderAt('/', <HomePage />);
    expect(screen.queryByText(/Week 12 of 12/)).toBeNull();
    expect(screen.queryByText(/Test week/)).toBeNull();
    expect(screen.getByText(/has run its course/)).toBeTruthy();
    const link = screen.getByText(/what the block moved/i).closest('a');
    expect(link?.getAttribute('href')).toContain('/finish');
  });

  it('stops offering to log a rest day for a block that ended', async () => {
    // `over` sets `isRest`, so the button read "Log rest day" three weeks
    // after the block ran out.
    await hydrate();
    running(endedBlock(4).start);
    renderAt('/', <HomePage />);
    expect(screen.queryByText('Log rest day')).toBeNull();
    expect(screen.getByText('Log a session')).toBeTruthy();
  });

  it('does not claim no program is running when one is', async () => {
    await hydrate();
    running(endedBlock(4).start);
    renderAt('/', <HomePage />);
    expect(screen.queryByText(/no program is running/)).toBeNull();
  });

  it('leaves a running block alone', async () => {
    await hydrate();
    running(addDays(today(), -14));
    renderAt('/', <HomePage />);
    expect(screen.queryByText(/has run its course/)).toBeNull();
  });
});
