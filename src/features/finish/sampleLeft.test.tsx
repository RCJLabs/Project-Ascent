// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { canLoadDemo } from '@/db/demo';
import { blockDay } from '@/engine/blockEnd';
import { today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { FinishPage } from './FinishPage';

/**
 * The block the sample climber left, on the screens that show it (PLAN.md
 * M372): its row in **Blocks you have run**, and its review, measured to the
 * day it was left (M365).
 */

async function sample() {
  await waitFor(async () => {
    await reset();
    expect(await canLoadDemo()).toBe(true);
  });
  await hydrate();
  renderAt('/settings', <SettingsPage />);
  fireEvent.click(await screen.findByText('Load a sample climber'));
  await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy(), { timeout: 10000 });
  cleanup();
  await hydrate();
  return useProfile.getState().blocks.find((b) => b.reason === 'stopped')!;
}

describe('the block the sample climber left', () => {
  it('is in the history, as left, beside the run that went to the end', async () => {
    await sample();
    renderAt('/finish', <FinishPage />);
    const card = (await screen.findByRole('heading', { name: 'Blocks you have run' })).closest('section') ?? document.body;
    const rows = within(card as HTMLElement).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(rows.filter((r) => r.startsWith('My winter block'))).toHaveLength(2);
    expect(rows.some((r) => /5 of 8 weeks · left early$/.test(r))).toBe(true);
    expect(rows.some((r) => /8 of 8 weeks · ran to the end$/.test(r))).toBe(true);
  });

  it('opens on a review measured to the day it was left', async () => {
    const left = await sample();
    expect(left.endedAt! < today()).toBe(true);
    const id = encodeURIComponent(left.id);
    renderAt(`/finish/${id}`, <FinishPage params={{ id }} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'My winter block' })).toBeTruthy();
    expect(screen.getByText(`Ran to ${blockDay(left.endedAt!)}`)).toBeTruthy();
    expect(screen.getByText(/^You left My winter block after 5 of its 8 weeks\./)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Did you do the work?' })).toBeTruthy();
    expect(screen.getByText(/You did every session the plan placed — all 15 of them\./)).toBeTruthy();
  });
});
