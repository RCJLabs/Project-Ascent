// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';

/**
 * One derivation per page, not one per consumer (PLAN.md M157).
 *
 * The claim is about React, so only rendering settles it. The module is
 * wrapped rather than counted from inside, so nothing ships to make this
 * measurable: every call is recorded, and what is checked is how many
 * *distinct* results came back. Fourteen calls returning one object is one
 * derivation; fourteen objects is fourteen.
 *
 * This is the check M18 wrote for `useXp` and could not have passed. Its
 * cache was real and its number — "nine callers cost one derivation" — was
 * measured by calling `deriveXp` in a loop with one array. `useMemo` is
 * per-component-instance, so nine *components* each built their own
 * flattened array and each missed the cache. A probe rendering two `useXp()`
 * components got two different `XpState` objects back.
 */

const calls: unknown[] = [];
vi.mock('@/engine/derive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/derive')>();
  return {
    ...actual,
    deriveClimberState: (...args: Parameters<typeof actual.deriveClimberState>) => {
      const result = actual.deriveClimberState(...args);
      calls.push(result);
      return result;
    },
  };
});

const { resetDbForTests } = await import('@/db/db');
const { loadPrograms } = await import('@/content/programs');
const { newSession, putSession } = await import('@/db/sessions');
const { addDays, today } = await import('@/engine/dates');
const { hydrate, renderAt, reset } = await import('@/test/render');
const { clearClimberStateCache } = await import('@/engine/derive');
const { ProgressPage } = await import('@/features/progress/ProgressPage');
const { useSettings } = await import('@/store/settings');
const { BodyPage } = await import('@/features/body/BodyPage');
const { useProfile } = await import('@/store/profile');
const { HomePage } = await import('@/features/home/HomePage');
const { GamePage } = await import('@/features/game/GamePage');

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (let i = 0; i < 10; i += 1) {
    await putSession({
      ...newSession(addDays(today(), -i * 2), 0),
      completed: true,
      rpe: 6,
      durationMin: 75,
      climbs: [{ id: `c${i}`, grade: 'V4', scale: 'V', count: 3, result: 'send' }],
    });
  }
  await hydrate();
  /**
   * A block on record, because without one this test cannot see the thing
   * it now guards (PLAN.md M306).
   *
   * `deloadDatesFor([])` returns the same empty set `deriveClimberState`
   * resolves an omitted option to — by design, so a climber with no block
   * costs nothing — which means a call site that forgot `deloadDates` keys
   * *identically* to one that passed it. Measured: three mutants unwiring a
   * call site all survived this file. A block with deload weeks in it is
   * what makes the two keys differ, and the guard real.
   */
  useProfile.setState({
    blocks: [
      {
        id: `iron_grip#${addDays(today(), -21)}`,
        programId: 'iron_grip',
        name: 'Iron Grip',
        startDate: addDays(today(), -21),
        weeks: 12,
        endedAt: null,
      },
    ],
  });
  clearClimberStateCache();
  calls.length = 0;
});

/** How many different answers came back, regardless of how often it was asked. */
const derivations = () => new Set(calls).size;

describe('a page pays for one derivation', () => {
  it('however many of its cards ask for it', async () => {
    // "All" is the whole page, so every card that reads the log is mounted —
    // the worst case and the one worth measuring.
    useSettings.setState({ progressView: 'all' });
    renderAt('/progress', <ProgressPage />);
    await screen.findByText(/sessions logged/);
    // Four asks on the whole page — the week's state with the program's
    // weekly target, the career card, the body card, and the skills store
    // behind it. Four before this milestone meant four walks of the log.
    expect(calls.length, 'the page stopped asking').toBeGreaterThanOrEqual(4);
    expect(derivations(), `${calls.length} calls`).toBe(1);
  });

  /**
   * Two more pages, added at M306, because that milestone gave every call
   * site a `deloadDates` set the cache keys on **by identity**. One left
   * unwired is not a wrong number anywhere obvious — it is two derivations
   * of one log on a page a climber opens daily, which is the thing this file
   * was written to notice.
   *
   * The front door, where the coach reads the log; and the game, which is
   * the only page that mounts `useClimberAvatar` ungated and so the only one
   * where leaving *that* caller unwired is visible at all.
   */
  it('including the front door', async () => {
    renderAt('/', <HomePage />);
    await screen.findByText("Coach's Corner");
    expect(calls.length, 'the page stopped asking').toBeGreaterThanOrEqual(2);
    expect(derivations(), `${calls.length} calls`).toBe(1);
  });

  it('and the game, where the avatar asks for itself', async () => {
    renderAt('/game', <GamePage />);
    await screen.findByText('Ranks');
    expect(calls.length, 'the page stopped asking').toBeGreaterThanOrEqual(2);
    expect(derivations(), `${calls.length} calls`).toBe(1);
  });

  it('and so does the one that reads the body', async () => {
    renderAt('/body', <BodyPage />);
    await screen.findByText('Your body');
    expect(calls.length, 'the page stopped asking').toBeGreaterThanOrEqual(2);
    expect(derivations(), `${calls.length} calls`).toBe(1);
  });

  /**
   * The mutation that matters: put the flattening back at a call site and
   * this is the test that notices. Without it, every assertion above passes
   * on a cache that never hits, because one *call* is also one distinct
   * result.
   */
  it('would notice a caller that flattens for itself', async () => {
    const { allSessions, useSessions } = await import('@/store/sessions');
    const { deriveClimberState } = await import('@/engine/derive');
    const byDate = useSessions.getState().byDate;
    clearClimberStateCache();
    calls.length = 0;
    deriveClimberState(allSessions(byDate));
    deriveClimberState(Object.values(byDate).flat());
    expect(calls.length).toBe(2);
    expect(derivations()).toBe(2);
  });
});
