// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProgressPage } from './ProgressPage';

/**
 * Progress in three views (PLAN.md M119).
 *
 * The cards are the ones the page always had; what is checked is which
 * question each answers, that "All" is still the whole page, and that the
 * choice survives a reload the way the theme does.
 */

const TODAY = today();

async function seeded(): Promise<void> {
  await reset();
  for (let i = 0; i < 12; i += 1) {
    await putSession({
      ...newSession(addDays(TODAY, -i * 3), 0),
      completed: true,
      rpe: 6,
      durationMin: 75,
      warmup: true,
      restChecklist: undefined,
      checkIn: { fingers: 'good', sleep: 'good' },
      climbs: [{ id: `c${i}`, grade: i % 4 === 0 ? 'V5' : 'V3', scale: 'V', count: 2, result: 'send' }],
    });
  }
  await hydrate();
}

const titles = () => [...document.querySelectorAll('main h2, h2')].map((h) => h.textContent?.trim());
const pick = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

describe('the views', () => {
  it('opens on this block, with the strip and the picker above it', async () => {
    await seeded();
    useSettings.setState({ progressView: 'block' });
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    expect(screen.getByRole('group', { name: 'View' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'This block' }).getAttribute('aria-pressed')).toBe('true');
    const t = titles();
    expect(t).toContain('Consistency');
    expect(t).toContain('Training load');
    expect(t).toContain('Journal');
    expect(t).not.toContain('Grade pyramid');
    expect(t).not.toContain('Your body');
    expect(t).not.toContain('Career');
  });

  it('grades is the climbing, with the career and the year', async () => {
    await seeded();
    useSettings.setState({ progressView: 'block' });
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    pick('Grades');
    const t = titles();
    expect(t).toContain('Grade pyramid');
    expect(t).toContain('Grade progression');
    expect(t).toContain('Personal records');
    expect(t).toContain('Career');
    expect(t).toContain('Year in review');
    expect(screen.getByRole('button', { name: 'Boulder' })).toBeTruthy();
    expect(t).not.toContain('Training load');
    expect(t).not.toContain('Your body');
  });

  it('body is how you are', async () => {
    await seeded();
    useSettings.setState({ progressView: 'block' });
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    pick('Body');
    const t = titles();
    expect(t).toContain('Your body');
    expect(t).toContain('What you have been loading');
    expect(t).toContain('How you were feeling');
    expect(t).toContain('Assessments');
    expect(t).not.toContain('Grade pyramid');
    expect(t).not.toContain('Consistency');
  });

  it('all is the whole page, in the order it always was', async () => {
    await seeded();
    useSettings.setState({ progressView: 'body' });
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    pick('All');
    const t = titles();
    for (const card of ['Career', 'Year in review', 'Your body', 'Consistency', 'Training load', 'Grade pyramid', 'Assessments', 'Journal', 'Personal records']) {
      expect(t, card).toContain(card);
    }
    expect(t.indexOf('Career')).toBeLessThan(t.indexOf('Consistency'));
    expect(t.indexOf('Training load')).toBeLessThan(t.indexOf('Grade pyramid'));
  });

  it('keeps the stat strip on every view', async () => {
    await seeded();
    useSettings.setState({ progressView: 'block' });
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    for (const label of ['Grades', 'Body', 'All', 'This block']) {
      pick(label);
      expect(screen.getByText('Sessions')).toBeTruthy();
      expect(screen.getByText('Streak')).toBeTruthy();
    }
  });

  it('remembers the choice on the device, and reads it back', async () => {
    await seeded();
    useSettings.setState({ progressView: 'block' });
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    pick('Grades');
    expect(useSettings.getState().progressView).toBe('grades');
    const device = JSON.parse(localStorage.getItem('project-ascent:device') ?? '{}') as { progressView?: string };
    expect(device.progressView).toBe('grades');
    // A fresh hydrate — the app reopening — lands on the same view.
    useSettings.setState({ progressView: 'block' });
    await hydrate();
    expect(useSettings.getState().progressView).toBe('grades');
  });

  it('falls back to this block when the stored value is nonsense', async () => {
    await reset();
    localStorage.setItem('project-ascent:device', JSON.stringify({ progressView: 'sideways' }));
    await hydrate();
    expect(useSettings.getState().progressView).toBe('block');
  });

  it('shows no picker with nothing logged', async () => {
    await reset();
    await hydrate();
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { level: 1, name: 'Progress' });
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });
});
