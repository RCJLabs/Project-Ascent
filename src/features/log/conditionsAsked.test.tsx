// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putSession, newSession, type Session } from '@/db/sessions';
import { addDays, dayOfWeek, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { LogPage } from './LogPage';

/**
 * Asking how the rock was, and only where the answer varies (PLAN.md M289).
 *
 * The engine half is `engine/conditions.test.ts`. This is the half M170's own
 * test calls the one that matters: a question nothing renders is a field with
 * readers and no writer, which is the defect that milestone existed for.
 */

const DAY = today();
const stored = () => useSessions.getState().byDate[DAY]?.[0];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

async function openSession(over: Partial<Session> = {}): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await hydrate();
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: addDays(DAY, -7) },
    plans: { iron_grip: { [dayOfWeek(DAY)]: 'fp' } as never },
    weekOverrides: {},
    adaptations: {},
    tracks: {},
    injuries: [],
    dismissedTips: {},
  });
  await putSession({
    ...newSession(DAY, 0),
    completed: true,
    programId: 'iron_grip',
    sessionTypeId: 'fp',
    ...over,
  });
  await hydrate();
  // The fields card belongs to the full view, and `hydrate` puts the view
  // back to whatever the database holds.
  useSettings.setState({ logView: 'full' });
  renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
  await screen.findByText('Climbs');
}

describe('the question a day on rock gets', () => {
  it('is not asked in the gym, where the answer never changes', async () => {
    await openSession();
    expect(screen.queryByText('Conditions')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Greasy' })).toBeNull();
  });

  it('is asked on rock, in words rather than degrees', async () => {
    await openSession({ mode: 'outdoor' });
    expect(screen.getByText('Conditions')).toBeTruthy();
    for (const word of ['Greasy', 'Okay', 'Good']) {
      expect(screen.getByRole('button', { name: word }), word).toBeTruthy();
    }
  });

  /**
   * `mode` is the writer, and it is a chip on this same card — so a climber
   * who logged Saturday's crag day under an indoor program turns the day to
   * *On rock* and the question has to arrive with it.
   */
  it('arrives when the day is corrected to a day on rock', async () => {
    await openSession();
    fireEvent.click(screen.getByRole('button', { name: 'On rock' }));
    await waitFor(() => expect(stored()?.mode).toBe('outdoor'));
    await waitFor(() => expect(screen.getByText('Conditions')).toBeTruthy());
  });

  it('writes the answer to the session, as the word', async () => {
    await openSession({ mode: 'outdoor' });
    fireEvent.click(screen.getByRole('button', { name: 'Greasy' }));
    await waitFor(() => expect(stored()?.fields?.conditions).toBe('Greasy'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Greasy' }).getAttribute('aria-pressed')).toBe('true'),
    );
  });

  it('takes the answer back off when it is tapped again', async () => {
    await openSession({ mode: 'outdoor', fields: { conditions: 'Good' } });
    expect(screen.getByRole('button', { name: 'Good' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Good' }));
    await waitFor(() => expect(stored()?.fields?.conditions).toBeUndefined());
  });

  it('swaps one answer for another rather than keeping both', async () => {
    await openSession({ mode: 'outdoor', fields: { conditions: 'Good' } });
    fireEvent.click(screen.getByRole('button', { name: 'Okay' }));
    await waitFor(() => expect(stored()?.fields?.conditions).toBe('Okay'));
  });
});
