// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BODY_PARTS, REGIONS, REGION_LABEL } from '@/content/bodyParts';
import { ROUTES, parentOf } from '@/ui/routes';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { BodyPage } from '@/features/body/BodyPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

/**
 * Injuries live with the climber, not with the app's settings (PLAN.md M76)
 * — and since M118 with the *body*, the training half of that page.
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
  it('is the body page', async () => {
    await fresh();
    renderAt('/body', <BodyPage />);
    expect(await screen.findByText('Injuries')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Log an injury/ })).toBeTruthy();
  });

  it('records one from there, with the four facts it asked for', async () => {
    // M223 replaced a row of "+ Part" chips that created on tap. The part
    // list is grouped now and nothing is written until Add, so the flow is
    // open, pick, answer, add.
    await fresh();
    renderAt('/body', <BodyPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Log an injury/ }));

    fireEvent.click(await screen.findByRole('button', { name: 'Hand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Right' }));
    fireEvent.change(screen.getByLabelText('Since when'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(useProfile.getState().injuries).toHaveLength(1));
    const [injury] = useProfile.getState().injuries;
    // The part the milestone started from, and a date that is not today.
    expect(injury).toMatchObject({ part: 'hand', side: 'right', since: '2026-09-01' });
    expect(screen.getByRole('link', { name: 'Open' })).toBeTruthy();
  });

  it('writes nothing if the form is backed out of', async () => {
    // The other half of why creating on tap was wrong: cancelling has to
    // cost nothing, and it cannot if the record already exists.
    await fresh();
    renderAt('/body', <BodyPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Log an injury/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Hand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useProfile.getState().injuries).toEqual([]);
  });

  it('offers every part, grouped, including the ones the old list left out', async () => {
    await fresh();
    renderAt('/body', <BodyPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Log an injury/ }));
    for (const region of REGIONS) {
      expect(await screen.findByText(REGION_LABEL[region]), region).toBeTruthy();
    }
    for (const part of BODY_PARTS) {
      expect(screen.getByRole('button', { name: part.label }), part.id).toBeTruthy();
    }
  });

  it('asks for a side only where a side means something', async () => {
    await fresh();
    renderAt('/body', <BodyPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Log an injury/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('button', { name: 'Left' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Elbow' }));
    expect(screen.getByRole('button', { name: 'Left' })).toBeTruthy();
  });

  it('lets the same part be hurt on both sides at once', async () => {
    // The old picker filtered out any part already recorded, so a left and
    // a right elbow could not both exist.
    await fresh();
    renderAt('/body', <BodyPage />);
    for (const side of ['Left', 'Right']) {
      fireEvent.click(await screen.findByRole('button', { name: /Log an injury/ }));
      // Scoped to the form: the row for the injury added on the first pass
      // carries its own Left/Right/Both chips, so an unscoped query finds
      // two of each on the second.
      const form = await screen.findByRole('group', { name: 'Log an injury' });
      fireEvent.click(within(form).getByRole('button', { name: 'Elbow' }));
      fireEvent.click(within(form).getByRole('button', { name: side }));
      fireEvent.click(within(form).getByRole('button', { name: 'Add' }));
      await waitFor(() =>
        expect(useProfile.getState().injuries.some((i) => i.side === side.toLowerCase())).toBe(true),
      );
    }
    expect(useProfile.getState().injuries.map((i) => i.part)).toEqual(['elbow', 'elbow']);
    expect(useProfile.getState().injuries.map((i) => i.side)).toEqual(['left', 'right']);
  });

  it('sits next to what it costs', async () => {
    await fresh();
    renderAt('/body', <BodyPage />);
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
    expect(screen.queryByRole('button', { name: /Log an injury/ })).toBeNull();
  });
});

describe('the ways back', () => {
  it('sends the injury detail page back to the body', () => {
    expect(parentOf('/injury/inj-1')?.href).toBe('/body');
  });

  it('lets search find it under the body, and not under settings', () => {
    const climber = ROUTES.find((r) => r.path === '/body')!;
    const settings = ROUTES.find((r) => r.path === '/settings')!;
    expect(climber.keywords).toContain('injuries');
    expect(settings.keywords ?? []).not.toContain('injuries');
  });
});
