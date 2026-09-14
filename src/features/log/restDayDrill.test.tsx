// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { addDays, dayOfWeek, today } from '@/engine/dates';
import { restDayDrill } from '@/engine/restDrill';
import { offWallDrills } from '@/content/drills';
import { getProgram } from '@/content/programs';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { HomePage } from '@/features/home/HomePage';
import { LogPage } from './LogPage';

/**
 * The rest day offers one of the twelve, on the screens (PLAN.md M164).
 *
 * `offWallDrills()` had no caller in the app before this — only its own test
 * — so the twelve were proved to exist and never proved to be offered. That
 * is M152's lesson in its fourth costume, and the reason this file renders
 * Home and the logger rather than asserting against the engine.
 */

const DAY = today();

/**
 * A block running now, with today's weekday set to whatever is asked for.
 *
 * A `WeekPlan` maps day-of-week to a session type, so *today* is a rest day
 * or a training day according to the plan and not the start date — which is
 * why an earlier draft of this file could not make today a rest day by
 * walking back through start dates, and passed anyway by wrapping its one
 * assertion in an `if`. The start is a week back so the block is live.
 */
async function running(typeId: string, injuries: { part: string; status: string }[] = []): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await hydrate();
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: addDays(DAY, -7) },
    plans: { iron_grip: { [dayOfWeek(DAY)]: typeId } as never },
    weekOverrides: {},
    adaptations: {},
    tracks: {},
    injuries: injuries as never,
    dismissedTips: {},
  });
}

const restDay = (injuries: { part: string; status: string }[] = []) => running('rest', injuries);

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** The pre-session card's text, wherever it is rendered. */
const body = () => document.body.textContent ?? '';

describe('what Home says about a rest day', () => {
  it('names a drill that needs no wall', async () => {
    await restDay();
    renderAt('/', <HomePage />);
    await screen.findByText(/Rest day/);
    const drill = restDayDrill(DAY, []);
    expect(drill, 'no drill for this date at all').not.toBeNull();
    expect(body(), 'the rest day offered nothing').toContain(drill!.name);
    expect(body()).toMatch(/no wall needed/);
  });

  it('still says recovery is training, which is what it said before', async () => {
    await restDay();
    renderAt('/', <HomePage />);
    await screen.findByText(/Rest day/);
    expect(body()).toMatch(/Recovery is training/);
  });

  /**
   * And it is the injury reading, not a fixed list. `off_wrist_forearm_prep`
   * loads `fingers`; a climber resting a hurt finger is offered something
   * else on the same date.
   */
  it('offers a different one to a climber with a hurt finger', async () => {
    const plain = restDayDrill(DAY, []);
    const hurt = restDayDrill(DAY, ['fingers']);
    await restDay([{ part: 'fingers', status: 'active' }]);
    renderAt('/', <HomePage />);
    await screen.findByText(/Rest day/);
    expect(hurt, 'nothing left for a hurt finger').not.toBeNull();
    expect(body()).toContain(hurt!.name);
    // Only meaningful when the two disagree on this date; when they agree the
    // date is one no finger drill was due on anyway, and the assertion above
    // is still the real one.
    if (plain!.id !== hurt!.id) expect(body()).not.toContain(plain!.name);
  });

  /** A training day names the session, not a rest-day drill. */
  it('offers nothing of the kind on a training day', async () => {
    await running('fp');
    renderAt('/', <HomePage />);
    await screen.findByRole('heading', { level: 1 });
    expect(body(), 'today is not a training day after all').not.toMatch(/Rest day/);
    expect(body()).not.toMatch(/no wall needed/);
  });
});

