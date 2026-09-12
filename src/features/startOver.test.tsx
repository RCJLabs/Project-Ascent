// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { getDb } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { SettingsPage } from '@/features/settings/SettingsPage';

/**
 * Delete everything, on the page (PLAN.md M114).
 *
 * The engine is tested in `db/erase.test.ts`. What is left is the friction:
 * an offline app has no cloud copy, so the one thing that must not be
 * possible is deleting a year of training with a single mis-tap.
 */

async function settings(withData = true): Promise<void> {
  await loadPrograms();
  await reset();
  if (withData) {
    await putSession(newSession('2026-03-01', 0, { completed: true }) as never);
    const db = await getDb();
    await db.put('projects', { id: 'p1', name: 'The Nose' } as never);
  }
  await hydrate();
  renderAt('/settings', <SettingsPage />);
  await screen.findByText('Start over');
}

const card = () => {
  const heading = screen.getByText('Start over');
  const box = heading.closest('section, div[class*="rounded"]');
  if (!box) throw new Error('the Start over card has no container');
  return within(box as HTMLElement);
};

const deleteButton = () =>
  card()
    .getAllByRole('button')
    .find((b) => /^Delete everything$/.test(b.textContent ?? ''))!;

describe('the way in', () => {
  it('is offered whether or not there is anything to delete', async () => {
    // Unlike the sample-data card, which is gated. A control that appears
    // only once you have data is one a climber has never seen before the
    // day they need it.
    await settings(false);
    expect(screen.getByText('Start over')).toBeTruthy();
  });

  it('says there is no way back and no cloud copy', async () => {
    await settings();
    expect(card().getByText(/cannot\s+be\s+undone/i)).toBeTruthy();
    expect(card().getByText(/export a backup first/i)).toBeTruthy();
  });

  it('says what it does not take', async () => {
    // M60 put theme and text size in localStorage because they belong to
    // the phone rather than the climber. Erasing keeps that split, and a
    // climber should not have to discover it by finding the app in light
    // mode afterwards.
    await settings();
    expect(card().getByText(/theme and text size stay/i)).toBeTruthy();
  });
});

describe('one tap is never enough', () => {
  it('asks for the word before it will do anything', async () => {
    await settings();
    deleteButton().click();
    await waitFor(() => expect(screen.getByLabelText(/Type DELETE to confirm/i)).toBeTruthy());
    expect(deleteButton().hasAttribute('disabled')).toBe(true);
  });

  it('stays disabled for the wrong word', async () => {
    await settings();
    deleteButton().click();
    const box = await screen.findByLabelText(/Type DELETE to confirm/i);
    fireEvent.change(box, { target: { value: 'delete everything' } });
    expect(deleteButton().hasAttribute('disabled')).toBe(true);
  });

  it('accepts the word in any case, because phones capitalise', async () => {
    await settings();
    deleteButton().click();
    const box = await screen.findByLabelText(/Type DELETE to confirm/i);
    fireEvent.change(box, { target: { value: 'delete' } });
    await waitFor(() => expect(deleteButton().hasAttribute('disabled')).toBe(false));
  });

  it('can be backed out of', async () => {
    await settings();
    deleteButton().click();
    await screen.findByLabelText(/Type DELETE to confirm/i);
    card().getByText('Cancel').click();
    await waitFor(() => expect(screen.queryByLabelText(/Type DELETE to confirm/i)).toBeNull());
  });

  it('does not delete anything on the way through', async () => {
    // The whole point. Opening the panel, typing, and cancelling must leave
    // the database exactly as it was.
    await settings();
    const db = await getDb();
    deleteButton().click();
    const box = await screen.findByLabelText(/Type DELETE to confirm/i);
    fireEvent.change(box, { target: { value: 'DELETE' } });
    card().getByText('Cancel').click();
    expect(await db.count('sessions')).toBe(1);
    expect(await db.count('projects')).toBe(1);
  });
});

