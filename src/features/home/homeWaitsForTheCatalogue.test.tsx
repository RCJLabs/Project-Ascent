// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { act, renderHook, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { catalogueReadsBeforeLoad, forgetProgramsForTests, getProgram, loadPrograms } from '@/content/programs';
import { forgetDrillsForTests, getDrill, libraryReadsBeforeLoad, loadDrills } from '@/content/drills';
import { resetDbForTests } from '@/db/db';
import { putSession, type Session } from '@/db/sessions';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import {
  holdsForCatalogue,
  loadCatalogue,
  nothingToLookUp,
  useCatalogue,
  useHoldsForCatalogue,
} from '@/store/contentLoaded';
import { useSessions } from '@/store/sessions';
import { useProfile } from '@/store/profile';
import { HomePage } from './HomePage';

/**
 * Home draws before the catalogue lands, and nothing on it reads one early
 * (PLAN.md M364).
 *
 * The router used to hold every page until the shipped programs and the
 * drill library had arrived (M78). A new climber's first launch reads
 * nothing from either, and waited 0.4s on Slow 4G and 1.1s on Fast 3G for
 * them before the first-session card. Home is let through for that climber
 * now, on a visit the worker did not serve, so every card on it that reads
 * a program or a drill has to wait for them itself if the climber turns out
 * to need them — and one that does not reads `undefined` for the program a
 * climber is running and says something false about it.
 *
 * So this does not list the cards. The registries count every lookup of a
 * shipped program or drill made before they arrived, and Home — with its
 * lazy cards loaded — must make none. And for the climber it is let through
 * for, Home with the catalogue must read exactly as Home without it.
 */

const DAY = today();

