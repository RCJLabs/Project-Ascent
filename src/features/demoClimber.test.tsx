// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { canLoadDemo, demoObjectives, loadDemo } from '@/db/demo';
import { daysBetween, today } from '@/engine/dates';
import { getSession, newSession, putSession } from '@/db/sessions';
import { deriveClimberState } from '@/engine/derive';
import { lastBlockFor } from '@/engine/finderHistory';
import { measure } from '@/engine/skills';
import { allSessions } from '@/store/sessions';
import { useObjectives } from '@/store/objectives';
import { useProfile } from '@/store/profile';
import { useMetrics } from '@/store/metrics';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { DemoBanner } from '@/ui/DemoBanner';
import { ObjectivesPage } from '@/features/objectives/ObjectivesPage';

/**
 * A climber who does not exist, on screen (PLAN.md M110).
 *
 * The stated risk is sample data mistaken for a real log, so most of what
 * is here is about the gates and the way out rather than the data.
 */

async function settings() {
  renderAt('/settings', <SettingsPage />);
  await screen.findByText('Your data');
}

/**
 * An empty database, waited for rather than assumed.
 *
 * The profile store saves with `void save(...)` and the demo load is driven
 * from a click, so a plain `reset()` can clear the stores while the previous
 * test's writes are still in flight — they then land *after* the clear and
 * the next test opens on a log that is not empty. Waiting on the gate the
 * feature itself uses is the check that matters.
 */
async function emptied() {
  // Cleared until it stays cleared. The stores persist with fire-and-forget
  // writes, so a `reset()` can run *between* a previous test's save being
  // issued and it landing — measured here as exactly one project surviving
  // the clear. Retrying until the feature's own gate agrees is the check
  // that matters, and it is the gate this file is about.
  await waitFor(async () => {
    await reset();
    expect(await canLoadDemo()).toBe(true);
  });
  await hydrate();
}

describe('the offer', () => {
  it('is made on an empty log', async () => {
    await emptied();
    await settings();
    expect(await screen.findByText('Load a sample climber')).toBeTruthy();
  });

  // The same gate the backup import uses before it takes a restore point.
  it('is not made once there is anything real', async () => {
    await reset();
    await putSession(newSession('2026-01-01', 0, { completed: true }) as never);
    await hydrate();
    await settings();
    await waitFor(() => expect(screen.queryByText('Load a sample climber')).toBeNull());
    expect(screen.queryByText('Sample data')).toBeNull();
  });
});

describe('loading and clearing it', () => {
  it('fills the log and starts the program', async () => {
    await emptied();
    await settings();
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy());
    expect(Object.keys(useSessions.getState().byDate).length).toBeGreaterThan(50);
    expect(useProfile.getState().activeProgramId).toBe('iron_grip');
    expect(useProfile.getState().injuries).toHaveLength(1);
    // Backdated, so the block is six weeks in rather than on day one —
    // which is the difference between a Train page with something on it
    // and an empty one.
    const started = useProfile.getState().startDates['iron_grip']!;
    expect(started < today()).toBe(true);
    expect(daysBetween(started, today())).toBeGreaterThan(21);
  });

  it('offers the way out once it is loaded, and not the way in', async () => {
    await emptied();
    await settings();
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText('Clear the sample data')).toBeTruthy());
    expect(screen.queryByText('Load a sample climber')).toBeNull();
  });

  /**
   * The stated risk, held as a test: a climber who loads the sample data,
   * likes it, logs a real session and then clears keeps that session.
   */
  it('leaves what the climber logged themselves', async () => {
    await emptied();
    await settings();
    // Loaded through the button, so the program and the injury are really
    // there to be cleared. Calling `loadDemo` directly leaves the profile
    // untouched, which made the assertions below pass over nothing.
    //
    // Waited on the *message*, not on `activeProgramId` (PLAN.md M207).
    // `startProgram` sets that field synchronously, several awaits before
    // `startDemo` returns — so waiting on it resumed the test mid-load, and
    // the Clear button it then clicked was still `disabled`. The click went
    // nowhere and the failure read as "the cleared message never appeared".
    // That is the flake this half was reverted over, made deterministic by
    // giving `startDemo` two more writes to get through.
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy());
    expect(useProfile.getState().activeProgramId).toBe('iron_grip');
    expect(useProfile.getState().injuries).toHaveLength(1);

    await putSession(newSession(today(), 1, { completed: true, rpe: 9 }) as never);
    await hydrate();

    fireEvent.click(await screen.findByText('Clear the sample data'));
    await waitFor(() => expect(screen.getByText(/Sample data cleared/)).toBeTruthy());
    expect(await getSession(`${today()}#1`)).toBeTruthy();
    expect(useProfile.getState().injuries).toHaveLength(0);
    expect(useProfile.getState().activeProgramId).toBeNull();
  });

  it('says how much it took out rather than claiming success over nothing', async () => {
    await emptied();
    await loadDemo();
    await hydrate();
    await settings();
    fireEvent.click(await screen.findByText('Clear the sample data'));
    await waitFor(() => expect(screen.getByText(/records\. Anything you logged yourself/)).toBeTruthy());
  });
});

