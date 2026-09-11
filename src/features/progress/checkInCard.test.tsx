// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import type { CheckIn } from '@/engine/readiness';
import type { RestChecklist } from '@/db/sessions';
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


/**
 * The rest-day ticks reach the page (PLAN.md M94).
 *
 * `engine/restHabits.test.ts` proves the reading. This proves the app looks
 * at it — which is the whole milestone: four booleans collected on every
 * rest day of every block, and every reader that ever touched them
 * collapsed all four into one bit.
 */
describe('the rest card on the progress page', () => {
  const NONE: RestChecklist = { hydration: false, mobility: false, zone1: false, sleep: false };

  /** `n` rest days, a week apart, each ticking `items`. */
  async function restedOn(items: (keyof RestChecklist)[], n: number, offset = 0): Promise<void> {
    const checklist = { ...NONE };
    for (const item of items) checklist[item] = true;
    for (let i = 0; i < n; i++) {
      const date = addDays(today(), -((offset + i) * 7));
      await putSession({
        ...newSession(date, 0),
        completed: true,
        rewarded: true,
        climbs: [],
        restChecklist: { ...checklist },
      });
    }
  }

  it('reads the ticks one at a time', async () => {
    await restedOn(['hydration', 'sleep'], 8);
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    expect(await screen.findByText('How you rest')).toBeTruthy();
    const row = screen.getByText('hydration').closest('div')!;
    expect(row.textContent).toMatch(/8 of 8/);
  });

  it('shows the items never ticked, as zero', async () => {
    await restedOn(['hydration'], 8);
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    await screen.findByText('How you rest');
    expect(screen.getByText('mobility').closest('div')!.textContent).toMatch(/0 of 8/);
  });

  /**
   * The denominator is the rest days that recorded something, not every
   * rest day: a blank checklist is not a failed one.
   */
  it('counts the rows against the rest days that said anything', async () => {
    await restedOn(['hydration'], 6);
    await restedOn([], 4, 6);
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    await screen.findByText('How you rest');
    expect(screen.getByText('hydration').closest('div')!.textContent).toMatch(/6 of 6/);
  });

  it('stays away on too few rest days', async () => {
    await restedOn(['hydration'], 3);
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('How you rest')).toBeNull();
  });

  /**
   * A rest day logged without the checklist is still a rest day. A card
   * that appeared to say "0 of 4, ten times over" would turn "I did not
   * fill in a form" into "I did not recover".
   */
  it('stays away when the checklist was never used', async () => {
    await restedOn([], 10);
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('How you rest')).toBeNull();
  });

  it('names the one you skip most often', async () => {
    await restedOn(['hydration', 'mobility', 'zone1', 'sleep'], 2);
    await restedOn(['hydration', 'mobility', 'zone1'], 6, 2);
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    await screen.findByText('How you rest');
    expect(screen.getByText(/Sleep is the one you skip most often/)).toBeTruthy();
  });
});
