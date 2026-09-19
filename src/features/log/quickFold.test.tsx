// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { FIELDS } from '@/content/fields';
import { resetDbForTests } from '@/db/db';
import { putSession, newSession, type Session } from '@/db/sessions';
import { addDays, dayOfWeek, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { LogPage } from './LogPage';

/**
 * What the quick view is for (PLAN.md M295).
 *
 * `quick` is the default (`store/settings.ts`), and until this milestone the
 * three fields the logger asks of *everyone* — where it happened, which kind
 * of place, and how the rock was — all sat behind a fold that starts closed.
 * Each of the three was built because the field had no writer at all, which
 * is the defect arriving by the other door.
 */

const DAY = today();
const stored = () => useSessions.getState().byDate[DAY]?.[0];

async function openSession(
  over: Partial<Session> = {},
  view: 'quick' | 'full' = 'quick',
  program = 'outdoor_climbing',
  typeId = 'outdoor_boulder',
) {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await putSession({
    ...newSession(DAY, 0),
    completed: true,
    programId: 'outdoor_climbing',
    sessionTypeId: 'outdoor_boulder',
    mode: 'outdoor',
    ...over,
  });
  await hydrate();
  // After the last `hydrate`, which reads the profile back out of the
  // database and would otherwise drop this on the floor. The first draft
  // set it before, and every test here passed against a climber running no
  // program at all — so the half about a program's own questions was
  // checking nothing.
  useProfile.setState({
    activeProgramId: program,
    startDates: { [program]: addDays(DAY, -7) },
    plans: { [program]: { [dayOfWeek(DAY)]: typeId } as never },
    weekOverrides: {},
    adaptations: {},
    tracks: {},
    injuries: [],
    dismissedTips: {},
  });
  useSettings.setState({ logView: view });
  renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
  await screen.findByText('Climbs');
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('the three questions the app asks everyone', () => {
  it('are in the quick view, which is the one a climber gets', async () => {
    await openSession();
    expect(screen.getByText('Indoors or out')).toBeTruthy();
    expect(screen.getByText('Where')).toBeTruthy();
    expect(screen.getByText('Conditions')).toBeTruthy();
  });

  it('write to the session from there, without opening anything', async () => {
    await openSession();
    fireEvent.click(screen.getByRole('button', { name: 'Greasy' }));
    await waitFor(() => expect(stored()?.fields?.conditions).toBe('Greasy'));
    fireEvent.click(screen.getByRole('button', { name: 'Indoors' }));
    await waitFor(() => expect(stored()?.mode).toBe('indoor'));
  });

  /**
   * The case M170 named and could not serve: *"a climber on Iron Grip who
   * went to the crag on Saturday is the case the session type cannot know
   * about"*. On an indoor program, in the default view, turning the day to
   * On rock has to be possible — and the conditions question has to follow.
   */
  it('let an indoor program record a day on rock, and then ask about it', async () => {
    await openSession(
      { programId: 'iron_grip', sessionTypeId: 'fp', mode: 'indoor' },
      'quick',
      'iron_grip',
      'fp',
    );
    expect(screen.queryByText('Conditions')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'On rock' }));
    await waitFor(() => expect(stored()?.mode).toBe('outdoor'));
    await waitFor(() => expect(screen.getByText('Conditions')).toBeTruthy());
  });

  /**
   * And the fold keeps the program's own questions. The split is read off
   * `alwaysAsked` rather than listed in the component, so a fourth field
   * lands in the right half by saying so in the registry.
   */
  it('leave the program’s questions behind the fold', async () => {
    const declared = Object.values(FIELDS).filter(
      (f) => f.alwaysAsked === undefined && f.retired === undefined,
    );
    expect(declared.length, 'no program-declared fields to check').toBeGreaterThan(4);

    await openSession();
    // Outdoor Boulder declares several; "Day of the trip" is one of them.
    expect(screen.queryByText('Day of the trip')).toBeNull();
  });

  it('and show them once the fold is open, beside the quick half', async () => {
    await openSession({}, 'full');
    expect(screen.getByText('Day of the trip')).toBeTruthy();
    expect(screen.getByText('Where'), 'the quick half left when the fold opened').toBeTruthy();
    expect(screen.getByText('Conditions')).toBeTruthy();
  });
});

describe('the fold’s own label', () => {
  /**
   * It used to name five of the ten cards behind it, which reads as the
   * whole of them. It names none now, and the three worth opening it for
   * are in front of it instead.
   */
  it('no longer claims a list it gets wrong', async () => {
    await openSession();
    const more = screen.getByRole('button', { name: /^More/ });
    expect(more.textContent).toBe('More about this session');
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('still opens and closes', async () => {
    await openSession();
    fireEvent.click(screen.getByRole('button', { name: /^More/ }));
    await waitFor(() => expect(useSettings.getState().logView).toBe('full'));
    expect(screen.getByRole('button', { name: /^Less/ })).toBeTruthy();
  });
});
