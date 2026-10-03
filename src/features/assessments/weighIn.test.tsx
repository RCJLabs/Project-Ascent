// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDb } from '@/db/db';
import { getProgram, loadPrograms } from '@/content/programs';
import { planFromLayout } from '@/engine/weekLayouts';
import { useProfile } from '@/store/profile';
import { FinishPage } from '@/features/finish/FinishPage';
import { listMetricEntries, putMetricEntry } from '@/db/metrics';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { useMetrics } from '@/store/metrics';
import { useSettings } from '@/store/settings';
import { writesSettled } from '@/store/writes';
import { hydrate, renderAt, reset } from '@/test/render';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { AssessmentsPage } from './AssessmentsPage';
import { MetricDetailPage } from './MetricDetailPage';
import { blockReport } from '@/engine/blockReport';
import type { MetricEntry } from '@/db/metrics';
import { BlockReportChart } from '@/ui/charts/BlockReportChart';

/**
 * Bodyweight at test weeks, from the climber's side (PLAN.md M371).
 *
 * Off unless switched on in Settings; when on, the two added-load tests ask
 * for it and nothing else does; it is stored in pounds whatever the climber
 * reads in, kept with the one result, and can be taken off every result at
 * once without losing the results.
 */

async function climberRecord(): Promise<Record<string, unknown>> {
  const db = await getDb();
  return ((await db.get('profile', 'settings'))?.value ?? {}) as Record<string, unknown>;
}

async function openForm(label: string, settings: { weighIn: boolean; units?: 'imperial' | 'metric' }): Promise<void> {
  await reset();
  await hydrate();
  useSettings.setState({ weighIn: settings.weighIn, units: settings.units ?? 'imperial' });
  renderAt('/assessments', <AssessmentsPage />);
  fireEvent.click(await screen.findByText(/Add a benchmark/));
  fireEvent.click(await screen.findByText(label));
}

const field = () => screen.queryByLabelText('Bodyweight');

describe('the switch in Settings', () => {
  it('is off for a climber who never touched it', async () => {
    await reset();
    await hydrate();
    expect(useSettings.getState().weighIn).toBe(false);
    expect((await climberRecord())['weighIn']).toBeUndefined();
  });

  it('turns on, travels in the backup, and comes back on the next boot', async () => {
    await reset();
    await hydrate();
    renderAt('/settings', <SettingsPage />);
    await screen.findByText('Bodyweight at test weeks');
    expect(screen.queryByText(/stored with/), 'a count of none').toBeNull();
    const switches = screen.getByText('Bodyweight at test weeks').parentElement!;
    fireEvent.click([...switches.querySelectorAll('button')].find((b) => b.textContent === 'On')!);
    expect(useSettings.getState().weighIn).toBe(true);
    await writesSettled();
    expect((await climberRecord())['weighIn']).toBe(true);

    useSettings.setState({ weighIn: false });
    await hydrate();
    expect(useSettings.getState().weighIn).toBe(true);
  });
});

