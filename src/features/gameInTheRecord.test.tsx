// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { EMPTY_ASCENT, putAscent } from '@/db/game';
import { newSession, putSession } from '@/db/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { useGame } from '@/store/game';
import { CareerPage } from '@/features/career/CareerPage';
import { AchievementList } from '@/features/climber/AchievementsCard';

/**
 * The game reaches the record it belongs in (PLAN.md M212).
 *
 * Both of these are page tests rather than engine tests on purpose: the
 * engines were right and the wiring was the part nothing held. A mutation
 * that dropped `ascent` from either call site left every engine test green.
 */
async function played(days: Parameters<typeof putAscent>[0]['days']): Promise<void> {
  await reset();
  await putSession({ ...newSession('2026-06-01', 0, { completed: true }), durationMin: 60 } as never);
  await putAscent({ ...EMPTY_ASCENT, days });
  await useGame.getState().load();
  await hydrate();
}

const WALL = { date: '2026-06-02', metres: 900, coins: 0, mode: 'ascent' as const };

describe('the career page', () => {
  it('carries the days on the game’s wall', async () => {
    await played([WALL]);
    renderAt('/career', <CareerPage />);
    expect(await screen.findByText('Past El Capitan, on the Ascent')).toBeTruthy();
    expect(screen.getAllByText(/The game's wall, not the altimeter\./).length).toBeGreaterThan(0);
  });

  it('says nothing of the game to a climber who has not played', async () => {
    await played([]);
    renderAt('/career', <CareerPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/on the Ascent$/)).toBeNull();
  });
});

describe('the achievements page', () => {
  it('earns No Takes from a pure run on the wall', async () => {
    await played([{ ...WALL, pureMetres: 900 }]);
    renderAt('/achievements', <AchievementList />);
    expect(await screen.findByText('No Takes')).toBeTruthy();
    // Earned rows carry their date; unearned ones do not.
    const row = screen.getByText('No Takes').closest('li') ?? screen.getByText('No Takes').parentElement;
    expect(row?.textContent).toMatch(/Jun|2026/);
  });

  it('leaves it unearned when the run took help', async () => {
    await played([WALL]);
    renderAt('/achievements', <AchievementList />);
    const row = (await screen.findByText('No Takes')).closest('li');
    expect(row?.textContent).not.toMatch(/Jun|2026/);
  });
});
