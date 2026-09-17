// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { HomeStatsCard } from './HomeStatsCard';

/**
 * How high, and how hard (PLAN.md M239).
 *
 * The card that turned Home from a column of sentences into a screen with
 * numbers on it. What is worth testing is the cases where it should say
 * *less*: a climber with no log, a climber whose log has gone quiet, and a
 * number that is a judgement beside two that are not.
 */

const TODAY = today();

async function log(days: number[], units: 'imperial' | 'metric' = 'imperial'): Promise<void> {
  await reset();
  for (const d of days) {
    const date = addDays(TODAY, -d);
    await putSession({
      ...newSession(date, 0, { completed: true }),
      rpe: 7,
      durationMin: 60,
      climbs: [{ id: `c${d}`, grade: 'V4', scale: 'V', count: 4, result: 'send' }],
    } as never);
  }
  await hydrate();
  useSettings.setState({ units });
  renderAt('/', <HomeStatsCard />);
}

const meter = () => document.querySelector('[role="progressbar"]');

describe('the numbers card', () => {
  it('says nothing at all to a climber with no log', async () => {
    await log([]);
    expect(screen.queryByText('Climbed so far')).toBeNull();
  });

  /**
   * And still speaks to one whose log has gone quiet. Height is a lifetime
   * figure and the tiles are eight weeks, so a climber who trained hard in
   * spring and stopped has a real number and three empty weeks — the case a
   * single `empty` guard would have silenced.
   */
  it('still shows the height when the last eight weeks are empty', async () => {
    await log([120, 130, 140]);
    expect(await screen.findByText('Climbed so far')).toBeTruthy();
    expect(screen.getByText('Week load')).toBeTruthy();
  });

  it('draws how far along the segment is, not a full bar', async () => {
    await log([2, 4, 6, 8]);
    await screen.findByText('Climbed so far');
    const bar = meter()!;
    expect(bar).toBeTruthy();
    const now = Number(bar.getAttribute('aria-valuenow'));
    expect(now).toBeGreaterThan(0);
    expect(now, 'the meter is pinned full').toBeLessThan(100);
  });

  it('names the summit it is measuring against', async () => {
    await log([2, 4, 6, 8]);
    await screen.findByText('Climbed so far');
    expect(meter()!.getAttribute('aria-label')).toMatch(/^Progress to \w/);
    expect(meter()!.getAttribute('aria-valuetext')).toMatch(/\d+ ft to go/);
  });

  /**
   * Only the ratio means anything on its own, so only the ratio is
   * coloured. A card that tints all three teaches a climber that a load of
   * 1,240 is *good*, which is not a thing the number says.
   */
  it('colours the ratio and leaves the counts alone', async () => {
    await log([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]);
    await screen.findByText('A : C');
    const coloured = [...document.querySelectorAll('.text-positive')];
    const labels = coloured
      .map((el) => el.closest('div')?.parentElement?.textContent ?? '')
      .join(' ');
    expect(labels).toContain('A : C');
    expect(labels).not.toContain('Week load');
    expect(labels).not.toContain('Sends');
  });

  /** Metres for a metric climber, through `formatHeight` like every other height. */
  it('reads the height in the climber’s own units', async () => {
    await log([2, 4, 6, 8], 'metric');
    await screen.findByText('Climbed so far');
    expect(screen.getByText('m')).toBeTruthy();
    expect(screen.queryByText('ft')).toBeNull();
  });
});
