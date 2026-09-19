// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { today } from '@/engine/dates';
import { forgetOpenedView, openAt, openedViewFor } from '@/lib/openedView';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { PreSessionCard } from './PreSession';
import { DayBody } from './LogPage';

/**
 * Which view a session opens in, and for how long (PLAN.md M297).
 *
 * Home's two buttons name two views and used to write the stored
 * preference, so tapping *Quick log* once made quick the view for every
 * session opened afterwards — including one opened from the calendar days
 * later. The choice belongs to the session it was made for.
 */

const DATE = today();

async function openLogger(view: 'quick' | 'full', stored: 'quick' | 'full' = 'full') {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await putSession({ ...newSession(DATE, 0), completed: true, climbs: [] } as never);
  await hydrate();
  useProfile.setState({ activeProgramId: null, startDates: {} });
  useSettings.setState({ logView: stored });
  openAt(DATE, view);
  renderAt('/', <DayBody date={DATE} />);
  await screen.findByText('Climbs');
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  forgetOpenedView();
});

describe('the view a session was opened in', () => {
  it('beats the stored preference', async () => {
    await openLogger('quick', 'full');
    expect(screen.queryByText('Photos'), 'the stored full view won').toBeNull();
    expect(screen.getByRole('button', { name: /^More/ })).toBeTruthy();
  });

  it('and does not overwrite it', async () => {
    await openLogger('quick', 'full');
    expect(useSettings.getState().logView, 'the preference was rewritten').toBe('full');
  });

  it('works the other way too', async () => {
    await openLogger('full', 'quick');
    expect(screen.getByText('Photos')).toBeTruthy();
    expect(useSettings.getState().logView).toBe('quick');
  });

  /** A date nobody opened deliberately falls back to the preference. */
  it('says nothing about a session opened some other way', async () => {
    await openLogger('quick', 'full');
    expect(openedViewFor('2020-01-01')).toBeNull();
  });
});

describe('the two buttons on Home', () => {
  /**
   * Through the card itself, not through `openAt`. The first battery ran
   * with every test driving `DayBody` directly, so a mutant that put
   * `setLogView` back in the start button survived: nothing in the suite
   * ever pressed one.
   */
  async function onHome(stored: 'quick' | 'full') {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    await hydrate();
    useProfile.setState({ activeProgramId: null, startDates: {} });
    useSettings.setState({ logView: stored });
    renderAt('/', <PreSessionCard date={DATE} onOpen={() => undefined} />);
    await screen.findByRole('button', { name: /Quick log/ });
  }

  it('choose the view without touching the preference', async () => {
    await onHome('full');
    fireEvent.click(screen.getByRole('button', { name: /Quick log/ }));
    await waitFor(() => expect(openedViewFor(DATE)).toBe('quick'));
    expect(useSettings.getState().logView, 'Quick log rewrote the setting').toBe('full');
  });

  it('and the big one says full, equally quietly', async () => {
    await onHome('quick');
    fireEvent.click(await screen.findByRole('button', { name: /Log a session|Start session/ }));
    await waitFor(() => expect(openedViewFor(DATE)).toBe('full'));
    expect(useSettings.getState().logView).toBe('quick');
  });
});

describe('the fold’s own buttons', () => {
  /**
   * These are the climber saying what they prefer, which is the
   * distinction the old code drew in the wrong place: it protected the
   * in-logger toggle from Home and let Home's buttons write the setting.
   */
  it('do write the preference, and this session with it', async () => {
    await openLogger('quick', 'quick');
    fireEvent.click(screen.getByRole('button', { name: /^More/ }));
    await waitFor(() => expect(useSettings.getState().logView).toBe('full'));
    expect(openedViewFor(DATE)).toBe('full');
    expect(screen.getByText('Photos')).toBeTruthy();
  });

  /** And the override does not then fight the climber's own tap. */
  it('are not undone by the view the session opened in', async () => {
    await openLogger('quick', 'full');
    fireEvent.click(screen.getByRole('button', { name: /^More/ }));
    await waitFor(() => expect(screen.getByText('Photos')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Less/ }));
    await waitFor(() => expect(screen.queryByText('Photos')).toBeNull());
  });
});
