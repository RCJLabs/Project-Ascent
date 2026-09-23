// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { putMetricEntry } from '@/db/metrics';
import { newSession, putSession } from '@/db/sessions';
import { addDays, dayOfWeek, startOfWeek, today } from '@/engine/dates';
import { DAY_NAMES, type WeekPlan } from '@/engine/scheduler';
import type { Injury } from '@/store/profile';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { AssessmentsPage } from '@/features/assessments/AssessmentsPage';
import { HomePage } from '@/features/home/HomePage';
import { DayBody, LogPage } from '@/features/log/LogPage';
import { WeekPage } from '@/features/week/WeekPage';

/**
 * Which test, on which day (PLAN.md M325).
 *
 * Every day of a test week used to say the numbers were due and link to all
 * of them at once. These hold what the climber is now told: this day's
 * share, in the program's order, what a hurt part would say about each, and
 * what an earlier day left behind.
 */

const TODAY = today();
const SUNDAY = startOfWeek(TODAY);
/** Iron Grip as its layout runs it: finger days Monday and Thursday. */
const IRON: WeekPlan = { 1: 'fp', 3: 'perf', 4: 'fp', 6: 'perf' };
const MONDAY = addDays(SUNDAY, 1);
const TUESDAY = addDays(SUNDAY, 2);
const WEDNESDAY = addDays(SUNDAY, 3);
const THURSDAY = addDays(SUNDAY, 4);
const SATURDAY = addDays(SUNDAY, 6);

const ELBOW: Injury = {
  id: 'inj-elbow',
  part: 'elbow',
  since: addDays(TODAY, -20),
  severity: 'managing',
  status: 'returning',
} as Injury;

/**
 * Iron Grip in its baseline week, which is this one.
 *
 * Anything to seed goes in before `hydrate`, which reloads the profile from
 * the database and would put back whatever this sets after it.
 */
async function baselineWeek(
  plan: WeekPlan = IRON,
  injuries: Injury[] = [],
  seed: () => Promise<unknown> = async () => undefined,
): Promise<void> {
  await reset();
  await seed();
  await hydrate();
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: SUNDAY },
    plans: { iron_grip: plan },
    weekOverrides: {},
    adaptations: {},
    injuries,
  } as never);
}

const log = (date: string) => renderAt(`/log/${date}`, <LogPage params={{ date }} />);
const listed = async () =>
  within((await screen.findByText(/in this order, after the warm-up/)).parentElement!)
    .getAllByRole('listitem')
    .map((li) => li.firstChild?.textContent);

describe("a day's share of the battery", () => {
  it('names the finger day its tests, in the order the program lists them', async () => {
    await baselineWeek();
    log(MONDAY);
    expect(await listed()).toEqual(['Max Hang 20mm 7s', 'Weighted Pull-Ups 3RM', 'Core Lever', 'Dead Hang']);
  });

  it('gives the other finger day the rest of the finger and bar work', async () => {
    await baselineWeek();
    log(THURSDAY);
    expect(await listed()).toEqual(['Repeater Weight', 'Lock-Off 90°', 'Max Pull-Ups', 'Max Push-Ups']);
  });

  it('gives a climbing day the grade', async () => {
    await baselineWeek();
    log(WEDNESDAY);
    expect(await listed()).toEqual(['Max Boulder Grade']);
  });

  it('says where the tests are on a day that has none', async () => {
    await baselineWeek();
    log(TUESDAY);
    const others = [MONDAY, WEDNESDAY, THURSDAY].filter((d) => d !== TUESDAY).map((d) => DAY_NAMES[dayOfWeek(d)]);
    const line = await screen.findByText(new RegExp(`Nothing to test`));
    expect(line.textContent).toBe(
      `Nothing to test ${TUESDAY === TODAY ? 'today' : 'on Tuesday'} — this week's tests are on ${others.slice(0, -1).join(', ')} and ${others.at(-1)}.`,
    );
  });

  it('says nothing about tests outside a test week', async () => {
    await reset();
    await hydrate();
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: addDays(SUNDAY, -7) },
      plans: { iron_grip: IRON },
      weekOverrides: {},
      adaptations: {},
      injuries: [],
    } as never);
    log(MONDAY);
    await screen.findByRole('button', { name: /Start session|Log a session/ });
    expect(screen.queryByText(/in this order|Nothing to test/)).toBeNull();
  });
});

