// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { getDb, resetDbForTests } from '@/db/db';
import { putSession, newSession, type Session } from '@/db/sessions';
import { addDays, dayOfWeek, today } from '@/engine/dates';
import { MODE_REPAIR_KEY } from '@/engine/sessionMode';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { LogPage } from './LogPage';

/**
 * Where the session happened, from the screens (PLAN.md M170).
 *
 * The engine half is `engine/sessionMode.test.ts`. This is the half that
 * matters most here, because the whole defect was a field with readers and no
 * writer: a rule that is right about what `mode` *should* be, wired to
 * nothing, is the bug again with better prose.
 */

const DAY = today();

async function running(programId: string, typeId: string): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await hydrate();
  useProfile.setState({
    activeProgramId: programId,
    startDates: { [programId]: addDays(DAY, -7) },
    plans: { [programId]: { [dayOfWeek(DAY)]: typeId } as never },
    weekOverrides: {},
    adaptations: {},
    tracks: {},
    injuries: [],
    dismissedTips: {},
  });
  useSettings.setState({ logView: 'full' });
}

const stored = () => useSessions.getState().byDate[DAY]?.[0];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('starting a day the program says is on rock', () => {
  it('files it as an outdoor session', async () => {
    await running('outdoor_climbing', 'outdoor_boulder');
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    fireEvent.click(await screen.findByText(/Start session|Log a session/i));
    await screen.findByText('Climbs');
    expect(stored()?.sessionTypeId).toBe('outdoor_boulder');
    expect(stored()?.mode, 'the outdoor day filed as indoor, as it always did').toBe('outdoor');
  });

  it('files an indoor program indoors, as it always did', async () => {
    await running('iron_grip', 'fp');
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    fireEvent.click(await screen.findByText(/Start session|Log a session/i));
    await screen.findByText('Climbs');
    expect(stored()?.mode).toBe('indoor');
  });

  /**
   * And from the *other* buttons too. The pre-session card offers the
   * planned type as one big button and the rest of the program's types
   * underneath, and a climber picking Outdoor Sport from that list is
   * choosing the same fact.
   */
  it('reads the type the climber picked, not the one the plan placed', async () => {
    await running('outdoor_climbing', 'rest');
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    await screen.findByText(/Log rest day/i);
    fireEvent.click(screen.getByText(/Outdoor Sport/i));
    await screen.findByText('Climbs');
    expect(stored()?.sessionTypeId).toBe('outdoor_sport');
    expect(stored()?.mode).toBe('outdoor');
  });

  it('and the rest day of that same program is not a day on rock', async () => {
    await running('outdoor_climbing', 'rest');
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    fireEvent.click(await screen.findByText(/Log rest day/i));
    await screen.findByText('Recovery checklist');
    expect(stored()?.mode).toBe('indoor');
  });
});

