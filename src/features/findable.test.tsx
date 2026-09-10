// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { newSession, putSession } from '@/db/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { CareerPage } from '@/features/career/CareerPage';
import { ClimberPage } from '@/features/climber/ClimberPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { ACHIEVEMENT_COUNT } from '@/engine/achievements';

/**
 * Where a climber looks for what they have done (PLAN.md M63).
 *
 * The achievements were on the career page, which hangs off Progress under
 * seven charts. The page about who you are held your level, your stats and
 * your vitality — and nothing you had done.
 */

async function seedSessions(): Promise<void> {
  await reset();
  for (const date of ['2026-01-05', '2026-01-07', '2026-01-09', '2026-01-12']) {
    await putSession(newSession(date, 0, { completed: true }));
  }
  await hydrate();
}

describe('achievements', () => {
  it('are on the climber', async () => {
    await seedSessions();
    renderAt('/climber', <ClimberPage />);
    expect(screen.getByText('Achievements')).toBeTruthy();
    expect(screen.getByText(new RegExp(`of ${ACHIEVEMENT_COUNT}`))).toBeTruthy();
  });

  it('are not left behind on the career page', async () => {
    await seedSessions();
    renderAt('/career', <CareerPage />);
    // The heading stays, as a signpost — the list of fourteen does not.
    expect(screen.queryByText(new RegExp(`\\d+ of ${ACHIEVEMENT_COUNT}`))).toBeNull();
  });

  // A returning climber looking where they left them should be told, not
  // left to hunt.
  it('leaves a way back from where they used to be', async () => {
    await seedSessions();
    renderAt('/career', <CareerPage />);
    const card = screen.getByText('On your climber').closest('a')!;
    expect(card.getAttribute('href')).toBe('#/climber');
  });
});

describe('the career', () => {
  it('is one tap from the climber', async () => {
    await seedSessions();
    renderAt('/climber', <ClimberPage />);
    const link = screen.getByText('Career').closest('div')!.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('#/career');
  });

  // It was the second-to-last card on a page with seven charts above it.
  it('comes before the charts on Progress, not after them', async () => {
    await seedSessions();
    const { container } = renderAt('/progress', <ProgressPage />);
    const text = container.textContent ?? '';
    const career = text.indexOf('Career');
    const firstChart = Math.min(
      ...['Consistency', 'Training load', 'Grade pyramid']
        .map((title) => text.indexOf(title))
        .filter((at) => at >= 0),
    );
    expect(career).toBeGreaterThan(-1);
    expect(firstChart).toBeGreaterThan(-1);
    expect(career, 'career should come first').toBeLessThan(firstChart);
  });
});

describe('what the climber page holds', () => {
  it('still shows who you are as well as what you did', async () => {
    await seedSessions();
    renderAt('/climber', <ClimberPage />);
    for (const card of ['Skills', 'Stats', 'Vitality', 'Ranks']) {
      expect(within(document.body).getByText(card), card).toBeTruthy();
    }
  });
});
