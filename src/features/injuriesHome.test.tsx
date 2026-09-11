// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ROUTES, parentOf } from '@/ui/routes';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { ClimberPage } from '@/features/climber/ClimberPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

/**
 * Injuries live with the climber, not with the app's settings (PLAN.md M76).
 *
 * The move is a doorway, not a data change, so what is worth asserting is
 * that the doorway is on the right page and every way back leads there.
 */

async function fresh(): Promise<void> {
  await reset();
  await hydrate();
  useProfile.setState({ injuries: [] });
}

describe('where injuries are recorded', () => {
  it('is the climber page', async () => {
    await fresh();
    renderAt('/climber', <ClimberPage />);
    expect(await screen.findByText('Injuries')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Fingers' })).toBeTruthy();
  });

  it('records one from there', async () => {
    await fresh();
    renderAt('/climber', <ClimberPage />);
    fireEvent.click(await screen.findByRole('button', { name: '+ Fingers' }));
    await waitFor(() => expect(useProfile.getState().injuries.map((i) => i.part)).toEqual(['fingers']));
    // The part just added is no longer offered, and its row is.
    expect(screen.queryByRole('button', { name: '+ Fingers' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open' })).toBeTruthy();
  });

  it('sits next to what it costs', async () => {
    await fresh();
    renderAt('/climber', <ClimberPage />);
    const headings = (await screen.findAllByRole('heading')).map((h) => h.textContent);
    const vitality = headings.indexOf('Vitality');
    const injuries = headings.indexOf('Injuries');
    expect(vitality).toBeGreaterThanOrEqual(0);
    expect(injuries).toBe(vitality + 1);
  });

  it('is no longer settings', async () => {
    await fresh();
    renderAt('/settings', <SettingsPage />);
    await screen.findByText('What you can train on');
    expect(screen.queryByText('Injuries')).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Fingers' })).toBeNull();
  });
});

describe('the ways back', () => {
  it('sends the injury detail page back to the climber', () => {
    expect(parentOf('/injury/inj-1')?.href).toBe('/climber');
  });

  it('lets search find it under the climber, and not under settings', () => {
    const climber = ROUTES.find((r) => r.path === '/climber')!;
    const settings = ROUTES.find((r) => r.path === '/settings')!;
    expect(climber.keywords).toContain('injuries');
    expect(settings.keywords ?? []).not.toContain('injuries');
  });
});
