// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { listMetricEntries, putMetricEntry } from '@/db/metrics';
import { today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { AssessmentsPage } from '@/features/assessments/AssessmentsPage';

/**
 * A stopwatch for the benchmarks that are a hold (PLAN.md M99b).
 *
 * Seven assessed metrics are "hold it until you cannot" and the app's answer
 * was a text box, so a climber timed a front lever on their phone's clock app
 * and typed the number in.
 *
 * The clock is driven by a fake timer here rather than by waiting: the sheet
 * reads `Date.now()` against a start instead of accumulating ticks, so both
 * have to move together for the elapsed time to be what a test asserts.
 */

async function assessments(): Promise<void> {
  await reset();
  await hydrate();
  renderAt('/assessments', <AssessmentsPage />);
}

/** Open the picker and choose a benchmark that is a hold. */
async function open(label: string): Promise<void> {
  await assessments();
  fireEvent.click(await screen.findByText(/Add a benchmark/));
  fireEvent.click(await screen.findByText(label));
}

/** Run the 3-2-1, then hold for `seconds`. */
function hold(seconds: number): void {
  fireEvent.click(screen.getByText('Start'));
  act(() => {
    vi.advanceTimersByTime(3200);
  });
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('timing a hold', () => {
  it('offers a clock on a benchmark that is one', async () => {
    await open('Front Lever');
    expect(screen.getByText('Time it')).toBeTruthy();
  });

  it('offers none on a benchmark that is a count', async () => {
    await open('Max Pull-Ups');
    expect(screen.queryByText('Time it')).toBeNull();
  });

  it('counts up in minutes and seconds', async () => {
    await open('Front Lever');
    fireEvent.click(screen.getByText('Time it'));
    const sheet = screen.getByRole('dialog', { name: 'Front Lever stopwatch' });
    expect(within(sheet).getByText('0:00')).toBeTruthy();
    hold(14);
    expect(within(sheet).getByText('0:14')).toBeTruthy();
  });

  it('counts down before it counts up, so there is time to get on the bar', async () => {
    await open('Front Lever');
    fireEvent.click(screen.getByText('Time it'));
    fireEvent.click(screen.getByText('Start'));
    expect(screen.getByText('Get ready')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3200);
    });
    expect(screen.queryByText('Get ready')).toBeNull();
    expect(screen.getByText('Holding')).toBeTruthy();
  });

  // The clock fills the box. Nothing here records a result the climber did
  // not confirm on screen.
  it('suggests the number rather than saving it', async () => {
    await open('Front Lever');
    fireEvent.click(screen.getByText('Time it'));
    hold(23);
    fireEvent.click(screen.getByLabelText('Stop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((screen.getByLabelText('Front Lever result') as HTMLInputElement).value).toBe('23');
    expect(await listMetricEntries()).toEqual([]);
  });

  it('saves only once the climber says so', async () => {
    await open('Front Lever');
    fireEvent.click(screen.getByText('Time it'));
    hold(23);
    fireEvent.click(screen.getByLabelText('Stop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByText('Save'));
    await waitFor(async () => {
      const entries = await listMetricEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.value).toBe(23);
      expect(entries[0]!.metricId).toBe('front_lever_hold');
    });
  });

  it('leaves the box alone when the sheet is closed instead', async () => {
    await open('Front Lever');
    fireEvent.click(screen.getByText('Time it'));
    hold(23);
    fireEvent.click(screen.getByLabelText('Close stopwatch'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((screen.getByLabelText('Front Lever result') as HTMLInputElement).value).toBe('');
  });

  /**
   * The reason the clock reads the wall instead of counting its own ticks.
   *
   * A phone throttles intervals in a backgrounded tab and sleeps the screen
   * mid-hold, so a counter built from ticks stalls while the climber is
   * still hanging. Moving the system clock *without* firing the intervals is
   * exactly that situation, and a tick-accumulating version reports a second
   * where the wall says twenty.
   */
  it('keeps time through a tab that stopped ticking', async () => {
    await open('Front Lever');
    fireEvent.click(screen.getByText('Time it'));
    fireEvent.click(screen.getByText('Start'));
    act(() => {
      vi.advanceTimersByTime(3200);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // The tab goes away: time passes, intervals do not fire.
    act(() => {
      vi.setSystemTime(Date.now() + 20_000);
      vi.advanceTimersByTime(100);
    });
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('0:21')).toBeTruthy();
  });

  // An ARC round is stored in minutes, so the clock's seconds have to become
  // the metric's own unit rather than its own.
  it('reports an ARC round in minutes, not seconds', async () => {
    await open('ARC Duration');
    fireEvent.click(screen.getByText('Time it'));
    hold(22 * 60 + 30);
    fireEvent.click(screen.getByLabelText('Stop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((screen.getByLabelText('ARC Duration result') as HTMLInputElement).value).toBe('23');
  });
});

/**
 * The prose that was written twice (PLAN.md M99b).
 *
 * The milestone claimed the assessments page never explains a test. It does
 * — from `Metric.description`, in two of its three places. What was missing
 * was the third place, and the entry convention, which lived only in
 * onboarding.
 */
describe('what the page says about the test', () => {
  it('describes the test on a benchmark being added', async () => {
    await open('Front Lever');
    expect(screen.getByText(/Best front lever hold/i)).toBeTruthy();
  });

  it('says how to type a number that needs a convention', async () => {
    await open('Max Hang 20mm 7s');
    expect(screen.getByText(/Enter 0 if bodyweight is your limit/)).toBeTruthy();
  });

  it('says nothing about typing where there is no convention', async () => {
    await open('Front Lever');
    expect(screen.queryByText(/Enter 0 if/)).toBeNull();
  });

  /**
   * The one place the description was actually missing.
   *
   * A benchmark already on your list opened straight into a form, with no
   * explanation of the test — which is the opposite of the milestone's claim
   * that the page never explains anything, and the only part of it that was
   * true.
   */
  it('describes the test on a benchmark already being tracked', async () => {
    await reset();
    await putMetricEntry({ metricId: 'front_lever_hold', date: today(), value: 12 });
    await hydrate();
    renderAt('/assessments', <AssessmentsPage />);
    fireEvent.click(await screen.findByText('Front Lever'));
    expect(screen.getByText(/Best front lever hold/i)).toBeTruthy();
    expect(screen.getByText('Time it')).toBeTruthy();
  });
});
