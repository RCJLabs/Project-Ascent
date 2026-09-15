// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { EMPTY_ASCENT, putAscent } from '@/db/game';
import type { Endings } from '@/engine/ascent/endings';
import { ENOUGH_ENDINGS } from '@/engine/ascent/endingsRead';
import { hydrate, renderAt, reset } from '@/test/render';
import { useGame } from '@/store/game';
import { AscentPage } from './AscentPage';

/**
 * The card that says how your runs end (PLAN.md M214).
 *
 * The page has always told the climber *"the small fast ones are the ones
 * that get you"*, and until this nothing had checked it against their own
 * runs. Debris is 15% of what spawns, so the reading is a share against the
 * wall rather than a body count.
 */
async function open(endings: Partial<Endings>): Promise<void> {
  await reset();
  await putAscent({ ...EMPTY_ASCENT, endings: { ...EMPTY_ASCENT.endings, ...endings } });
  await useGame.getState().load();
  await hydrate();
  renderAt('/ascent', <AscentPage />);
}

describe('how your runs end', () => {
  it('stays away until there are enough runs behind it', async () => {
    await open({ rock: ENOUGH_ENDINGS - 1, metres: 900, counted: ENOUGH_ENDINGS - 1 });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('How your runs end')).toBeNull();
  });

  it('names the thing that beats its share of the wall', async () => {
    // Rocks kill more — and are 60% of the wall. Debris at 15% killing 30%
    // is the answer, and it is the one a body count would have missed.
    await open({ rock: 14, debris: 6, metres: 10_000, counted: 20 });
    expect(await screen.findByText('How your runs end')).toBeTruthy();
    expect(
      screen.getByText(/Falling debris are 15% of what spawns and end 30% of your runs\./),
    ).toBeTruthy();
    expect(screen.getByText(/The small fast ones really are the ones that get you\./)).toBeTruthy();
  });

  it('shows the count behind each one, and the average run', async () => {
    await open({ rock: 14, debris: 6, metres: 10_000, counted: 20 });
    await screen.findByText('How your runs end');
    expect(screen.getByText('14 · 70%')).toBeTruthy();
    expect(screen.getByText('6 · 30%')).toBeTruthy();
    // 10,000 m over 20 runs is 500 m, which is 1,640 ft — the app's default.
    expect(
      screen.getByText(/20 runs, averaging 1,640 ft\. Percentages are of your runs, not of the wall\./),
    ).toBeTruthy();
  });
});
