// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { loadPrograms } from '@/content/programs';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { CoachPage } from '@/features/coach/CoachPage';
import { FinishPage } from '@/features/finish/FinishPage';

/**
 * The plan, checked against the log, on the screen (PLAN.md M148).
 *
 * Six joins over data the app already stored and the coach shows one — the
 * heaviest — because six divergences at once reads as an indictment and
 * nobody acts on an indictment. The full list is the block report's.
 */

const TODAY = today();
/**
 * A Sunday far enough back that the block has run eight weeks.
 *
 * **Snapped to one, since M235.** This was `addDays(TODAY, -56)`, which is a
 * Sunday one day in seven — and the block report below only assembles when
 * `START` lands Sunday to Wednesday. So that test had been **red three days
 * in seven** since it was written, and every suite run that caught it
 * happened to fall on the other four. Measured by walking the offset back a
 * day at a time: Thursday, Friday and Saturday fail; Sunday to Wednesday
 * pass.
 *
 * `startOfWeek` snaps back, so the anchor is never less than eight weeks ago
 * and the comment above is true on every day of the year.
 */
const START = startOfWeek(addDays(TODAY, -56));

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

/**
 * Iron Grip, running since `START`, with its own recommended week.
 *
 * After `hydrate`, which reads the profile back off the database and would
 * otherwise undo it.
 */
function running(dismissedTips: Record<string, string> = {}) {
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: START },
    plans: { iron_grip: { 1: 'fp', 3: 'perf', 5: 'fp' } },
    weekOverrides: {},
    adaptations: {},
    tracks: {},
    dismissedTips,
  });
}

async function coach(dismissedTips?: Record<string, string>) {
  await hydrate();
  running(dismissedTips);
  renderAt('/coach', <CoachPage />);
  await screen.findByRole('heading', { name: /Coach/i });
}

/** Finger sessions on back-to-back days, `weeks` times over. */
async function backToBack(weeks: number) {
  for (let w = 0; w < weeks; w += 1) {
    await putSession(
      newSession(addDays(START, w * 7 + 1), 0, { completed: true, sessionTypeId: 'fp' }),
    );
    await putSession(
      newSession(addDays(START, w * 7 + 2), 0, { completed: true, sessionTypeId: 'fp' }),
    );
  }
}

describe('the coach board', () => {
  it('says when the dates broke a rule the layout respects', async () => {
    await backToBack(3);
    await coach();
    expect(await screen.findByText(/3 times under the 48-hour gap/)).toBeTruthy();
  });

  it('shows the program its own reason rather than an assertion', async () => {
    await backToBack(3);
    await coach();
    expect(screen.getByText(/48 hours between finger sessions/i)).toBeTruthy();
  });

  it('stays quiet at one bad week', async () => {
    await backToBack(1);
    await coach();
    expect(screen.queryByText(/under the 48-hour gap/)).toBeNull();
  });

  it('says nothing at all without a program to check against', async () => {
    await backToBack(3);
    await hydrate();
    renderAt('/coach', <CoachPage />);
    await screen.findByRole('heading', { name: /Coach/i });
    expect(screen.queryByText(/under the 48-hour gap/)).toBeNull();
  });

  /**
   * One at a time, which is the rule `missingDomains` set and the reason
   * the six joins live behind one card rather than six.
   */
  it('shows one divergence even when several are true', async () => {
    await backToBack(3);
    // The same three weeks, also logged at an RPE the Performance day does
    // not ask for — a second finding, on a different join.
    for (const week of [0, 1, 2, 4]) {
      await putSession(
        newSession(addDays(START, week * 7 + 3), 0, {
          completed: true,
          sessionTypeId: 'perf',
          rpe: 3,
        }),
      );
    }
    await coach();
    expect(screen.getByText(/3 times under the 48-hour gap/)).toBeTruthy();
    expect(screen.queryByText(/written hard and you log it at 3/)).toBeNull();
  });

  it('can be waved away, and comes back when the count moves', async () => {
    await backToBack(3);
    await coach({ 'plan-vs-log:spacing:fp': '3' });
    expect(screen.queryByText(/3 times under the 48-hour gap/)).toBeNull();

    await backToBack(5);
    await coach({ 'plan-vs-log:spacing:fp': '3' });
    expect(await screen.findByText(/5 times under the 48-hour gap/)).toBeTruthy();
  });
});

describe('the block report', () => {
  /** Iron Grip, finished: fourteen weeks back, so all twelve have run. */
  const FINISHED = addDays(START, -42);

  async function report() {
    await hydrate();
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: FINISHED },
      plans: { iron_grip: { 1: 'fp', 3: 'perf', 5: 'fp' } },
      weekOverrides: {},
      adaptations: {},
      tracks: {},
    } as never);
    renderAt('/finish', <FinishPage />);
    await screen.findByText('What comes next');
  }

  async function breaches(weeks: number) {
    for (let w = 0; w < weeks; w += 1) {
      await putSession(
        newSession(addDays(FINISHED, w * 7 + 1), 0, { completed: true, sessionTypeId: 'fp' }),
      );
      await putSession(
        newSession(addDays(FINISHED, w * 7 + 2), 0, { completed: true, sessionTypeId: 'fp' }),
      );
    }
  }

  /**
   * The list, and not one of it. At the end of a block these are a record
   * of how it ran rather than a verdict on this week, and the quiet ones
   * are what a climber picking the next program wants in front of them.
   */
  it('shows every divergence with both of its numbers', async () => {
    await breaches(3);
    for (const week of [0, 1, 2, 4]) {
      await putSession(
        newSession(addDays(FINISHED, week * 7 + 3), 0, {
          completed: true,
          sessionTypeId: 'perf',
          rpe: 3,
        }),
      );
    }
    await report();
    await screen.findByText('Where it drifted from the plan');
    expect(screen.getByText('48h apart')).toBeTruthy();
    expect(screen.getByText('24h, 3 times')).toBeTruthy();
    expect(screen.getByText('hard as written')).toBeTruthy();
    expect(screen.getByText('RPE 3 logged')).toBeTruthy();
    // Two rows about one session type, told apart by the join each came
    // from rather than by reading both numbers.
    expect(screen.getByText('· spacing')).toBeTruthy();
    expect(screen.getByText('· effort')).toBeTruthy();
  });

  it('has no card at all for a block that ran as written', async () => {
    await breaches(0);
    await report();
    expect(screen.queryByText('Where it drifted from the plan')).toBeNull();
  });
});