describe('the control, for the Saturday the program could not know about', () => {
  async function openSession(over: Partial<Session> = {}): Promise<void> {
    await running('iron_grip', 'fp');
    await putSession({
      ...newSession(DAY, 0),
      completed: true,
      programId: 'iron_grip',
      sessionTypeId: 'fp',
      ...over,
    });
    await hydrate();
    // After `hydrate`, which loads the settings store from the database and
    // would otherwise put the view back to whatever is saved there. The
    // fields card is the full view's.
    useSettings.setState({ logView: 'full' });
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    await screen.findByText('Climbs');
  }

  it('is on the screen, beside the place', async () => {
    await openSession();
    // Its own label: `location` is already called "Where" and asks for the
    // name of the gym or the crag, so two rows reading "Where" would be the
    // card asking one question twice.
    expect(screen.getByText('Indoors or out')).toBeTruthy();
    expect(screen.getByText('Where')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Indoors' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'On rock' })).toBeTruthy();
  });

  it('shows which one the session already is', async () => {
    await openSession();
    expect(screen.getByRole('button', { name: 'Indoors' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'On rock' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('writes the change to the session', async () => {
    await openSession();
    fireEvent.click(screen.getByRole('button', { name: 'On rock' }));
    // The write goes to storage first and the store after, so the assertion
    // waits for it rather than reading the state mid-flight.
    await waitFor(() => expect(stored()?.mode).toBe('outdoor'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'On rock' }).getAttribute('aria-pressed')).toBe('true'),
    );
  });

  it('and back again', async () => {
    await openSession({ mode: 'outdoor' });
    expect(screen.getByRole('button', { name: 'On rock' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Indoors' }));
    await waitFor(() => expect(stored()?.mode).toBe('indoor'));
  });
});

describe('the log written before any of this existed', () => {
  /** Two outdoor days and an indoor one, all filed indoors, as they were. */
  async function oldLog(): Promise<void> {
    await running('iron_grip', 'fp');
    for (const [i, patch] of [
      { programId: 'outdoor_climbing', sessionTypeId: 'outdoor_boulder' },
      { programId: 'outdoor_climbing', sessionTypeId: 'rest' },
      { programId: 'iron_grip', sessionTypeId: 'fp' },
      { programId: 'outdoor_climbing', sessionTypeId: 'outdoor_sport' },
    ].entries()) {
      await putSession({
        ...newSession(addDays(DAY, -(i + 1)), 0),
        completed: true,
        rpe: 7,
        durationMin: 180,
        ...patch,
      });
    }
    // Boot runs the repair itself, and `running` above has already booted —
    // so the flag is set and these sessions arrived after it. Clearing it is
    // what a climber's real log looks like: written first, repaired once.
    await (await getDb()).delete('meta', MODE_REPAIR_KEY);
    await useSessions.getState().load();
  }

  const modes = () =>
    Object.values(useSessions.getState().byDate)
      .flat()
      .filter((s) => s.sessionTypeId !== undefined)
      .map((s) => `${s.sessionTypeId}:${s.mode}`)
      .sort();

  it('is repaired once, and only where the type says so', async () => {
    await oldLog();
    expect(modes()).toEqual(['fp:indoor', 'outdoor_boulder:indoor', 'outdoor_sport:indoor', 'rest:indoor']);
    const changed = await useSessions.getState().repairOutdoorModes();
    expect(changed).toBe(2);
    expect(modes()).toEqual(['fp:indoor', 'outdoor_boulder:outdoor', 'outdoor_sport:outdoor', 'rest:indoor']);
  });

  it('writes the repair through to storage, not only the store', async () => {
    await oldLog();
    await useSessions.getState().repairOutdoorModes();
    const db = await getDb();
    const rows = await db.getAll('sessions');
    const boulder = rows.find((s) => s.sessionTypeId === 'outdoor_boulder');
    expect(boulder?.mode).toBe('outdoor');
  });

  /**
   * And never again. Once the logger can set `mode`, `'indoor'` on an
   * outdoor type is a sentence the climber may have said — a session on
   * Outdoor Bouldering's type that happened on plastic — and a repair that
   * ran every boot would overwrite them forever.
   */
  it('does not run a second time, so a corrected session stays corrected', async () => {
    await oldLog();
    await useSessions.getState().repairOutdoorModes();
    const boulder = Object.values(useSessions.getState().byDate)
      .flat()
      .find((s) => s.sessionTypeId === 'outdoor_boulder')!;
    await useSessions.getState().update({ ...boulder, mode: 'indoor' });

    expect(await useSessions.getState().repairOutdoorModes()).toBe(0);
    expect(modes()).toContain('outdoor_boulder:indoor');
  });

  it('records that it ran, so the guard has something to read', async () => {
    await oldLog();
    const db = await getDb();
    expect(await db.get('meta', MODE_REPAIR_KEY), 'the fixture left the flag set').toBeUndefined();
    await useSessions.getState().repairOutdoorModes();
    expect(await db.get('meta', MODE_REPAIR_KEY)).toBeTruthy();
  });

  it('is a no-op on a log with nothing outdoors in it', async () => {
    await running('iron_grip', 'fp');
    await putSession({
      ...newSession(addDays(DAY, -1), 0),
      completed: true,
      programId: 'iron_grip',
      sessionTypeId: 'fp',
    });
    await useSessions.getState().load();
    expect(await useSessions.getState().repairOutdoorModes()).toBe(0);
  });

  /** And it runs at boot, which is the only place it can reach a real log. */
  it('runs as part of hydrating the app', async () => {
    await oldLog();
    await hydrate();
    expect(modes()).toContain('outdoor_boulder:outdoor');
  });
});
