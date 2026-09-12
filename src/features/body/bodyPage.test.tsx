// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { newSession, putSession } from '@/db/sessions';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { parentOf } from '@/ui/routes';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { BodyPage } from './BodyPage';
import { useSettings } from '@/store/settings';

/**
 * The training half of the old climber page (PLAN.md M118).
 *
 * Vitality, what hurts and the five stats are what the coach reads, so they
 * live under Progress — reachable from it, and back to it.
 */
describe('your body', () => {
  it('hangs off Progress', async () => {
    await reset();
    await hydrate();
    renderAt('/body', <BodyPage />);
    await screen.findByRole('heading', { level: 1, name: 'Your body' });
    expect(screen.getByRole('link', { name: /Progress/ }).getAttribute('href')).toBe('#/progress');
    expect(parentOf('/body')?.href).toBe('/progress');
  });

  it('is a card on Progress that says how you are, with and without a log', async () => {
    await reset();
    await hydrate();
    useProfile.setState({ injuries: [] });
    useSettings.setState({ progressView: 'body' });
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    let card = screen.getByText('Your body').closest('section')!;
    expect(card.querySelector('a')?.getAttribute('href')).toBe('#/body');
    expect(card.textContent).toContain('Nothing hurts');

    await putSession(newSession('2026-01-05', 0, { completed: true }));
    await hydrate();
    useSettings.setState({ progressView: 'body' });
    useProfile.setState({
      injuries: [{ id: 'i1', part: 'elbow', severity: 'niggle', status: 'active', since: '2026-01-01' }],
    });
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    card = screen.getByText('Your body').closest('section')!;
    expect(card.textContent).toContain('1 injury on the books');
  });
});
