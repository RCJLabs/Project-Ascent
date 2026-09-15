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
 * The one card that stopped for no reason (PLAN.md M181).
 *
 * The other two first-run cards each have a fact behind them — `onboardedAt`
 * for the setup offer, a running block for the catalogue — and the safety
 * note had none. It showed until *Got it* and then never again, for the life
 * of the install, on the card that is about hurting yourself.
 *
 * Most of what it warns about is hangboarding and campusing, which a climber
 * may not touch for months. So the dismissal names the fact: waved away with
 * no finger-loading session in the log, it comes back when there is one.
 */

const DAY = today();

const card = () => screen.queryByRole('heading', { name: 'Before you train', level: 2 });

async function fresh(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  window.location.hash = '';
}

/**
 * A session the app itself calls finger work.
 *
 * Through the **session type**, which `fingerGap`'s own docblock calls the
 * most reliable of the three readings: *"a climber who taps 'Hangboard /
 * Finger' and completes it has said what they did"*. The first draft of this
 * fixture put the words in `notes`, which `words()` does not read — so the
 * card correctly stayed away and the test failed for the right reason.
 */
async function hangboarded(): Promise<void> {
  await putSession({
    id: `${addDays(DAY, -1)}#0`,
    date: addDays(DAY, -1),
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    programId: 'general_training',
    sessionTypeId: 'hb',
    rpe: 7,
    durationMin: 45,
    warmup: true,
    drillDone: false,
    climbs: [],
    createdAt: `${DAY}T18:00:00.000Z`,
    updatedAt: `${DAY}T18:00:00.000Z`,
  } as Session);
  await hydrate();
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('the safety note', () => {
  it('is on a fresh install', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(card()).toBeTruthy();
  });

  it('goes away when it is read', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(card()).toBeNull();
  });

  /** And the dismissal says what it was read against. */
  it('records the training it was waved away before', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => {
      expect(useProfile.getState().dismissedCards).toEqual(['safety:before']);
    });
  });

  /**
   * The defect, from the outside: read the note in week one, start
   * hangboarding in month three, and the warning about hangboarding is the
   * one thing the app will not show you.
   */
  it('comes back the first time a finger session is logged', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(card()).toBeNull();

    await hangboarded();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(card(), 'the note stayed away from the training it is about').toBeTruthy();
  });

  /** Read against that training, it stays read. */
  it('stays away once it has been read beside the finger work', async () => {
    await fresh();
    await hangboarded();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => {
      expect(useProfile.getState().dismissedCards).toEqual(['safety:loading']);
    });
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(card()).toBeNull();
  });

  /**
   * An ordinary bouldering session is not finger work in the sense the note
   * means, or the card would return for everybody on their second session
   * and the fact would be no fact at all.
   */
  it('does not return for a session that is not finger work', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await putSession({
      id: `${addDays(DAY, -1)}#0`,
      date: addDays(DAY, -1),
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: 6,
      durationMin: 90,
      warmup: true,
      drillDone: false,
      climbs: [
        { id: 'c1', grade: 'V4', scale: 'V', count: 5, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${DAY}T18:00:00.000Z`,
      updatedAt: `${DAY}T18:00:00.000Z`,
    } as Session);
    await hydrate();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(card()).toBeNull();
  });
});
