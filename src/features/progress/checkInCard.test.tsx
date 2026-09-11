// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import type { CheckIn } from '@/engine/readiness';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProgressPage } from './ProgressPage';

/**
 * The check-in reaches the page it was written for (PLAN.md M82).
 *
 * `engine/checkIns.test.ts` proves the maths. This proves the page calls
 * it — the failure this app keeps shipping is a card that is written and
 * never rendered, which a source scan cannot tell from one that is.
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
