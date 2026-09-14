// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen, within } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { loadPrograms } from '@/content/programs';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { PlaceholderPage } from '@/features/placeholder/PlaceholderPage';
import { DrillsPage } from '@/features/drills/DrillsPage';
import { FinishPage } from '@/features/finish/FinishPage';
import { JournalPage } from '@/features/journal/JournalPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { TrainPage } from '@/features/train/TrainPage';

/**
 * Doors that only open sometimes, and rooms with no way out (PLAN.md M152).
 *
 * Every one of these is a link, an empty-state action or a `BackLink` — the
 * work was deciding which are doors that should exist.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await hydrate();
});

/**
 * Progress renders two entirely different pages, and the card has to be on
 * both. Sessions logged is the switch.
 */
async function withSessions(): Promise<void> {
  const start = today();
  for (let i = 0; i < 6; i += 1) {
    await putSession({
      ...newSession(addDays(start, -i * 2), 0),
      completed: true,
      rpe: 6,
      durationMin: 70,
      climbs: [{ id: `c${i}`, grade: 'V3', scale: 'V', count: 2, result: 'send' }],
    });
  }
  await hydrate();
}

/** Hash routing, so every rendered href carries the `#`. */
const href = (name: string | RegExp) =>
  screen.getByRole('link', { name }).getAttribute('href');

describe('the two screens where the app talks back', () => {
  /**
   * `/review` declares `/progress` as its parent and Progress never linked
   * it; Coach's Corner was worse, its only door being a card on Home that
   * renders nothing when there is nothing to say.
   */
  it('are both reachable from the page that claims them', async () => {
    renderAt('/progress', <ProgressPage />);
    await screen.findByText('Progress');
    const card = screen.getByText('What the app makes of it').closest('section')!;
    expect(within(card).getByRole('link', { name: /This week's note/ }).getAttribute('href')).toBe(
      '#/review',
    );
    expect(within(card).getByRole('link', { name: /Coach's Corner/ }).getAttribute('href')).toBe(
      '#/coach',
    );
  });

  /**
   * The empty branch is a separate `return` above the real page, so a card
   * added to it is not a card on Progress — it is a card on the screen a
   * climber sees once and never again. The battery found this by deleting
   * the populated one and watching the test agree.
   */
  it('are reachable once there are sessions too, which is the page people use', async () => {
    await withSessions();
    renderAt('/progress', <ProgressPage />);
    await screen.findByText(/6 sessions logged/);
    const card = screen.getByText('What the app makes of it').closest('section')!;
    expect(within(card).getByRole('link', { name: /This week's note/ }).getAttribute('href')).toBe(
      '#/review',
    );
    expect(within(card).getByRole('link', { name: /Coach's Corner/ }).getAttribute('href')).toBe(
      '#/coach',
    );
  });

  it('says that a quiet coach is a good answer, since that is when it vanishes from Home', async () => {
    renderAt('/progress', <ProgressPage />);
    await screen.findByText('Progress');
    expect(screen.getByText(/Quiet is a good answer/)).toBeTruthy();
  });
});

describe('rooms that had no way out', () => {
  it('gives the journal a way back and something to do', async () => {
    renderAt('/journal', <JournalPage />);
    await screen.findByText('Journal');
    expect(href(/Progress/)).toBe('#/progress');
    expect(href(/Write one on today/)).toBe('#/today');
  });

  it('gives a fresh install a way to start the block it is asking about', async () => {
    renderAt('/finish', <FinishPage />);
    await screen.findByText(/No program has been run yet/);
    expect(href(/Find a program/)).toBe('#/find');
  });

  /**
   * A 404 is a stale bookmark or a typed URL — no history to go back
   * through, and until this the page had no link of any kind.
   */
  it('gives the 404 somewhere to go', () => {
    renderAt('/nope', <PlaceholderPage title="Not found" subtitle="" body="That page does not exist." />);
    expect(href(/Go to today/)).toBe('#/');
  });
});

describe('the library, where the guide always said it was', () => {
  it('has its door on Train', async () => {
    renderAt('/train', <TrainPage />);
    await screen.findByText('Train');
    expect(href(/^Drills/)).toBe('#/drills');
  });

  /**
   * And the way back agrees. `BackLink` derives the label from `routes.ts`,
   * so this is the assertion that the move is a fact about the hierarchy
   * rather than one more link on one more page: put `/drills` back under
   * Settings and the arrow here reads Settings again.
   */
  it('sends you back to Train, not to Settings', async () => {
    renderAt('/drills', <DrillsPage />);
    await screen.findByRole('heading', { level: 1, name: 'Drills' });
    const back = screen.getByRole('link', { name: /^Train$/ });
    expect(back.getAttribute('href')).toBe('#/train');
  });
});
