// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { act, renderHook, screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useGame } from '@/store/game';
import { useLoaded } from '@/store/loaded';
import { useProfile } from '@/store/profile';
import { useCustomPrograms } from '@/store/programs';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { BoardCard, BoardPage } from '@/features/challenges/BoardPage';
import { DailyTaskCard } from '@/features/challenges/DailyTaskCard';
import { HomePage } from './HomePage';

/**
 * Home says nothing about the log before the log has loaded (PLAN.md M351).
 *
 * Measured in the browser first: on six warm launches of six, the sample
 * climber — a block running, a year of sessions — was told *"Nothing planned
 * — no program is running"*, *"Moved from another phone?"* and *"Pick a
 * program"* for up to 0.7s each, and on one warm launch in seven the daily
 * task was tier zero's *"Rate the effort"* before it became the climber's
 * own. Each test here puts one store back into the state it is in at
 * launch — not yet read, its data empty — and asks what Home draws.
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
    climbs: [{ id: `c${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' }],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
  }) as Session;

/** A climber with a log, today's session in it, and a block running. */
async function aClimberMidBlock(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (const d of [9, 6, 3, 0]) await putSession(session(addDays(DAY, -d)));
  await hydrate();
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: addDays(DAY, -10) },
    dismissedCards: [],
    injuries: [],
  });
}

/** The state a store is in at launch: not yet read, nothing in it. */
function unloadProfile(): void {
  act(() => useProfile.setState({ hydrated: false, activeProgramId: null, startDates: {} }));
}
function unloadLog(): void {
  act(() => useSessions.setState({ hydrated: false, byDate: {} }));
}

const body = () => document.body.textContent ?? '';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("today's card", () => {
  it('says it is loading, not that no program is running, before the profile is in', async () => {
    await aClimberMidBlock();
    const loaded = { ...useProfile.getState() };
    unloadProfile();
    renderAt('/', <HomePage />);
    expect(screen.getByLabelText("Loading today's session")).toBeTruthy();
    expect(body()).not.toContain('no program is running');

    act(() => useProfile.setState({ ...loaded, hydrated: true }));
    expect(screen.queryByLabelText("Loading today's session")).toBeNull();
    expect(body()).not.toContain('no program is running');
  });

  it('says it is loading, not that there is nothing logged today, before the log is in', async () => {
    await aClimberMidBlock();
    const byDate = useSessions.getState().byDate;
    unloadLog();
    renderAt('/', <HomePage />);
    expect(screen.getByLabelText("Loading today's session")).toBeTruthy();
    expect(body()).not.toContain('Session logged');

    act(() => useSessions.setState({ hydrated: true, byDate }));
    // One line with the count after it: *"Session logged · 3 climbs, 3 sent."*
    expect(await screen.findByText(/Session logged/)).toBeTruthy();
  });

  it("waits for the climber's own programs, which the running block may be one of", async () => {
    await aClimberMidBlock();
    act(() => useCustomPrograms.setState({ hydrated: false }));
    renderAt('/', <HomePage />);
    expect(screen.getByLabelText("Loading today's session")).toBeTruthy();
    act(() => useCustomPrograms.setState({ hydrated: true }));
    expect(screen.queryByLabelText("Loading today's session")).toBeNull();
  });
});

describe('the first-run cards', () => {
  it('are not offered to a climber whose log has not been read yet', async () => {
    await aClimberMidBlock();
    const byDate = useSessions.getState().byDate;
    unloadLog();
    renderAt('/', <HomePage />);
    expect(body()).not.toContain('Moved from another phone?');

    act(() => useSessions.setState({ hydrated: true, byDate }));
    expect(body()).not.toContain('Moved from another phone?');
  });

  it('are still offered to a climber whose log is genuinely empty, once it has been read', async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    await loadPrograms();
    await hydrate();
    useProfile.setState({ dismissedCards: [] });
    unloadLog();
    renderAt('/', <HomePage />);
    expect(body()).not.toContain('Moved from another phone?');

    act(() => useSessions.setState({ hydrated: true, byDate: {} }));
    expect(await screen.findByText('Moved from another phone?')).toBeTruthy();
  });
});

