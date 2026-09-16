// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { putMetricEntry } from '@/db/metrics';
import { getMetric } from '@/content/metrics';
import { isAddedWeight } from '@/engine/units';
import { hydrate, renderAt, reset } from '@/test/render';
import { useSettings } from '@/store/settings';
import { today } from '@/engine/dates';
import { AssessmentsPage } from './AssessmentsPage';

/**
 * What the two added-weight benchmarks say about themselves (PLAN.md M234).
 *
 * The milestone this came from wanted the app to store a bodyweight so that
 * strength-to-weight could be computed. It does not, and the reason is in
 * PLAN.md. What it does instead is stop the number being read as something it
 * is not — which is the half of the problem that was a *defect* rather than a
 * missing feature.
 */

async function open(label: string): Promise<void> {
  await reset();
  await hydrate();
  renderAt('/assessments', <AssessmentsPage />);
  fireEvent.click(await screen.findByText(/Add a benchmark/));
  fireEvent.click(await screen.findByText(label));
}

describe('a benchmark measured in added weight', () => {
  it('says that the number is what you added, not what you held', async () => {
    await open('Max Hang 20mm 7s');
    expect(screen.getByText(/This is what you/)).toBeTruthy();
    expect(screen.getByText(/not what you held/)).toBeTruthy();
    // The part that matters: why two readings are not always comparable.
    expect(screen.getByText(/similar bodyweight/)).toBeTruthy();
  });

  /**
   * And says nothing of the sort where it would be wrong. A dead hang is
   * seconds and a min edge is millimetres; neither has a climber inside it.
   */
  it('says nothing of the sort about a metric that is not', async () => {
    await open('Dead Hang');
    expect(screen.getByText(/Measured in sec\./)).toBeTruthy();
    expect(screen.queryByText(/not what you held/)).toBeNull();
    expect(getMetric('dead_hang')!.unit).toBe('sec');
    expect(isAddedWeight('sec')).toBe(false);
  });

  /**
   * The card shows the change as a delta and never as a percentage — and it
   * never did, which is worth knowing rather than assuming.
   *
   * The percentage that was wrong lives on the coach's gain tip
   * (`benchmarkGain.test.ts`) and in the block report's bars, not here. This
   * reads the card so that a future edit adding one to it fails.
   */
  it('shows the gain as a delta, with no percentage on the card', async () => {
    await reset();
    for (const [days, value] of [[-60, 30], [-4, 33]] as const) {
      await putMetricEntry({
        metricId: 'max_hang_20mm_7s',
        date: new Date(Date.now() + days * 864e5).toISOString().slice(0, 10),
        value,
      });
    }
    await hydrate();
    renderAt('/assessments', <AssessmentsPage />);

    const shown = await screen.findByText(/\+3 BW\+lbs/);
    expect(shown).toBeTruthy();
    expect(shown.textContent, 'a percentage of the plate').not.toMatch(/%/);
  });

  /**
   * The list reads in the climber's own units, which it did not (PLAN.md
   * M234).
   *
   * `formatEntry` takes `units` fourth and defaults it to imperial, so the
   * one call on this page that left it out did not fail — it read every
   * weight in pounds while the detail page for the same metric read kilos.
   * A default that hides a missing argument is the shape of the bug, and it
   * was found in a browser rather than here.
   */
  it('reads the benchmark list in the units the climber chose', async () => {
    await reset();
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: today(), value: 40 });
    await hydrate();
    useSettings.setState({ units: 'metric' });
    renderAt('/assessments', <AssessmentsPage />);

    // 40 lbs is 18.1 kg, and the label has to move with the number.
    expect(await screen.findByText('18.1 BW+kg')).toBeTruthy();
    expect(screen.queryByText('40 BW+lbs'), 'pounds, to a climber reading kilos').toBeNull();
  });

  /** The app never asks what a climber weighs, which is the whole decision. */
  it('asks for no bodyweight anywhere on the page', async () => {
    await open('Max Hang 20mm 7s');
    const page = document.body.textContent ?? '';
    expect(page, 'a bodyweight field').not.toMatch(/your (body ?)?weight|weigh-in|current weight/i);
    for (const field of screen.queryAllByRole('textbox')) {
      expect(field.getAttribute('aria-label') ?? '').not.toMatch(/weight/i);
    }
  });
});