describe('what has been taken', () => {
  it('ticks a result already in, and keeps the rest', async () => {
    await baselineWeek(IRON, [], () => putMetricEntry({ metricId: 'max_hang_20mm_7s', date: MONDAY, value: 30 }));
    log(MONDAY);
    expect(await listed()).toEqual(['Max Hang 20mm 7s', 'Weighted Pull-Ups 3RM', 'Core Lever', 'Dead Hang']);
    const items = within((await screen.findByText(/in this order/)).parentElement!).getAllByRole('listitem');
    expect(items[0]!.textContent).toContain('✓');
    expect(items[1]!.textContent).not.toContain('✓');
  });

  it('says so once the day is done', async () => {
    await baselineWeek(IRON, [], () =>
      putMetricEntry({ metricId: 'max_boulder_grade', date: WEDNESDAY, value: 5, display: 'V5' }),
    );
    log(WEDNESDAY);
    expect(await screen.findByText('Taken this week: Max Boulder Grade.')).toBeTruthy();
    expect(screen.queryByText(/in this order/)).toBeNull();
  });

  it('carries what an earlier day did not get', async () => {
    await baselineWeek(IRON, [], async () => {
      await putMetricEntry({ metricId: 'max_hang_20mm_7s', date: MONDAY, value: 30 });
      await putMetricEntry({ metricId: 'dead_hang', date: MONDAY, value: 50 });
    });
    log(SATURDAY);
    const line = await screen.findByText(/Still to take from earlier in the week/);
    expect(line.textContent).toBe(
      'Still to take from earlier in the week: Weighted Pull-Ups 3RM, Core Lever, Max Boulder Grade, ' +
        'Repeater Weight, Lock-Off 90°, Max Pull-Ups and Max Push-Ups.',
    );
  });
});

describe('a hurt part', () => {
  it('is named beside each test that loads it, and only those', async () => {
    await baselineWeek(IRON, [ELBOW]);
    log(MONDAY);
    const items = within((await screen.findByText(/in this order/)).parentElement!).getAllByRole('listitem');
    const flagged = items.map((li) => /Loads your elbow/.test(li.textContent ?? ''));
    // Max hang and dead hang are fingers; the pull-up and the lever go
    // through the elbow.
    expect(flagged).toEqual([false, true, true, false]);
  });
});

describe('home', () => {
  it("shows today's share above the card when today carries tests", async () => {
    await baselineWeek({ [dayOfWeek(TODAY)]: 'fp', [(dayOfWeek(TODAY) + 3) % 7]: 'perf' });
    renderAt('/', <HomePage />);
    // Every finger and bar test, since today is the week's only strength day.
    expect(await listed()).toEqual([
      'Max Hang 20mm 7s',
      'Repeater Weight',
      'Weighted Pull-Ups 3RM',
      'Lock-Off 90°',
      'Core Lever',
      'Max Pull-Ups',
      'Dead Hang',
      'Max Push-Ups',
    ]);
    expect(screen.getByText(/^Today, in this order/)).toBeTruthy();
  });
});

describe('the week', () => {
  it('names each session its tests', async () => {
    await baselineWeek();
    renderAt('/week', <WeekPage params={{}} />);
    expect(await screen.findByText('Test: Max Hang 20mm 7s, Weighted Pull-Ups 3RM, Core Lever, Dead Hang')).toBeTruthy();
    expect(screen.getByText('Test: Repeater Weight, Lock-Off 90°, Max Pull-Ups, Max Push-Ups')).toBeTruthy();
    expect(screen.getByText('Test: Max Boulder Grade')).toBeTruthy();
    expect(screen.getAllByText(/^Test: /)).toHaveLength(3);
    expect(screen.getByText(/Spread over the week/)).toBeTruthy();
  });
});

describe('the list the nudge opens', () => {
  it('says which day each due test is planned for', async () => {
    await baselineWeek();
    renderAt('/assessments', <AssessmentsPage />);
    // The battery's row, which comes before the block report's line for the
    // same test — a bare `getByText` finds both.
    const row = (label: string) => screen.getAllByText(label)[0]!.closest('li')!.textContent ?? '';
    await screen.findByText(/Results are keyed to the benchmark/);
    expect(row('Max Hang 20mm 7s')).toContain(MONDAY === TODAY ? '· today' : '· planned Monday');
    expect(row('Repeater Weight')).toContain(THURSDAY === TODAY ? '· today' : '· planned Thursday');
    expect(row('Max Boulder Grade')).toContain(WEDNESDAY === TODAY ? '· today' : '· planned Wednesday');
  });
});

describe('the check-in', () => {
  /**
   * No sleep, which asks any test to wait (`readiness.ts`) — whatever the day
   * loads, so a climbing day with no board work in it can be asked too.
   */
  async function checkedIn(date: string): Promise<void> {
    await baselineWeek(IRON, [], () =>
      putSession({
        ...newSession(date, 0, { completed: false }),
        programId: 'iron_grip',
        sessionTypeId: date === MONDAY ? 'fp' : 'perf',
        checkIn: { fingers: 'good', sleep: 'none' },
      } as never),
    );
    useSettings.setState({ logView: 'full' });
    renderAt(`/log/${date}`, <DayBody date={date} />);
  }

  it('asks the test to wait on a day that has one', async () => {
    await checkedIn(MONDAY);
    expect(await screen.findByText(/Let the test wait for a better day/)).toBeTruthy();
  });

  it('does not, on a day of the same week that has none', async () => {
    // Saturday's climbing day carries nothing: Wednesday took the grade.
    await checkedIn(SATURDAY);
    await screen.findByText(/Nothing to test/);
    expect(screen.queryByText(/Let the test wait/)).toBeNull();
  });
});
