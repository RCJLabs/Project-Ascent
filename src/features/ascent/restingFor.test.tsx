// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { newProject, putProject } from '@/db/projects';
import { newSession, putSession } from '@/db/sessions';
import { today as todayKey, addDays } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { AscentPage } from './AscentPage';

/**
 * The game names the climb you are working (PLAN.md M217).
 *
 * The Ascent had zero mentions of a grade, a project or a venue. It is the
 * rest-day screen — the card that links to it calls it that and the payout
 * pays ×1.5 on a logged rest day — so it is the one screen where naming
 * what the rest is *for* is not a nag.
 */
async function withProject(
  patch: Record<string, unknown> = {},
  burnDays: string[] = [],
  restToday = false,
): Promise<void> {
  await reset();
  await putProject({
    ...newProject({ name: 'Blue Moon', grade: 'V7', scale: 'V' }),
    id: 'blue',
    location: 'The Works',
    ...patch,
  });
  for (const [i, date] of burnDays.entries()) {
    await putSession({
      ...newSession(date, i, { completed: true }),
      projectAttempts: [{ id: `a${i}`, projectId: 'blue', outcome: 'fell-high', highPoint: 80, count: 1 }],
    } as never);
  }
  if (restToday) {
    // A rest session is the checklist with no climbs on it (`isRestSession`).
    await putSession({
      ...newSession(todayKey(), 99, { completed: true }),
      climbs: [],
      restChecklist: { slept: true, ate: true, mobility: false, stretched: false },
    } as never);
  }
  await hydrate();
  renderAt('/ascent', <AscentPage />);
}

describe('what you’re working, on the game’s own screen', () => {
  it('names the climb, its grade and where it is', async () => {
    await withProject({}, [addDays(todayKey(), -3)]);
    expect(await screen.findByText("What you're working")).toBeTruthy();
    expect(screen.getByText('Blue Moon')).toBeTruthy();
    expect(screen.getByText(/V7, at The Works/)).toBeTruthy();
    expect(screen.getByText(/1 day on it, last touched 3 days ago\. High point 80%\./)).toBeTruthy();
  });

  it('links to the project rather than making the game a place to work it', async () => {
    await withProject({}, [addDays(todayKey(), -3)]);
    await screen.findByText('Blue Moon');
    const link = screen.getByText('Blue Moon').closest('a');
    expect(link?.getAttribute('href')).toBe('#/projects/blue');
  });

  it('frames it as what the rest is for, on a logged rest day', async () => {
    // The whole reason this card lives on this screen rather than anywhere
    // else: the Ascent is the rest-day activity, and a screen built around
    // resting is the one place naming what you are resting *for* is not a
    // nag.
    await withProject({}, [addDays(todayKey(), -3)], true);
    expect(await screen.findByText(/Today's rest is for/)).toBeTruthy();
    expect(screen.queryByText(/You're on/)).toBeNull();
  });

  it('stays away entirely when nothing is on the go', async () => {
    await withProject({ status: 'sent' });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText("What you're working")).toBeNull();
  });

  it('says nothing about burns on a climb only just written down', async () => {
    await withProject();
    await screen.findByText('Blue Moon');
    expect(screen.queryByText(/days on it/)).toBeNull();
  });
});