describe('the daily task', () => {
  it('holds its place, and names no task, before the log is in', async () => {
    await aClimberMidBlock();
    const byDate = useSessions.getState().byDate;
    unloadLog();
    renderAt('/', <DailyTaskCard />);
    expect(screen.getByLabelText("Loading today's task")).toBeTruthy();
    expect(body()).not.toContain('Today’s task');

    act(() => useSessions.setState({ hydrated: true, byDate }));
    expect(await screen.findByText('Today’s task')).toBeTruthy();
  });

  it('waits for the settings it is written in, and the profile its program comes from', async () => {
    await aClimberMidBlock();
    act(() => useSettings.setState({ hydrated: false }));
    renderAt('/', <DailyTaskCard />);
    expect(screen.getByLabelText("Loading today's task")).toBeTruthy();
    act(() => useSettings.setState({ hydrated: true }));
    expect(await screen.findByText('Today’s task')).toBeTruthy();
  });

  it('waits for the profile its program and injuries come from', async () => {
    await aClimberMidBlock();
    const loaded = { ...useProfile.getState() };
    unloadProfile();
    renderAt('/', <DailyTaskCard />);
    expect(screen.getByLabelText("Loading today's task")).toBeTruthy();
    act(() => useProfile.setState({ ...loaded, hydrated: true }));
    expect(await screen.findByText('Today’s task')).toBeTruthy();
  });

  it("waits for the climber's own programs, which the running block may be one of", async () => {
    await aClimberMidBlock();
    act(() => useCustomPrograms.setState({ hydrated: false }));
    renderAt('/', <DailyTaskCard />);
    expect(screen.getByLabelText("Loading today's task")).toBeTruthy();
    act(() => useCustomPrograms.setState({ hydrated: true }));
    expect(await screen.findByText('Today’s task')).toBeTruthy();
  });

  it('waits for the ledger that says what is claimed, and loads it itself', async () => {
    await aClimberMidBlock();
    act(() => useGame.setState({ hydrated: false }));
    renderAt('/', <DailyTaskCard />);
    expect(screen.getByLabelText("Loading today's task")).toBeTruthy();
    // No one else loads the game store on Home; the hook does.
    expect(await screen.findByText('Today’s task')).toBeTruthy();
    expect(useGame.getState().hydrated).toBe(true);
  });
});

describe('the board page', () => {
  it('shows it is loading rather than an empty board', async () => {
    await aClimberMidBlock();
    unloadLog();
    renderAt('/board', <BoardPage />);
    expect(screen.getByLabelText('Loading Board')).toBeTruthy();
  });
});

describe("the Game tab's board card", () => {
  it('holds its place rather than counting an empty board', async () => {
    await aClimberMidBlock();
    const byDate = useSessions.getState().byDate;
    unloadLog();
    renderAt('/game', <BoardCard />);
    expect(screen.getByLabelText('Loading the board')).toBeTruthy();
    expect(body()).not.toMatch(/ready to claim|done/);

    act(() => useSessions.setState({ hydrated: true, byDate }));
    expect(screen.queryByLabelText('Loading the board')).toBeNull();
  });
});

describe('useLoaded', () => {
  it('is true only once every store it was given has been read', async () => {
    await aClimberMidBlock();
    act(() => {
      useSessions.setState({ hydrated: false });
      useProfile.setState({ hydrated: false });
    });
    const { result } = renderHook(() => useLoaded(useSessions, useProfile));
    expect(result.current).toBe(false);
    act(() => useSessions.setState({ hydrated: true }));
    expect(result.current).toBe(false);
    act(() => useProfile.setState({ hydrated: true }));
    expect(result.current).toBe(true);
  });

  it('is false while any one of them is still loading, whichever it is', async () => {
    // The last store alone would pass the case above; this is the other order.
    await aClimberMidBlock();
    act(() => useSessions.setState({ hydrated: false }));
    const { result } = renderHook(() => useLoaded(useSessions, useProfile));
    expect(result.current).toBe(false);
    act(() => useSessions.setState({ hydrated: true }));
    expect(result.current).toBe(true);
  });

  it('asks nothing of a store it was not given', async () => {
    await aClimberMidBlock();
    act(() => useSettings.setState({ hydrated: false }));
    const { result } = renderHook(() => useLoaded(useSessions, useProfile));
    expect(result.current).toBe(true);
  });
});
