// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import type { CheckIn } from '@/engine/readiness';
import { fireEvent } from '@testing-library/react';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProgressPage } from './ProgressPage';

/**
 * The cards reach the page they were written for (PLAN.md M82, M83).
 *
 * The engine tests prove the maths. These prove the page calls it — the
 * failure this app keeps shipping is a card that is written and never
 * rendered, which a source scan cannot tell from one that is.
 */

const fine: CheckIn = { fingers: 'good', sleep: 'good' };
const rough: CheckIn = { fingers: 'tender', sleep: 'short' };

async function log(daysAgo: number, patch: Partial<Parameters<typeof putSession>[0]> = {}) {
  const date = addDays(today(), -daysAgo);
  await putSession({
    ...newSession(date, 0),
    completed: true,
    rewarded: true,
    rpe: 6,
    durationMin: 60,
    climbs: [{ id: `c${daysAgo}`, grade: 'V3', scale: 'V', count: 1, result: 'send' }],
    ...patch,
  });
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  reset();
});

describe('the check-in card on the progress page', () => {
  it('stays away entirely when nothing was ever answered', async () => {
    for (let i = 1; i <= 6; i += 1) await log(i);
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    expect(screen.queryByText('How you were feeling')).toBeNull();
  });

  it('appears with the coverage stated, once one is', async () => {
    await log(1, { checkIn: rough, rpe: 9 });
    for (let i = 2; i <= 5; i += 1) await log(i);
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    expect(screen.getByText('How you were feeling')).toBeTruthy();
    expect(screen.getByText(/Answered on 1 of 5 sessions/)).toBeTruthy();
  });

  it('lists a session that went past the ceiling, linked to its log', async () => {
    await log(1, { checkIn: rough, rpe: 9 });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    const link = screen.getByText(/RPE 9 against a ceiling of 7/).closest('a');
    expect(link?.getAttribute('href')).toContain(addDays(today(), -1));
  });

  it('lists nothing when every ceiling held', async () => {
    await log(1, { checkIn: rough, rpe: 6 });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    expect(screen.queryByText(/against a ceiling of/)).toBeNull();
    expect(screen.getByText(/stayed under it every time/)).toBeTruthy();
  });

  it('admits the ordering it cannot know', async () => {
    await log(1, { checkIn: fine, rpe: 6 });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    expect(screen.getByText(/Nothing records which you entered first/)).toBeTruthy();
  });
});

describe('the conversion card on the progress page', () => {
  it('stays away until a grade has been climbed', async () => {
    await putSession({ ...newSession(addDays(today(), -1), 0), completed: true, rewarded: true, rpe: 6, durationMin: 60, climbs: [] });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    expect(screen.queryByText('Sends per try, block by block')).toBeNull();
  });

  it('appears once there are climbs, and follows the scale chip', async () => {
    await log(1, {
      climbs: [
        { id: 'b1', grade: 'V5', scale: 'V', count: 4, result: 'send' },
        { id: 'b2', grade: 'V5', scale: 'V', count: 6, result: 'attempt' },
      ],
    });
    await log(3, {
      climbs: [{ id: 'r1', grade: '5.11a', scale: 'YDS', count: 9, result: 'send' }],
    });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    const heading = screen.getByText('Sends per try, block by block');
    // Scoped to the card: the route grade is on the page in the personal
    // records, which is what a bare queryByText found the first time.
    const grid = heading.closest('section, div')!.querySelector('svg')!;
    expect(grid.textContent).toContain('V5');
    expect(grid.textContent).not.toContain('5.11a');
  });

  it('switches ladders with the scale chip', async () => {
    // Hardcoding 'V' passed every other test here, because every other
    // test uses the default chip.
    await log(1, { climbs: [{ id: 'b1', grade: 'V5', scale: 'V', count: 10, result: 'send' }] });
    await log(3, { climbs: [{ id: 'r1', grade: '5.11a', scale: 'YDS', count: 10, result: 'send' }] });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    const grid = () =>
      screen.getByText('Sends per try, block by block').closest('section, div')!.querySelector('svg')!;
    expect(grid().textContent).toContain('V5');
    fireEvent.click(screen.getByText('Routes'));
    expect(grid().textContent).toContain('5.11a');
    expect(grid().textContent).not.toContain('V5');
  });

  it('labels grades the way the climber has chosen to read them', async () => {
    // Same reason: the default display is 'V', so a grid that ignored the
    // setting entirely was indistinguishable from one that honoured it.
    await log(1, { climbs: [{ id: 'b1', grade: 'V5', scale: 'V', count: 10, result: 'send' }] });
    await hydrate();
    // After hydrate, which loads the stored settings over anything set here.
    useSettings.setState({ display: { boulder: 'Font', route: 'YDS' } });
    renderAt('/progress', <ProgressPage />);
    const grid = screen
      .getByText('Sends per try, block by block')
      .closest('section, div')!
      .querySelector('svg')!;
    expect(grid.textContent).not.toContain('V5');
    expect(grid.textContent).toContain('6C');
  });

  it('explains a blank block rather than leaving it bare', async () => {
    await log(1, {
      climbs: [{ id: 'b1', grade: 'V5', scale: 'V', count: 10, result: 'attempt' }],
    });
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    expect(screen.getByText(/too few to read/)).toBeTruthy();
  });
});