/**
 * The screen the sample climber used to leave bare (PLAN.md M207).
 *
 * Settings sells that button as filling the app *"so every screen has
 * something to show"*, and Objectives was the claim it broke. This half was
 * reverted once over a flake that turned out to be M220's write race rather
 * than anything about objectives.
 */
describe('the objectives it brings', () => {
  it('fills the screen the button promised', async () => {
    await emptied();
    await settings();
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy());

    renderAt('/objectives', <ObjectivesPage />);
    expect(await screen.findByText('Brad Pit')).toBeTruthy();
    expect(screen.getByText('A week in Font')).toBeTruthy();
  });

  it('covers both shapes the page draws', async () => {
    // One inside the runway, where `peak.ts` answers the timing, and one
    // with a season, where the dates come backwards off the target. A demo
    // carrying two of the same shape would leave half the screen untested
    // by the eye it exists for.
    const [project, trip] = demoObjectives();
    expect(project!.projectId).toBe('demo-brad-pit');
    expect(project!.season).toBeUndefined();
    expect(trip!.season).toEqual(['iron_grip', 'peak_performance', 'trip_prep']);
    expect(trip!.targetDate! > today()).toBe(true);
    // The blocks add up to exactly the runway. A demo that opens on the
    // season card's "four weeks more than there is room for" warning reads
    // as a broken fixture rather than as a feature.
    expect(daysBetween(today(), trip!.targetDate!)).toBe(7 * 28);
    // And no month in the name, because the date moves with `today`.
    expect(trip!.name).not.toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
  });

  it('leaves every objective unfinished', async () => {
    // A screen with no gap on it is the screenshot this climber is worst at.
    await emptied();
    await loadDemo();
    await hydrate();
    const input = {
      state: deriveClimberState(allSessions(useSessions.getState().byDate)),
      projects: useProjects.getState().projects,
      metrics: useMetrics.getState().entries,
    };
    for (const objective of demoObjectives()) {
      const done = objective.requirements.filter((r) => measure(r.requirement, input).met);
      // Most of them, not merely one: M207's battery trivialised a single
      // requirement and "not all met" stayed true, which is a claim too weak
      // to protect the screen it exists for.
      expect(done.length, objective.name).toBeLessThanOrEqual(
        Math.floor(objective.requirements.length / 2),
      );
    }
  });

  it('takes them back out when the sample data is cleared', async () => {
    await emptied();
    await settings();
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy());
    expect(useObjectives.getState().objectives).toHaveLength(2);

    fireEvent.click(await screen.findByText('Clear the sample data'));
    await waitFor(() => expect(screen.getByText(/Sample data cleared/)).toBeTruthy());
    expect(useObjectives.getState().objectives).toEqual([]);
  });

  it('leaves an objective the climber wrote themselves', async () => {
    // The wipe is by id, never by store — the same rule the records follow.
    await emptied();
    await settings();
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy());
    expect(useObjectives.getState().objectives).toHaveLength(2);
    await useObjectives.getState().save({
      id: 'mine',
      name: 'The Nose',
      kind: 'route',
      status: 'planning',
      requirements: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    fireEvent.click(await screen.findByText('Clear the sample data'));
    await waitFor(() => expect(screen.getByText(/Sample data cleared/)).toBeTruthy());
    expect(useObjectives.getState().objectives.map((o) => o.id)).toEqual(['mine']);
  });
});

describe('the banner', () => {
  it('says none of it happened', async () => {
    await emptied();
    await loadDemo();
    await hydrate();
    renderAt('/', <DemoBanner />);
    expect(await screen.findByText(/None of this happened/)).toBeTruthy();
  });

  it('is absent with nothing loaded', async () => {
    await emptied();
    renderAt('/', <DemoBanner />);
    await waitFor(() => expect(screen.queryByText(/None of this happened/)).toBeNull());
  });

  // It has to be on every page, not only the one that loaded it: the risk
  // is sample data mistaken for a real log a week later.
  it('is mounted by the shell rather than by a page', () => {
    const shell = readFileSync('src/ui/AppShell.tsx', 'utf8');
    expect(shell).toContain('<DemoBanner />');
  });

  /**
   * And being in the eager shell is exactly why it must not reach the
   * generator. Importing `hasDemo` from `db/demo.ts` pulled the RNG, the
   * year of sessions and the programs it reads into the entry chunk, and
   * cost **4.3KB of first load** to every climber who never touches sample
   * data.
   */
  it('does not drag the generator into the entry chunk', () => {
    for (const file of ['src/ui/DemoBanner.tsx', 'src/ui/AppShell.tsx']) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from '@\/db\/demo'/);
      expect(source, file).not.toMatch(/demoClimber/);
    }
    // And the module it does read knows nothing but how to count.
    const flag = readFileSync('src/db/demoFlag.ts', 'utf8');
    expect(flag).not.toMatch(/demoClimber|createRng|newSession/);
  });
});

