// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { HomePage } from './HomePage';

/**
 * The climber who already has a log (PLAN.md M290).
 *
 * Measured on a fresh install: Home offers five ways to start from nothing
 * and never once says the word *backup*. The backup format was never the gap
 * — it is one .zip with every store and the photos at their own size — so
 * what this holds is the one thing that was missing, which is that a climber
 * standing on the new phone is told the file can come in.
 */

const DAY = today();

const card = () =>
  screen.queryByRole('heading', { name: 'Moved from another phone?', level: 2 });

async function fresh(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  window.location.hash = '';
}

async function logged(): Promise<void> {
  await putSession({
    id: `${addDays(DAY, -1)}#0`,
    date: addDays(DAY, -1),
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 60,
    warmup: true,
    climbs: [],
    createdAt: `${DAY}T18:00:00.000Z`,
    updatedAt: `${DAY}T18:00:00.000Z`,
  } as Session);
  await hydrate();
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('the offer to bring a log across', () => {
  it('is on a fresh install, where every other card assumes a new climber', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(card()).toBeTruthy();
  });

  /**
   * The whole point, from the outside: the word a climber looking for this
   * would search for was on no part of this screen.
   */
  it('says what the move actually is, and where the file goes in', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    const said = document.body.textContent ?? '';
    expect(said).toContain('backup');
    expect(said, 'the card it lands beside, named').toContain('Your data');
    expect(said, 'the part a climber is most afraid of losing').toContain('photos');
    expect(screen.getByRole('link', { name: /Restore a backup/ }).getAttribute('href'))
      .toContain('/settings');
  });

  it('can be waved away like the others', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    fireEvent.click(screen.getByRole('button', { name: 'Not now, moved from another phone' }));
    expect(card()).toBeNull();
    await waitFor(() => {
      expect(useProfile.getState().dismissedCards).toContain('restore');
    });
  });

  /**
   * Against the log rather than against a dismissal, because a restore is
   * what the card is for: once anything is in the log it has either
   * happened or stopped being the question.
   */
  it('goes once there is a log on this phone, waved away or not', async () => {
    await fresh();
    await logged();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(card()).toBeNull();
    expect(useProfile.getState().dismissedCards).not.toContain('restore');
  });

  /** And it sits under the note about hurting yourself, never above it. */
  it('comes after the safety note and before the setup offer', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent ?? '');
    expect(headings.indexOf('Moved from another phone?')).toBeGreaterThan(
      headings.indexOf('Before you train'),
    );
    expect(headings.indexOf('Moved from another phone?')).toBeLessThan(
      headings.indexOf('Set up your climber'),
    );
  });
});