describe('the entry form', () => {
  it('asks for no bodyweight while the switch is off', async () => {
    await openForm('Max Hang 20mm 7s', { weighIn: false });
    expect(field()).toBeNull();
    expect(screen.getByText(/similar bodyweight/)).toBeTruthy();
  });

  it('asks only on an added-load test when it is on', async () => {
    await openForm('Dead Hang', { weighIn: true });
    expect(field()).toBeNull();
  });

  it('stores the weight in pounds with the result, from kilos', async () => {
    await openForm('Max Hang 20mm 7s', { weighIn: true, units: 'metric' });
    expect(screen.getByPlaceholderText(/Bodyweight today, kg/)).toBeTruthy();
    expect(screen.getByText(/never charted/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Max Hang 20mm 7s result'), { target: { value: '10' } });
    fireEvent.change(field()!, { target: { value: '70' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(useMetrics.getState().entries).toHaveLength(1));
    const [saved] = await listMetricEntries();
    // 70 kg is 154.3 lbs, and 10 kg added is 22 lbs.
    expect(saved).toMatchObject({ metricId: 'max_hang_20mm_7s', date: today(), value: 22, bodyweight: 154.3 });
  });

  it('saves a result with the box left empty, and no weight with it', async () => {
    await openForm('Max Hang 20mm 7s', { weighIn: true });
    fireEvent.change(screen.getByLabelText('Max Hang 20mm 7s result'), { target: { value: '30' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(useMetrics.getState().entries).toHaveLength(1));
    const [saved] = await listMetricEntries();
    expect(saved!.value).toBe(30);
    expect('bodyweight' in saved!).toBe(false);
  });

  it('refuses a weight that is not one, and saves nothing', async () => {
    await openForm('Max Hang 20mm 7s', { weighIn: true });
    fireEvent.change(screen.getByLabelText('Max Hang 20mm 7s result'), { target: { value: '30' } });
    for (const typed of ['0', '-150', 'heavy']) {
      fireEvent.change(field()!, { target: { value: typed } });
      fireEvent.click(screen.getByText('Save'));
      expect(await screen.findByText(/Bodyweight needs to be a number of lbs above zero/)).toBeTruthy();
    }
    await writesSettled();
    expect(await listMetricEntries()).toEqual([]);
  });
});

describe('a weight once stored', () => {
  async function seed(): Promise<void> {
    await reset();
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-03-02', value: 30, bodyweight: 150 });
    await putMetricEntry({ metricId: 'weighted_pullup_3rm', date: '2026-03-02', value: 45, bodyweight: 150 });
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-03-30', value: 35 });
    await hydrate();
  }

  it('is never drawn or listed on the benchmark’s own page', async () => {
    await seed();
    useSettings.setState({ weighIn: true });
    renderAt('/assessments/max_hang_20mm_7s', <MetricDetailPage params={{ id: 'max_hang_20mm_7s' }} />);
    await screen.findAllByText(/35 BW\+lbs/);
    expect(document.body.textContent).not.toMatch(/150/);
  });

  it('comes off every result at once, and the results stay', async () => {
    await seed();
    renderAt('/settings', <SettingsPage />);
    expect(await screen.findByText(/2 results have a bodyweight stored with them/)).toBeTruthy();
    expect(screen.getByText(/Switched off, the review no longer reads them/)).toBeTruthy();
    fireEvent.click(screen.getByText('Remove all 2 stored bodyweights'));

    await waitFor(() => expect(screen.queryByText(/stored with them/)).toBeNull());
    const stored = await listMetricEntries();
    expect(stored.map((e) => [e.metricId, e.value]).sort()).toEqual([
      ['max_hang_20mm_7s', 30],
      ['max_hang_20mm_7s', 35],
      ['weighted_pullup_3rm', 45],
    ]);
    expect(stored.some((e) => 'bodyweight' in e)).toBe(false);
    expect(useMetrics.getState().entries.some((e) => 'bodyweight' in e)).toBe(false);
  });

  it('says one in the singular', async () => {
    await reset();
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: '2026-03-02', value: 30, bodyweight: 150 });
    await hydrate();
    useSettings.setState({ weighIn: true });
    renderAt('/settings', <SettingsPage />);
    expect(await screen.findByText(/One result has a bodyweight stored with it\./)).toBeTruthy();
    expect(screen.queryByText(/Switched off/)).toBeNull();
    expect(screen.getByText('Remove the stored bodyweight')).toBeTruthy();
  });
});

/**
 * The two pages that build a review, each passing the switch through. A
 * weighed hang that held its plate while the climber lost thirty pounds is
 * better by weight and held by plate, so the page shows which one it read.
 */
describe('the pages that review a block', () => {
  const START = startOfWeek(addDays(today(), -35));

  async function weighedHang(weighIn: boolean, recorded = false): Promise<void> {
    await reset();
    await loadPrograms();
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: addDays(START, 1), value: 30, bodyweight: 150 });
    await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: addDays(START, 29), value: 30, bodyweight: 120 });
    await hydrate();
    useSettings.setState({ weighIn });
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: START },
      plans: { iron_grip: planFromLayout(getProgram('iron_grip')!.recommendedLayout!) },
    });
    // The block in the history, which is the review's other way in.
    if (recorded) {
      const plan = planFromLayout(getProgram('iron_grip')!.recommendedLayout!);
      useProfile.setState({
        blocks: [{ id: `iron_grip#${START}`, programId: 'iron_grip', name: 'Iron Grip', startDate: START, weeks: 12, plan, endedAt: null }],
      });
    }
  }

  const ratio = () => [...document.querySelectorAll('title')].find((t) => /BW\+20% → BW\+25%/.test(t.textContent ?? ''));

  for (const [name, path, page, recorded] of [
    ['the assessments page', '/assessments', <AssessmentsPage key="a" />, false],
    ['the finish page', '/finish', <FinishPage key="f" />, false],
    ['the finish page, from the history', '/finish', <FinishPage key="h" />, true],
  ] as const) {
    it(`${name} reads the weights with the switch on`, async () => {
      await weighedHang(true, recorded);
      renderAt(path, page);
      await waitFor(() => expect(ratio()).toBeTruthy());
      expect(ratio()!.textContent).toMatch(/^Max Hang 20mm 7s: /);
    });

    it(`${name} reads the plate with it off`, async () => {
      await weighedHang(false, recorded);
      renderAt(path, page);
      await screen.findAllByText(/Max Hang 20mm 7s/);
      expect(ratio()).toBeUndefined();
      expect(document.body.textContent).not.toMatch(/BW\+\d+%/);
    });
  }
});

describe('the ratio in the chart', () => {
  it('signs weight taken off with a minus, not +-', async () => {
    await loadPrograms();
    const entry = (date: string, value: number, bodyweight: number) =>
      ({ metricId: 'max_hang_20mm_7s', date, value, bodyweight }) as MetricEntry;
    const report = blockReport({
      program: getProgram('iron_grip')!, startDate: '2026-03-01', today: '2026-06-30', bodyweight: true,
      entries: [entry('2026-03-02', -20, 150), entry('2026-03-30', 6, 150)],
    })!;
    const { container } = render(<BlockReportChart report={report} />);
    const title = [...container.querySelectorAll('title')].map((t) => t.textContent).find((t) => t?.startsWith('Max Hang'));
    expect(title).toMatch(/ · BW−13% → BW\+4%/);
    expect(title).not.toMatch(/\+-/);
  });
});
