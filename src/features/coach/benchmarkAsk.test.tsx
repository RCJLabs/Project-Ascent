// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { HomePage } from '@/features/home/HomePage';
import { CoachPage } from './CoachPage';

/**
 * From the hook, not from the rule (PLAN.md M174).
 *
 * This is the test the milestone exists for. `CoachInput.programMetrics` was
 * declared, documented and **never passed** — the rule could be written
 * perfectly and say nothing, because `useTips` handed it every other input
 * the board needs and not this one. An engine test that builds the input by
 * hand proves the rule and misses exactly that, which is the shape M163's
 * trip tip shipped a screen test for and M161, M164, M165 and M168 each
 * shipped a battery survivor for.
 *
 * So the program is set on the profile store here and nothing else, and the
 * question asked is whether the ask reaches a climber.
 */

const DAY = today();

/** A month on Iron Grip, nine prescribed numbers, none of them measured. */
async function onIronGrip(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  // Every other day rather than named weekdays (PLAN.md M179b). A filter on
  // Mondays, Wednesdays and Fridays inside a window ending *today* puts a
  // different number of sessions in the fixture depending on which weekday
  // today is, and the suite changed shape at midnight. `useTips` reads the
  // clock itself, so this cannot take a date — a fixed stride from today is
  // deterministic instead, and the density is the same three a week.
  for (let d = 29; d >= 0; d -= 2) {
    const date = addDays(DAY, -d);
    await putSession({
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: 7,
      durationMin: 60,
      warmup: true,
      drillDone: false,
      climbs: [
        { id: `a${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session);
  }
  await hydrate();
  // After `hydrate`, which reloads the profile from the database and would
  // otherwise overwrite this (PLAN.md M170 learned the same thing).
  //
  // No start date, deliberately. `useTips` gates `adherence` and `findings`
  // on one, and a block four weeks in reaches Iron Grip's deload week —
  // which fires a heavier tip and takes the front door, as it should. The
  // field under test does not depend on a start date, so leaving it out
  // isolates the one input this milestone is about.
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: {},
    injuries: [],
    dismissedTips: {},
    dismissedCards: ['safety', 'setup', 'programs'],
  });
}

const body = () => document.body.textContent ?? '';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('the ask for a first benchmark', () => {
  it('reaches the front door', async () => {
    await onIronGrip();
    renderAt('/', <HomePage />);
    await screen.findByText("Coach's Corner");
    expect(body(), 'the hook never handed the rule the battery').toMatch(
      /No baseline for the 9 numbers your training is meant to move/,
    );
  });

  it('carries its reason and somewhere to go on the board', async () => {
    await onIronGrip();
    renderAt('/coach', <CoachPage />);
    await screen.findByText(/No baseline for the 9 numbers/);
    expect(body()).toMatch(/Taken now it is a before/);
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '#/assessments');
    expect(link, 'no way to go and take one').toBeTruthy();
    expect((link!.textContent ?? '').trim()).toBe('Take a baseline');
  });

  /**
   * And the number is the program's, not a constant. Iron Grip asks for
   * nine; a climber on Outdoor Climbing is asked for five.
   */
  it('counts the battery the climber was actually given', async () => {
    await onIronGrip();
    useProfile.setState({ activeProgramId: 'outdoor_climbing' });
    renderAt('/coach', <CoachPage />);
    await screen.findByText(/No baseline for the 5 numbers/);
  });

  /** With no program there is no battery, and the board says nothing. */
  it('says nothing to a climber nobody asked', async () => {
    await onIronGrip();
    useProfile.setState({ activeProgramId: null });
    renderAt('/coach', <CoachPage />);
    await screen.findByText('How this works');
    expect(body()).not.toMatch(/No baseline for/);
  });
});
