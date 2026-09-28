// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { act, renderHook, screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useAway } from '@/store/away';
import { useMetrics } from '@/store/metrics';
import { useObjectives } from '@/store/objectives';
import { useProfile } from '@/store/profile';
import { useCustomPrograms } from '@/store/programs';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { CoachPage } from './CoachPage';
import { HomeCoachCard } from './HomeCoachCard';
import { useTips } from './useTips';

/**
 * The coach waits for the log (PLAN.md M349).
 *
 * At launch the stores hydrate one by one, and `useTips` ran the whole
 * coach on whatever had landed so far. Measured on warm launches of the
 * sample climber: six to eleven computations each, and in two launches of
 * eight the first of them, on an empty log, put *"Nothing logged yet"* on
 * Home in front of a year of sessions for half a second. The Coach page,
 * opened cold, said every rule had looked at the log and found nothing.
 */

const buildTipsCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/engine/coach', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/coach')>();
  return {
    ...actual,
    buildTips: (...args: Parameters<typeof actual.buildTips>) => {
      buildTipsCalls.n += 1;
      return actual.buildTips(...args);
    },
  };
});

const DAY = today();

/** A fortnight of logged sessions, loaded the way boot loads them. */
async function aClimberWithALog(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (const d of [13, 11, 9, 6, 4, 2]) {
    const date = addDays(DAY, -d);
    await putSession({
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
      climbs: [{ id: `a${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' }],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session);
  }
  await hydrate();
  useProfile.setState({ injuries: [], dismissedTips: {}, dismissedCards: [] });
}

/** Every store `useTips` reads, and how to put each back to before it loaded. */
const STORES = {
  sessions: useSessions,
  projects: useProjects,
  metrics: useMetrics,
  profile: useProfile,
  objectives: useObjectives,
  away: useAway,
  settings: useSettings,
  customPrograms: useCustomPrograms,
} as const;

type StoreName = keyof typeof STORES;
const unload = (name: StoreName) =>
  (STORES[name] as unknown as { setState: (s: { hydrated: boolean }) => void }).setState({ hydrated: false });
const load = (name: StoreName) =>
  (STORES[name] as unknown as { setState: (s: { hydrated: boolean }) => void }).setState({ hydrated: true });

const body = () => document.body.textContent ?? '';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('before the log has loaded', () => {
  it('Home says nothing, rather than "Nothing logged yet" to a climber with a log', async () => {
    await aClimberWithALog();
    const byDate = useSessions.getState().byDate;
    // The moment M349 measured: the card mounted, the sessions not yet read.
    act(() => useSessions.setState({ hydrated: false, byDate: {} }));
    // The card itself rather than Home's lazy wrapper around it, so what it
    // draws before the log arrives is on the page now and not a guess about
    // how long a chunk takes (PLAN.md M304).
    renderAt('/', <HomeCoachCard />);
    expect(body()).not.toContain('Nothing logged yet');
    expect(body()).not.toContain("Coach's Corner");

    act(() => useSessions.setState({ hydrated: true, byDate }));
    expect(await screen.findByText("Coach's Corner")).toBeTruthy();
    expect(body()).not.toContain('Nothing logged yet');
  });

  it('the Coach page shows it is loading, and not that every rule found nothing', async () => {
    await aClimberWithALog();
    act(() => unload('sessions'));
    renderAt('/coach', <CoachPage />);
    expect(screen.getByLabelText("Loading Coach's Corner")).toBeTruthy();
    expect(body()).not.toContain('Nothing to flag');

    act(() => load('sessions'));
    expect(await screen.findByText(/Standing observations/)).toBeTruthy();
  });
});

describe('every store the rules read', () => {
  for (const name of Object.keys(STORES) as StoreName[]) {
    it(`waits for ${name}`, async () => {
      await aClimberWithALog();
      act(() => unload(name));
      buildTipsCalls.n = 0;
      const { result } = renderHook(() => useTips());
      expect(result.current.ready).toBe(false);
      expect(result.current.visible).toEqual([]);
      expect(buildTipsCalls.n, 'the rules ran before the store they read had loaded').toBe(0);

      act(() => load(name));
      expect(result.current.ready).toBe(true);
      expect(buildTipsCalls.n).toBe(1);
    });
  }
});

describe('a launch', () => {
  it('runs the coach once, when the last store lands, rather than once per store', async () => {
    await aClimberWithALog();
    const byDate = useSessions.getState().byDate;
    const blocks = useProfile.getState().blocks;
    // Everything unloaded and the log empty: the state at mount.
    act(() => {
      for (const name of Object.keys(STORES) as StoreName[]) unload(name);
      useSessions.setState({ byDate: {} });
    });
    buildTipsCalls.n = 0;
    const { result } = renderHook(() => useTips());

    // Each store landing in its own task, as thirteen parallel reads do.
    act(() => useSettings.setState({ hydrated: true }));
    act(() => useProfile.setState({ hydrated: true, blocks: [...blocks] }));
    act(() => useSessions.setState({ hydrated: true, byDate }));
    act(() => useMetrics.setState({ hydrated: true }));
    act(() => useCustomPrograms.setState({ hydrated: true }));
    act(() => useObjectives.setState({ hydrated: true }));
    act(() => useAway.setState({ hydrated: true }));
    expect(buildTipsCalls.n, 'computed on a partly loaded log').toBe(0);
    act(() => useProjects.setState({ hydrated: true }));

    expect(result.current.ready).toBe(true);
    expect(buildTipsCalls.n).toBe(1);
    expect(result.current.visible.length).toBeGreaterThan(0);
  });
});