/**
 * The block row the wipe used to leave behind (PLAN.md M281).
 *
 * Loading the sample climber starts a program, and `startProgram` records a
 * `BlockRecord` — that is its job. Clearing called `stopProgram`, which
 * **closes** that row and keeps it, because a block you abandoned is a thing
 * that happened. A block the sample climber ran is not.
 *
 * Measured in a browser before this was written:
 *
 * ```
 * after load   iron_grip#2026-08-09 ended=null
 * after clear  iron_grip#2026-08-09 ended=2026-09-18 stopped
 * ```
 *
 * The consequence is not cosmetic. `finderHistory.lastBlockFor` reads the
 * newest **ended** block and scores it against the log — and the log was
 * wiped, so it scores nought of however many the plan placed. That is the
 * number "what should I run next" is answered from.
 *
 * **And deleting the row is not the fix**, which the first attempt found:
 * `startDates` still held the entry and `reconstructBlocks` rebuilt a row
 * from it on the next hydrate. The test below went red with the block back
 * and an `endedAt` of its own last day rather than the day of the clear,
 * which is what pointed at the real cause.
 */
describe('the history after the sample climber has gone', () => {
  async function loadThenClear(): Promise<void> {
    await emptied();
    await settings();
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy());
    fireEvent.click(await screen.findByText('Clear the sample data'));
    await waitFor(() => expect(screen.getByText(/Sample data cleared/)).toBeTruthy());
  }

  it('records a block while the sample climber is loaded', async () => {
    await emptied();
    await settings();
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy());
    // The trap M195 names: a probe that cannot find a known-present instance
    // is not a probe. If nothing is written there is nothing to leave behind.
    expect(useProfile.getState().blocks).toHaveLength(1);
    expect(useProfile.getState().blocks[0]?.programId).toBe('iron_grip');
  });

  it('keeps none of it', async () => {
    await loadThenClear();
    expect(useProfile.getState().blocks).toEqual([]);
  });

  /**
   * And the reading it was feeding. A block that ended with nothing logged
   * inside it is exactly the shape the finder treats as abandoned.
   */
  it('leaves the finder nothing to answer "what next" from', async () => {
    await loadThenClear();
    expect(lastBlockFor(useProfile.getState().blocks, allSessions(useSessions.getState().byDate), today())).toBeNull();
  });

  /**
   * A block the climber started themselves is never the one removed. The id
   * is noted at load and taken at clear, rather than recomputed — and a
   * recomputed one would drift anyway, because `BlockRecord.id` is
   * `programId#startDate` and the start date moves with the day the sample
   * climber was generated.
   */
  /**
   * The half the first fix missed: with the start date still there, the
   * reconstruction migration rebuilds the row from it on the next hydrate.
   */
  it('keeps none of the program state the block was rebuilt from', async () => {
    await loadThenClear();
    const p = useProfile.getState();
    expect(p.startDates).toEqual({});
    expect(p.plans).toEqual({});
  });

  it('leaves a block the climber started themselves', async () => {
    await emptied();
    await settings();
    fireEvent.click(await screen.findByText('Load a sample climber'));
    await waitFor(() => expect(screen.getByText(/Sample data loaded/)).toBeTruthy());

    const mine = {
      id: 'base_camp#2025-01-06',
      programId: 'base_camp',
      name: 'Base Camp',
      startDate: '2025-01-06',
      weeks: 12,
      endedAt: '2025-03-31',
      reason: 'ran-out' as const,
    };
    useProfile.setState((p) => ({
      blocks: [mine, ...p.blocks],
      startDates: { ...p.startDates, base_camp: mine.startDate },
    }));

    fireEvent.click(await screen.findByText('Clear the sample data'));
    await waitFor(() => expect(screen.getByText(/Sample data cleared/)).toBeTruthy());
    const kept = useProfile.getState().blocks;
    expect(kept.map((b) => b.id)).toEqual([mine.id]);
    expect(useProfile.getState().startDates).toEqual({ base_camp: mine.startDate });
    /**
     * The row they recorded, not a stand-in rebuilt from its start date.
     *
     * A mutant that forgot **every** block survived this test at first,
     * because the `startDates` entry above let `reconstructBlocks` put a
     * base_camp row back — same id, and the assertion could not tell them
     * apart. A reconstructed row carries the flag and loses the reason,
     * which is exactly the difference: the app knows when that block began
     * and has no idea whether the climber saw it through.
     */
    expect(kept[0]?.reconstructed).toBeUndefined();
    expect(kept[0]?.reason).toBe('ran-out');
  });
});
