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
import { addDays, today as todayKey } from '@/engine/dates';
import { HISTORY_DAYS } from '@/engine/vitalityHistory';

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

/**
 * The month behind the number (PLAN.md M201).
 *
 * The card showed one day, so a run of grinding and a single hard Tuesday
 * were the same picture. These check the picture is different.
 */
describe('vitality over the month', () => {
  const strip = () =>
    screen.getByRole('img', { name: /Vitality over the last/i });

  async function withDays(count: number, patch: Partial<Parameters<typeof newSession>[2]> = {}) {
    await reset();
    useProfile.setState({ injuries: [] });
    const today = todayKey();
    for (let i = 0; i < count; i += 1) {
      await putSession(
        newSession(addDays(today, -i), 0, { completed: true, warmup: true, ...patch }) as never,
      );
    }
    await hydrate();
    renderAt('/body', <BodyPage />);
    await screen.findByRole('heading', { level: 1, name: 'Your body' });
  }

  it('draws a column a day', async () => {
    await withDays(1);
    expect(strip().children).toHaveLength(HISTORY_DAYS);
  });

  it('says nothing happened when nothing did', async () => {
    await withDays(1);
    expect(strip().getAttribute('aria-label')).toMatch(/nothing below Worked/i);
    expect(screen.getByText(/none of them below Worked/i)).toBeTruthy();
  });

  it('colours the bad days differently from the good ones', async () => {
    // A fortnight without a rest day, which is what the chart is for. The
    // colours come from the same map the headline icon uses, so a run that
    // reads as *Cooked* cannot draw the same as a fresh week.
    await withDays(14);
    const colours = new Set(
      [...strip().children].map((c) => (c as HTMLElement).style.backgroundColor),
    );
    expect(colours.size).toBeGreaterThan(1);
  });

  it('names the run in the sentence under it', async () => {
    await withDays(14);
    expect(strip().getAttribute('aria-label')).toMatch(/in a row|below Worked/i);
  });
});

