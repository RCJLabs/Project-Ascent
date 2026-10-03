// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { Equipment } from '@/content/types';
import { listMetricEntries } from '@/db/metrics';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { WelcomePage } from './WelcomePage';

/**
 * The bodyweight question at the start (PLAN.md M378).
 *
 * One optional box on the baseline, beside the added-load tests it is for.
 * Filled, it is kept with those results and turns the Settings switch on;
 * empty, nothing changes and the climber is not asked again.
 */

async function toBaseline(equipment: Equipment[]): Promise<void> {
  await reset();
  await hydrate();
  useProfile.setState({ equipment });
  useSettings.setState({ weighIn: false });
  renderAt('/welcome', <WelcomePage />);
  fireEvent.click(screen.getByRole('button', { name: /Start/ }));
  for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: /Next/ }));
  await screen.findByText('Your baseline');
}

async function finish(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /Next/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Find my program/ }));
  await waitFor(() => expect(useProfile.getState().onboardedAt).not.toBeNull());
}

const box = () => screen.queryByLabelText('Bodyweight');

describe('the baseline, with an added-load test in it', () => {
  it('asks once, naming the tests the weight is for', async () => {
    await toBaseline(['hangboard', 'gym', 'wall']);
    expect(screen.getByText('Your bodyweight (optional)')).toBeTruthy();
    expect(screen.getByText(/^Max Hang 20mm 7s and Weighted Pull-Ups 3RM record what you add/)).toBeTruthy();
    expect(box()).toBeTruthy();
  });

  it('keeps a weight given with the added-load results, and switches it on', async () => {
    await toBaseline(['hangboard', 'gym', 'wall']);
    fireEvent.change(screen.getByLabelText('Max Hang 20mm 7s'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Max Pull-Ups'), { target: { value: '10' } });
    fireEvent.change(box()!, { target: { value: '150' } });
    await finish();
    const saved = await listMetricEntries();
    expect(saved.find((e) => e.metricId === 'max_hang_20mm_7s')).toMatchObject({ value: 30, bodyweight: 150 });
    expect('bodyweight' in saved.find((e) => e.metricId === 'max_pullups')!).toBe(false);
    expect(useSettings.getState().weighIn).toBe(true);
  });

  it('changes nothing when left empty', async () => {
    await toBaseline(['hangboard', 'gym', 'wall']);
    fireEvent.change(screen.getByLabelText('Max Hang 20mm 7s'), { target: { value: '30' } });
    await finish();
    const saved = await listMetricEntries();
    expect(saved.some((e) => 'bodyweight' in e)).toBe(false);
    expect(useSettings.getState().weighIn).toBe(false);
  });

  it('holds the step on a weight that is not one', async () => {
    await toBaseline(['hangboard', 'gym', 'wall']);
    for (const typed of ['0', '-5', 'heavy']) {
      fireEvent.change(box()!, { target: { value: typed } });
      expect(screen.getByText('A weight above zero, in pounds — or leave it empty.')).toBeTruthy();
      expect((screen.getByRole('button', { name: /Next/ }) as HTMLButtonElement).disabled, typed).toBe(true);
    }
    fireEvent.change(box()!, { target: { value: '' } });
    expect((screen.getByRole('button', { name: /Next/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('the baseline, with none', () => {
  it('does not ask', async () => {
    await toBaseline(['wall']);
    expect(screen.queryByText('Your bodyweight (optional)')).toBeNull();
    expect(box()).toBeNull();
  });

  it('names the one it has, in the singular', async () => {
    await toBaseline(['hangboard', 'wall']);
    expect(screen.getByText(/^Max Hang 20mm 7s records what you add, not what you hold\. Give your weight and your block review reads that result against it\./)).toBeTruthy();
  });
});
