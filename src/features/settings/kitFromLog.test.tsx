// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { loadPrograms } from '@/content/programs';
import { loadDrills } from '@/content/drills/index';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { SettingsPage } from './SettingsPage';

/**
 * The kit list, against the log (PLAN.md M236).
 *
 * The engine is `kit.test.ts`. What is left for here is the half it cannot
 * see: that Settings asks the question at all, that the button is the only
 * thing that writes, and that what it writes is what the evidence named.
 *
 * The default kit is `['wall', 'gym']` and five of the thirteen programs need
 * a hangboard, so this is not a corner case — it is what a fresh install does
 * the first time a climber records a max hang.
 */

async function settings(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await loadDrills();
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('kit the log has used', () => {
  it('says nothing to a climber whose log has never needed a board', async () => {
    await settings();
    await hydrate();
    renderAt('/settings', <SettingsPage />);
    expect(await screen.findByText('What you can train on')).toBeTruthy();
    expect(screen.queryByText(/Your log has you using/)).toBeNull();
  });

  it('asks about a board the log has used and the kit list does not claim', async () => {
    await settings();
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-02-11', value: 30 });
    await hydrate();
    useProfile.setState({ equipment: ['wall', 'gym'] });
    renderAt('/settings', <SettingsPage />);

    expect(await screen.findByText('Your log has you using a hangboard.')).toBeTruthy();
    // The evidence, which is the part a climber checks against their memory.
    expect(screen.getByText(/You recorded a Max Hang 20mm 7s on/)).toBeTruthy();
  });

  /**
   * It offers and never decides — so nothing is written until the tap, and
   * what is written is exactly what was named.
   */
  it('changes nothing until the button is pressed', async () => {
    await settings();
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-02-11', value: 30 });
    await hydrate();
    useProfile.setState({ equipment: ['wall', 'gym'] });
    renderAt('/settings', <SettingsPage />);

    await screen.findByText('Your log has you using a hangboard.');
    expect(useProfile.getState().equipment).toEqual(['wall', 'gym']);

    fireEvent.click(screen.getByRole('button', { name: /Add it/ }));
    await waitFor(() => {
      expect(useProfile.getState().equipment).toEqual(['wall', 'gym', 'hangboard']);
    });
  });

  /** And once it is added, the offer has nothing left to say. */
  it('goes away once the kit list agrees with the log', async () => {
    await settings();
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-02-11', value: 30 });
    await hydrate();
    useProfile.setState({ equipment: ['wall', 'gym'] });
    renderAt('/settings', <SettingsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Add it/ }));
    await waitFor(() => {
      expect(screen.queryByText(/Your log has you using/)).toBeNull();
    });
  });

  /**
   * The chip the offer names is the chip it turns on. The labels used to be
   * authored twice — inline here and as a raw enum in `finder.ts` — so this
   * reads the chip rather than trusting the sentence.
   */
  it('turns on the chip it named', async () => {
    await settings();
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-02-11', value: 30 });
    await hydrate();
    useProfile.setState({ equipment: ['wall', 'gym'] });
    renderAt('/settings', <SettingsPage />);

    const chip = (await screen.findAllByText('Hangboard'))[0]!.closest('button')!;
    expect(chip.getAttribute('aria-pressed') ?? chip.className).not.toMatch(/true|bg-accent/);
    fireEvent.click(screen.getByRole('button', { name: /Add it/ }));
    await waitFor(() => expect(useProfile.getState().equipment).toContain('hangboard'));
  });

  /**
   * The program being run is the strongest evidence there is, and the one
   * that makes the finder's sentence absurd: it says *"Needs a hangboard you
   * do not have access to"* about the block the app is scheduling for you.
   */
  it('reads the program the app is already running', async () => {
    await settings();
    await hydrate();
    useProfile.setState({ equipment: ['wall', 'gym'], activeProgramId: 'iron_grip' });
    renderAt('/settings', <SettingsPage />);

    expect(await screen.findByText('Your log has you using a hangboard.')).toBeTruthy();
    expect(screen.getByText(/Iron Grip asks for one\./)).toBeTruthy();
  });
});
