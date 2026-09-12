// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { canLoadDemo, loadDemo } from '@/db/demo';
import { daysBetween, today } from '@/engine/dates';
import { getSession, newSession, putSession } from '@/db/sessions';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { DemoBanner } from '@/ui/DemoBanner';

/**
 * A climber who does not exist, on screen (PLAN.md M110).
 *
 * The stated risk is sample data mistaken for a real log, so most of what
 * is here is about the gates and the way out rather than the data.
 */

async function settings() {
  renderAt('/settings', <SettingsPage />);
  await screen.findByText('Your data');
}

/**
 * An empty database, waited for rather than assumed.
 *
 * The profile store saves with `void save(...)` and the demo load is driven
 * from a click, so a plain `reset()` can clear the stores while the previous
 * test's writes are still in flight — they then land *after* the clear and
 * the next test opens on a log that is not empty. Waiting on the gate the
 * feature itself uses is the check that matters.
 */
async function emptied() {
  // Cleared until it stays cleared. The stores persist with fire-and-forget
  // writes, so a `reset()` can run *between* a previous test's save being
  // issued and it landing — measured here as exactly one project surviving
  // the clear. Retrying until the feature's own gate agrees is the check
  // that matters, and it is the gate this file is about.
  await waitFor(async () => {
    await reset();
    expect(await canLoadDemo()).toBe(true);
  });
  await hydrate();
}

describe('the offer', () => {
  it('is made on an empty log', async () => {
    await emptied();
    await settings();
    expect(await screen.findByText('Load a sample climber')).toBeTruthy();
  });

  // The same gate the backup import uses before it takes a restore point.
  it('is not made once there is anything real', async () => {
    await reset();
    await putSession(newSession('2026-01-01', 0, { completed: true }) as never);
    await hydrate();
    await settings();
    await waitFor(() => expect(screen.queryByText('Load a sample climber')).toBeNull());
    expect(screen.queryByText('Sample data')).toBeNull();
  });
});

describe('loading and clearing it', () => {
  it('fills the log and starts the program', async () => {
    await emptied();
    await settings();
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy());
    expect(Object.keys(useSessions.getState().byDate).length).toBeGreaterThan(50);
    expect(useProfile.getState().activeProgramId).toBe('iron_grip');
    expect(useProfile.getState().injuries).toHaveLength(1);
    // Backdated, so the block is six weeks in rather than on day one —
    // which is the difference between a Train page with something on it
    // and an empty one.
    const started = useProfile.getState().startDates['iron_grip']!;
    expect(started < today()).toBe(true);
    expect(daysBetween(started, today())).toBeGreaterThan(21);
  });

  it('offers the way out once it is loaded, and not the way in', async () => {
    await emptied();
    await settings();
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText('Clear the sample data')).toBeTruthy());
    expect(screen.queryByText('Load a sample climber')).toBeNull();
  });

  /**
   * The stated risk, held as a test: a climber who loads the sample data,
   * likes it, logs a real session and then clears keeps that session.
   */
  it('leaves what the climber logged themselves', async () => {
    await emptied();
    await settings();
    // Loaded through the button, so the program and the injury are really
    // there to be cleared. Calling `loadDemo` directly leaves the profile
    // untouched, which made the assertions below pass over nothing.
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(useProfile.getState().activeProgramId).toBe('iron_grip'));
    expect(useProfile.getState().injuries).toHaveLength(1);

    await putSession(newSession(today(), 1, { completed: true, rpe: 9 }) as never);
    await hydrate();

    fireEvent.click(await screen.findByText('Clear the sample data'));
    await waitFor(() => expect(screen.getByText(/Sample data cleared/)).toBeTruthy());
    expect(await getSession(`${today()}#1`)).toBeTruthy();
    expect(useProfile.getState().injuries).toHaveLength(0);
    expect(useProfile.getState().activeProgramId).toBeNull();
  });

  it('says how much it took out rather than claiming success over nothing', async () => {
    await emptied();
    await loadDemo();
    await hydrate();
    await settings();
    fireEvent.click(await screen.findByText('Clear the sample data'));
    await waitFor(() => expect(screen.getByText(/records\. Anything you logged yourself/)).toBeTruthy());
  });
});

describe('the banner', () => {
  it('says none of it happened', async () => {
    await emptied();
    await loadDemo();
    await hydrate();
    renderAt('/', <DemoBanner />);
    expect(await screen.findByText(/None of this happened/)).toBeTruthy();
  });

  it('is absent with nothing loaded', async () => {
    await emptied();
    renderAt('/', <DemoBanner />);
    await waitFor(() => expect(screen.queryByText(/None of this happened/)).toBeNull());
  });

  // It has to be on every page, not only the one that loaded it: the risk
  // is sample data mistaken for a real log a week later.
  it('is mounted by the shell rather than by a page', () => {
    const shell = readFileSync('src/ui/AppShell.tsx', 'utf8');
    expect(shell).toContain('<DemoBanner />');
  });

  /**
   * And being in the eager shell is exactly why it must not reach the
   * generator. Importing `hasDemo` from `db/demo.ts` pulled the RNG, the
   * year of sessions and the programs it reads into the entry chunk, and
   * cost **4.3KB of first load** to every climber who never touches sample
   * data.
   */
  it('does not drag the generator into the entry chunk', () => {
    for (const file of ['src/ui/DemoBanner.tsx', 'src/ui/AppShell.tsx']) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from '@\/db\/demo'/);
      expect(source, file).not.toMatch(/demoClimber/);
    }
    // And the module it does read knows nothing but how to count.
    const flag = readFileSync('src/db/demoFlag.ts', 'utf8');
    expect(flag).not.toMatch(/demoClimber|createRng|newSession/);
  });
});