describe('the logger, on a rest day', () => {
  /**
   * The bug this half of the milestone exists for: `isRest` and the rest of
   * the editor were a ternary and the drill card lived in the *other* branch,
   * so a rest session carrying a `drillId` showed nothing about it. Which
   * meant it could not be ticked, so `drillsCompleted` never moved and the
   * coach kept asking — the same failure its own comment records for the
   * quick/full case.
   */
  it('shows the drill on a rest session, where it can be ticked', async () => {
    await restDay();
    useSettings.setState({ logView: 'quick' });
    await useSessions.getState().create(DAY, {
      completed: true,
      programId: 'iron_grip',
      sessionTypeId: 'rest',
      restChecklist: { hydration: false, mobility: false, zone1: false, sleep: false },
      drillId: 'off_box_breathing',
    });
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    await screen.findByText('Recovery checklist');
    expect(body(), 'the drill card is still in the other branch').toContain('Box Breathing');
    expect(screen.getByText('Mark done')).toBeTruthy();
  });

  /**
   * And not only in the full view. The rest branch has no quick half to be
   * the short version of, so gating on `full` would hide the drill from
   * whichever view the climber happened to leave the app in.
   */
  it('shows it in the quick view too', async () => {
    await restDay();
    useSettings.setState({ logView: 'quick' });
    await useSessions.getState().create(DAY, {
      completed: true,
      programId: 'iron_grip',
      sessionTypeId: 'rest',
      restChecklist: { hydration: false, mobility: false, zone1: false, sleep: false },
      drillId: 'off_skin_repair',
    });
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    await screen.findByText('Recovery checklist');
    expect(body()).toContain('Skin Repair');
  });

  it('can be marked done, so the count the coach reads can move', async () => {
    await restDay();
    await useSessions.getState().create(DAY, {
      completed: true,
      programId: 'iron_grip',
      sessionTypeId: 'rest',
      restChecklist: { hydration: false, mobility: false, zone1: false, sleep: false },
      drillId: 'off_box_breathing',
    });
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    await screen.findByText('Recovery checklist');
    fireEvent.click(screen.getByText('Mark done'));
    expect(await screen.findByText('Done')).toBeTruthy();
  });

  it('still shows the recovery checklist beside it', async () => {
    await restDay();
    await useSessions.getState().create(DAY, {
      completed: true,
      programId: 'iron_grip',
      sessionTypeId: 'rest',
      restChecklist: { hydration: false, mobility: false, zone1: false, sleep: false },
      drillId: 'off_box_breathing',
    });
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    expect(await screen.findByText('Recovery checklist')).toBeTruthy();
    expect(body()).toMatch(/Walking \/ Zone 1/);
  });

  /** And a rest day with no drill on it is the checklist, as it always was. */
  it('shows no drill card when the session carries no drill', async () => {
    await restDay();
    await useSessions.getState().create(DAY, {
      completed: true,
      programId: 'iron_grip',
      sessionTypeId: 'rest',
      restChecklist: { hydration: false, mobility: false, zone1: false, sleep: false },
    });
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    await screen.findByText('Recovery checklist');
    expect(screen.queryByText('Mark done')).toBeNull();
  });

  /**
   * The whole path, from the card to a session with the drill on it: starting
   * a rest day stamps the offered drill, exactly as starting a training day
   * stamps the plan's.
   */
  // (kept below)
  it('stamps the offered drill when the rest day is started from the card', async () => {
    await restDay();
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    fireEvent.click(await screen.findByText('Log rest day'));
    await screen.findByText('Recovery checklist');
    const drill = restDayDrill(DAY, [])!;
    expect(useSessions.getState().byDate[DAY]?.[0]?.drillId).toBe(drill.id);
    expect(body()).toContain(drill.name);
  });

  /**
   * And a training day never gets one. The card only *renders* the offer on
   * a rest day, so a rule that computed it on every day would look identical
   * on screen and still stamp a rest drill onto a hangboard session — which
   * is what the battery found by deleting the `isRest` half of the gate and
   * surviving.
   */
  it('stamps no off-wall drill when a training day is started', async () => {
    await running('fp');
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    fireEvent.click(await screen.findByText(/Start session|Log a session/i));
    await screen.findByText('Climbs');
    const stamped = useSessions.getState().byDate[DAY]?.[0]?.drillId;
    const offWall = new Set(offWallDrills().map((d) => d.id));
    expect(stamped === undefined || !offWall.has(stamped as never)).toBe(true);
  });

  /**
   * Nor does a block that has run its course. `plannedDay` sets `isRest` on
   * an `over` day too — it prescribes nothing, which is not the same as
   * prescribing rest — and the pre-session card handles `over` in its own
   * branch above the rest one, so this is invisible on screen and real in
   * the session. The other half of the same battery survivor.
   */
  it('stamps no off-wall drill when the block has already finished', async () => {
    await running('rest');
    const program = getProgram('iron_grip')!;
    useProfile.setState({ startDates: { iron_grip: addDays(DAY, -(program.weeks * 7 + 14)) } });
    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    expect(await screen.findByText(/has run its course/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Log a session|Start session/i));
    await screen.findByText('Climbs');
    const stamped = useSessions.getState().byDate[DAY]?.[0]?.drillId;
    const offWall = new Set(offWallDrills().map((d) => d.id));
    expect(stamped === undefined || !offWall.has(stamped as never)).toBe(true);
  });
});