describe('when it does happen', () => {
  it('empties the database', async () => {
    await settings();
    const db = await getDb();
    deleteButton().click();
    const box = await screen.findByLabelText(/Type DELETE to confirm/i);
    fireEvent.change(box, { target: { value: 'DELETE' } });
    deleteButton().click();
    await waitFor(async () => expect(await db.count('sessions')).toBe(0));
    expect(await db.count('projects')).toBe(0);
  });

  /**
   * The count reaches the page — and in the running app almost nobody reads
   * it, which is worth writing down rather than discovering later.
   *
   * A wiped profile has `onboardedAt` and `activeProgramId` null and an
   * empty log, which is exactly what `useFirstRunRedirect` in `App.tsx`
   * keys on, so the real app navigates to `/welcome` and unmounts this page
   * within a frame. The browser check for M114 confirmed it: the message
   * never appeared on screen. It passes here because this test renders
   * `SettingsPage` alone, without the shell that redirects.
   *
   * The message stays because `announce` puts it on an aria-live region
   * before the unmount, and because the count is what the assertion below
   * can see. **The redirect is the real confirmation** — landing on "let's
   * find out where you're starting from" says everything went more plainly
   * than a line of text would. Nobody should add a delay or a modal to make
   * this readable; the test below is the one that matters.
   */
  it('reports how much went, even though the redirect eats it', async () => {
    await settings();
    deleteButton().click();
    const box = await screen.findByLabelText(/Type DELETE to confirm/i);
    fireEvent.change(box, { target: { value: 'DELETE' } });
    deleteButton().click();
    expect(await screen.findByText(/Deleted — 2 records/)).toBeTruthy();
  });

  it('leaves the app in the state a first run is', async () => {
    // What `useFirstRunRedirect` reads: no onboarding stamp, no active
    // program, no sessions. Asserting the three inputs rather than the
    // navigation, because the hook lives in the app shell and this page
    // renders without it — but these are what make it fire, and a wipe that
    // left any of them set would strand the climber on a Settings page for
    // an app with nothing in it.
    await settings();
    deleteButton().click();
    const box = await screen.findByLabelText(/Type DELETE to confirm/i);
    fireEvent.change(box, { target: { value: 'DELETE' } });
    deleteButton().click();

    // All three in the `waitFor`: the stores reload in parallel, so waiting
    // on the profile alone can return while sessions are still loading —
    // the same window `store/hydrating.ts` exists for, showing up here as a
    // flaky assertion rather than as a bug.
    await waitFor(() => {
      expect(useProfile.getState().onboardedAt).toBeNull();
      expect(useProfile.getState().activeProgramId).toBeNull();
      expect(Object.keys(useSessions.getState().byDate)).toEqual([]);
    });
  });

  it('never stacks two text colours on the confirming button', async () => {
    // The calendar cell's trap, met again: two equal-specificity classes
    // resolve by Tailwind's emit order rather than by the order they were
    // written, and jsdom cannot see which won. What it can see is that
    // there is only one — the `danger` variant rather than `outline` with a
    // colour painted over it. The browser showed the first version losing.
    await settings();
    deleteButton().click();
    await screen.findByLabelText(/Type DELETE to confirm/i);
    const colours = deleteButton()
      .className.split(/\s+/)
      .filter((c) => /^text-(?!sm$|base$|lg$|xs$|2xs$)/.test(c));
    expect(colours, `it had ${colours.length}`).toHaveLength(1);
    expect(colours[0]).toBe('text-danger');
  });

  it('closes the confirmation rather than leaving it armed', async () => {
    await settings();
    deleteButton().click();
    const box = await screen.findByLabelText(/Type DELETE to confirm/i);
    fireEvent.change(box, { target: { value: 'DELETE' } });
    deleteButton().click();
    await waitFor(() => expect(screen.queryByLabelText(/Type DELETE to confirm/i)).toBeNull());
  });

  it('empties the stores, not only the database', async () => {
    // Found by mutation: removing the `hydrateAll` after the wipe changed
    // nothing any test could see, because the sample-data card re-reads the
    // database directly. The stores would have gone on holding a year of
    // sessions over an empty database — and since they persist what they
    // hold, the next write puts it all back.
    await settings();
    expect(Object.keys(useSessions.getState().byDate).length).toBe(1);
    useProfile.setState({ activeProgramId: 'base_camp' } as never);

    deleteButton().click();
    const box = await screen.findByLabelText(/Type DELETE to confirm/i);
    fireEvent.change(box, { target: { value: 'DELETE' } });
    deleteButton().click();

    await waitFor(() => expect(Object.keys(useSessions.getState().byDate)).toEqual([]));
    expect(useProfile.getState().activeProgramId).toBeNull();
  });

  it('offers the sample climber again', async () => {
    // The reason the milestone exists: `canLoadDemo` is `!hasRealData()`, so
    // one logged session used to lock the demo away for good.
    await settings();
    expect(screen.queryByText('Load a sample climber')).toBeNull();
    deleteButton().click();
    const box = await screen.findByLabelText(/Type DELETE to confirm/i);
    fireEvent.change(box, { target: { value: 'DELETE' } });
    deleteButton().click();
    expect(await screen.findByText('Load a sample climber')).toBeTruthy();
  });
});
