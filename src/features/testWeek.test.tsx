// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { testWeeks } from '@/engine/assessments';
import { addDays, today } from '@/engine/dates';
import { putSession, newSession } from '@/db/sessions';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { HomePage } from '@/features/home/HomePage';

/**
 * A test week said where the climber is standing (PLAN.md M67).
 */

const PROGRAM = 'gravity_defied';

/**
 * Start the program far enough back that today lands in `week`.
 *
 * Relative to the real today rather than a fixed date: the calendar renders
 * the current month, so a program started in a hardcoded January is a
 * program the calendar is not showing.
 */
async function runningInWeek(week: number): Promise<string> {
  const start = addDays(today(), -(week - 1) * 7);
  await running(start);
  return start;
}

async function running(start: string, program: string = PROGRAM): Promise<void> {
  await reset();
  await putSession(newSession(start, 0, { completed: true }));
  await hydrate();
  useProfile.setState({
    activeProgramId: program,
    startDates: { [program]: start },
    plans: { [program]: { 1: 'tech', 3: 'eng', 5: 'perf' } },
    weekOverrides: {},
    adaptations: {},
  });
}

describe('the calendar', () => {
  it('marks the weeks the program asks for numbers', async () => {
    await runningInWeek(1);
    renderAt('/calendar', <CalendarPage />);
    expect(screen.getAllByText('T').length).toBeGreaterThan(0);
  });

  it('explains the marker rather than leaving two letters on a grid', async () => {
    await runningInWeek(1);
    renderAt('/calendar', <CalendarPage />);
    expect(screen.getByText(/T — assessment week/)).toBeTruthy();
  });

  // Peak Performance deloads on weeks 5 and 9 — the two weeks its phases
  // start — so a rule that hid the test marker on a deload week lost both of
  // its mid-block tests. A deload is also the week you are freshest to test
  // in, which makes it the last week to stay quiet.
  it('marks a week that is both a deload and a test week as both', async () => {
    const peak = getProgram('peak_performance')!;
    expect(peak.deloadWeeks).toContain(5);
    expect(testWeeks(peak).map((t) => t.week)).toContain(5);

    await running(addDays(today(), -28), 'peak_performance');
    renderAt('/calendar', <CalendarPage />);
    expect(screen.getAllByText('DL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('T').length).toBeGreaterThan(0);
  });
});

describe('home', () => {
  // A test wants you fresh, so the rest day in a test week is the best day
  // to be told — not the one day the app says nothing.
  it('says what the test week is for on a rest day too', async () => {
    await runningInWeek(1);
    renderAt('/', <HomePage />);
    expect(screen.getByText(/Baseline week/)).toBeTruthy();
    const link = screen.getByText(/Baseline week/).closest('a')!;
    expect(link.getAttribute('href')).toBe('#/assessments');
  });

  it('says nothing on an ordinary week', async () => {
    await runningInWeek(2);
    renderAt('/', <HomePage />);
    expect(screen.queryByText(/Baseline week|Test week/)).toBeNull();
  });
});