const session = (date: string): Session =>
  ({
    id: `${date}#0`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    durationMin: 60,
    warmup: true,
    drillDone: false,
    rpe: 7,
    programId: 'iron_grip',
    sessionTypeId: 'fp',
    climbs: [{ id: `c${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' }],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
  }) as Session;

/** A climber two weeks into Iron Grip, with sessions logged under it. */
async function aClimberMidBlock(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await loadDrills();
  for (const d of [9, 6, 3, 0]) await putSession(session(addDays(DAY, -d)));
  await hydrate();
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: addDays(startOfWeek(DAY), -7) },
    plans: { iron_grip: { 1: 'fp', 3: 'perf' } },
    weekOverrides: {},
    adaptations: {},
    dismissedCards: [],
    injuries: [],
  });
}

/** The catalogue as it is at launch: not arrived, and the store saying so. */
function beforeTheCatalogue(): void {
  forgetProgramsForTests();
  forgetDrillsForTests();
  useCatalogue.setState({ hydrated: false });
}

/** Home's lazy cards, in, so they get their chance to read. */
/** The strip of days under the date: one link per day, to its log. */
const strip = () => document.querySelectorAll('header a[href*="/log/"]').length;

async function settle(): Promise<void> {
  await act(async () => {
    await import('@/features/coach/HomeCoachCard');
    await import('@/features/challenges/DailyTaskCard');
    await import('@/features/home/HomeStatsCard');
  });
  for (let i = 0; i < 5; i++) await act(async () => {});
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  // Put the registries back for every test after this one.
  await loadCatalogue();
});

describe('Home before the catalogue', () => {
  it('reads no program and no drill before they arrive', async () => {
    await aClimberMidBlock();
    beforeTheCatalogue();
    renderAt('/', <HomePage />);
    await settle();
    expect(catalogueReadsBeforeLoad(), 'a program was read before the catalogue arrived').toBe(0);
    expect(libraryReadsBeforeLoad(), 'a drill was read before the library arrived').toBe(0);
  });

  it('draws the date at once, and today and the week once the catalogue is in', async () => {
    await aClimberMidBlock();
    beforeTheCatalogue();
    renderAt('/', <HomePage />);
    await settle();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBeTruthy();
    expect(screen.getByLabelText("Loading today's session")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/training days? done/);
    // Nothing of the week at all, not just not the planned count: read
    // without the program, the week is today's session and no plan, and the
    // strip would draw that and then redraw it with the plan's marks.
    expect(strip(), 'the week was drawn without its program').toBe(0);

    await act(async () => {
      await loadCatalogue();
    });
    await settle();
    expect(screen.queryByLabelText("Loading today's session")).toBeNull();
    expect(document.body.textContent).toMatch(/training days? done/);
    expect(strip()).toBe(7);
  });

  it('never says no program is running to a climber who is running one', async () => {
    await aClimberMidBlock();
    beforeTheCatalogue();
    renderAt('/', <HomePage />);
    await settle();
    expect(document.body.textContent).not.toMatch(/no program is running/i);
    await act(async () => {
      await loadCatalogue();
    });
    await settle();
    expect(document.body.textContent).not.toMatch(/no program is running/i);
  });

  it('would notice a card that read too soon', () => {
    // The counters themselves, so a test above cannot pass on one that
    // never moves.
    beforeTheCatalogue();
    expect(catalogueReadsBeforeLoad()).toBe(0);
    expect(libraryReadsBeforeLoad()).toBe(0);
    expect(getProgram('iron_grip')).toBeUndefined();
    expect(getDrill('off_shoulder_cars' as never)).toBeUndefined();
    expect(catalogueReadsBeforeLoad(), 'a program read too soon was not counted').toBe(1);
    expect(libraryReadsBeforeLoad(), 'a drill read too soon was not counted').toBe(1);
  });
});

/** A climber on their first launch: nothing saved at all. */
async function aNewClimber(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await hydrate();
}

describe('Home before the catalogue, for a climber with nothing to look up', () => {
  /** Home as it reads with the catalogue still out, and once it is in. */
  async function withoutAndWith(): Promise<[string, string]> {
    beforeTheCatalogue();
    renderAt('/', <HomePage />);
    await settle();
    expect(catalogueReadsBeforeLoad(), 'a program was read before the catalogue arrived').toBe(0);
    expect(libraryReadsBeforeLoad(), 'a drill was read before the library arrived').toBe(0);
    const without = document.body.textContent ?? '';
    await act(async () => {
      await loadCatalogue();
    });
    await settle();
    return [without, document.body.textContent ?? ''];
  }

  it('does not wait for it, and reads the same without it as with it', async () => {
    await aNewClimber();
    const [without, withIt] = await withoutAndWith();
    expect(without).toMatch(/Your first session/);
    expect(
      screen.queryByLabelText("Loading today's session"),
      'a card waited for a catalogue it reads nothing from',
    ).toBeNull();
    expect(without).toBe(withIt);
  });

  it('nor for a climber who has saved other things but has no program and no log', async () => {
    // Not a first launch, but what the rule lets through all the same: an
    // injury, which Home's safety note and plan read.
    await aNewClimber();
    useProfile.setState({
      injuries: [{ id: 'f1', part: 'fingers', since: addDays(DAY, -20), severity: 'managing', status: 'active' }],
    });
    const [without, withIt] = await withoutAndWith();
    expect(without).toBe(withIt);
  });

  it('waits again if a session that needs it is logged before it lands', async () => {
    await aNewClimber();
    beforeTheCatalogue();
    renderAt('/', <HomePage />);
    await settle();
    expect(screen.queryByLabelText("Loading today's session")).toBeNull();
    await act(async () => {
      await putSession(session(DAY));
      await useSessions.getState().load();
    });
    await settle();
    expect(catalogueReadsBeforeLoad(), "the session's program was read before the catalogue").toBe(0);
    expect(libraryReadsBeforeLoad()).toBe(0);
    expect(screen.getByLabelText("Loading today's session")).toBeTruthy();
    await act(async () => {
      await loadCatalogue();
    });
    await settle();
    expect(screen.queryByLabelText("Loading today's session")).toBeNull();
  });
});

describe('the router', () => {
  it('lets Home through only on a visit the worker did not serve, once it is let in', () => {
    expect(holdsForCatalogue('/', false, true), 'a new climber waited for the catalogue').toBe(false);
    expect(holdsForCatalogue('/', false, false), 'Home was drawn before the stores said it could be').toBe(true);
    // Measured: on a warm launch, drawing Home before the catalogue drew it
    // twice and put today's card 170ms later. So it waits there.
    expect(holdsForCatalogue('/', true, true), 'a warm launch drew Home twice').toBe(true);
    expect(holdsForCatalogue('/train', false, true), 'a page that reads programs was let through').toBe(true);
  });

  it('counts a climber with no program and an empty log as having nothing to look up', () => {
    expect(nothingToLookUp(null, {})).toBe(true);
    expect(nothingToLookUp(null, { [DAY]: [] }), 'a day emptied by a delete still counted').toBe(true);
    expect(nothingToLookUp('iron_grip', {}), 'a running block was not looked up').toBe(false);
    expect(nothingToLookUp(null, { [DAY]: [session(DAY)] }), 'a logged session was not looked up').toBe(false);
  });

  it('asks the stores, and keeps Home once it has let it in', async () => {
    await aNewClimber();
    beforeTheCatalogue();
    useProfile.setState({ hydrated: false });
    useSessions.setState({ hydrated: false });
    const { result, rerender } = renderHook(({ at }) => useHoldsForCatalogue(at), { initialProps: { at: '/' } });
    expect(result.current, 'Home was let in before the stores had read the database').toBe(true);

    act(() => {
      useProfile.setState({ hydrated: true });
      useSessions.setState({ hydrated: true });
    });
    expect(result.current, 'a new climber was held for the catalogue').toBe(false);
    rerender({ at: '/train' });
    expect(result.current, 'Train was let through without the catalogue').toBe(true);
    rerender({ at: '/' });

    // A first session, logged before the catalogue lands: Home stays, and
    // the cards that read it wait instead.
    act(() => useSessions.setState({ byDate: { [DAY]: [session(DAY)] } }));
    expect(result.current, 'Home was taken away when a session was logged').toBe(false);

    act(() => useCatalogue.setState({ hydrated: true }));
    rerender({ at: '/train' });
    expect(result.current).toBe(false);
  });

  it('waits for both stores, not whichever reads first', async () => {
    // Each says "nothing" before it has read anything: an unread profile has
    // no program, an unread log no sessions. A climber between blocks with a
    // year logged, whose profile lands first, would be let in on the
    // profile's word alone.
    await aNewClimber();
    beforeTheCatalogue();
    useProfile.setState({ hydrated: true });
    useSessions.setState({ hydrated: false });
    const profileOnly = renderHook(() => useHoldsForCatalogue('/'));
    expect(profileOnly.result.current, 'Home was let in before the log was read').toBe(true);
    profileOnly.unmount();

    useProfile.setState({ hydrated: false });
    useSessions.setState({ hydrated: true });
    const logOnly = renderHook(() => useHoldsForCatalogue('/'));
    expect(logOnly.result.current, 'Home was let in before the profile was read').toBe(true);
    act(() => useProfile.setState({ hydrated: true }));
    expect(logOnly.result.current).toBe(false);
  });

  it('holds Home for a climber with a log until the catalogue is in', async () => {
    await aClimberMidBlock();
    beforeTheCatalogue();
    const { result } = renderHook(() => useHoldsForCatalogue('/'));
    expect(result.current, 'a climber with a log was let in before the catalogue').toBe(true);
    act(() => useCatalogue.setState({ hydrated: true }));
    expect(result.current).toBe(false);
  });

  it('is what App asks', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toContain('const holds = useHoldsForCatalogue(location);');
    expect(app).toContain('{holds ? (');
  });

  /**
   * Last in the file: a fresh module graph is the only way to read the
   * constant again, and every import after this one would get it.
   */
  it('knows a page the worker served from one the network did', async () => {
    const served = async (controller: object | null | undefined) => {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: controller === undefined ? undefined : { controller },
        configurable: true,
      });
      vi.resetModules();
      try {
        return (await import('@/store/contentLoaded')).SERVED_BY_WORKER;
      } finally {
        Reflect.deleteProperty(navigator, 'serviceWorker');
      }
    };
    expect(await served({}), 'a controlled page was read as a first visit').toBe(true);
    expect(await served(null), 'an uncontrolled page was read as served').toBe(false);
    expect(await served(undefined), 'a browser with no workers was read as served').toBe(false);
  });
});
