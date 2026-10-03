// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { putMetricEntry } from '@/db/metrics';
import { addDays, today } from '@/engine/dates';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { AssessmentsPage } from './AssessmentsPage';
import { MetricDetailPage } from './MetricDetailPage';

/**
 * The change beside a result, in the review's words (PLAN.md M373).
 *
 * A dead hang from 60 to 62 seconds was green here and *held* in the block
 * review. These read the two places the change is shown — the benchmark
 * list and the benchmark's own page — for the word and the colour.
 */

async function seed(readings: { metricId: string; daysAgo: number; value: number; bodyweight?: number }[], weighIn = false) {
  await reset();
  for (const r of readings) {
    await putMetricEntry({
      metricId: r.metricId,
      date: addDays(today(), -r.daysAgo),
      value: r.value,
      ...(r.bodyweight !== undefined ? { bodyweight: r.bodyweight } : {}),
    });
  }
  await hydrate();
  useSettings.setState({ weighIn, units: 'imperial' });
}

const colour = (text: string) => screen.getByText(text).className;

/**
 * The list says the amount and the verdict on a line each (PLAN.md M373),
 * under one colour: the two lines, and the colour they share.
 */
async function listed(amount: string): Promise<{ lines: string[]; colour: string }> {
  const block = (await screen.findByText(amount)).parentElement!;
  return { lines: [...block.children].map((c) => c.textContent ?? ''), colour: block.className };
}

describe('the benchmark list', () => {
  it('calls a change inside the band held, in neither colour', async () => {
    await seed([{ metricId: 'dead_hang', daysAgo: 30, value: 60 }, { metricId: 'dead_hang', daysAgo: 2, value: 62 }]);
    renderAt('/assessments', <AssessmentsPage />);
    const change = await listed('+2 sec');
    expect(change.lines).toEqual(['+2 sec', 'held']);
    expect(change.colour).toMatch(/text-ink-soft/);
    expect(change.colour).not.toMatch(/text-positive|text-danger/);
  });

  it('calls the band itself light, in its direction\'s colour', async () => {
    await seed([{ metricId: 'max_pullups', daysAgo: 30, value: 10 }, { metricId: 'max_pullups', daysAgo: 2, value: 9 }]);
    renderAt('/assessments', <AssessmentsPage />);
    const change = await listed('−1 rep');
    expect(change.lines).toEqual(['−1 rep', 'light decline']);
    expect(change.colour).toMatch(/text-danger/);
  });
});

describe("the benchmark's own page", () => {
  const lighter = [
    { metricId: 'max_hang_20mm_7s', daysAgo: 30, value: 30, bodyweight: 150 },
    { metricId: 'max_hang_20mm_7s', daysAgo: 2, value: 30, bodyweight: 120 },
  ];

  it('reads a weighed result for the climber\'s weight with the switch on', async () => {
    await seed(lighter, true);
    renderAt('/assessments/max_hang_20mm_7s', <MetricDetailPage params={{ id: 'max_hang_20mm_7s' }} />);
    await screen.findByText('same plate · better for your weight');
    expect(colour('same plate · better for your weight')).toMatch(/text-positive/);
  });

  it('reads the plate with it off', async () => {
    await seed(lighter, false);
    renderAt('/assessments/max_hang_20mm_7s', <MetricDetailPage params={{ id: 'max_hang_20mm_7s' }} />);
    await screen.findByText('no change');
    expect(screen.queryByText(/for your weight/)).toBeNull();
  });

  it('and the list reads it the same way', async () => {
    await seed(lighter, true);
    renderAt('/assessments', <AssessmentsPage />);
    expect((await listed('same plate')).lines).toEqual(['same plate', 'better for your weight']);
  });
});
