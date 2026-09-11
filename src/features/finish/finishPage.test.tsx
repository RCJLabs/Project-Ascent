// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { newSession, putSession } from '@/db/sessions';
import { loadPrograms } from '@/content/programs';
import { IRON_GRIP } from '@/content/programs/catalogue';
import { addDays, daysBetween, startOfWeek, today } from '@/engine/dates';
import { blockWindow } from '@/engine/plan';
import { planFromLayout } from '@/engine/scheduler';
import { useProfile } from '@/store/profile';
import type { BlockRecord } from '@/engine/blocks';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinishPage } from './FinishPage';
import { HomePage } from '@/features/home/HomePage';

/**
 * The end of a block reaches the climber (PLAN.md M85).
 *
 * `engine/blockEnd.test.ts` proves the content. These prove it is reachable
 * from where a climber actually is — which was the whole problem: the
 * graduation line and the authored next programs existed, on a page nobody
 * visits mid-block.
 */

/**
 * A start date whose block has already finished, and how long ago.
 *
 * Computed rather than searched: the window's last day is always a
 * Saturday, because `blockWindow` snaps the start to its Sunday, so a loop
 * hunting for an exact "ended N days ago" never terminates for most N. A
 * first draft did exactly that and hung the suite.
 */
function endedBlock(weeksAgo: number): { start: string; daysSince: number } {
  const start = addDays(startOfWeek(today()), -(IRON_GRIP.weeks + weeksAgo) * 7);
  return { start, daysSince: daysBetween(blockWindow(IRON_GRIP, start).to, today()) };
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  reset();
  await loadPrograms();
});

function running(start: string) {
  // The plan too: Home reads `plannedDay` only when it has one, so without
  // it the page falls through to "no program is running" for a reason that
  // has nothing to do with the block being over.
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: start },
    plans: { iron_grip: planFromLayout(IRON_GRIP.recommendedLayout!) },
  });
}

describe('the finish page', () => {
  it('says there is nothing to review with no program', async () => {
    await hydrate();
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText(/No program has been run yet/)).toBeTruthy();
  });

  it('shows the block while it is still running', async () => {
    await hydrate();
    running(addDays(today(), -14));
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText(/Runs to/)).toBeTruthy();
  });

  it('says how long ago it ran out', async () => {
    await hydrate();
    const { start, daysSince } = endedBlock(1);
    running(start);
    renderAt('/finish', <FinishPage />);
    expect(daysSince).toBeGreaterThan(0);
    expect(screen.getByText(/ran out .* ago/)).toBeTruthy();
  });

  it('carries the graduation line the catalogue page had', async () => {
    await hydrate();
    running(endedBlock(1).start);
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText(IRON_GRIP.intro.graduation)).toBeTruthy();
  });

  it('carries every authored next program with its reason', async () => {
    await hydrate();
    running(endedBlock(1).start);
    renderAt('/finish', <FinishPage />);
    for (const step of IRON_GRIP.nextPrograms) {
      expect(screen.getByText(step.reason)).toBeTruthy();
    }
  });

  it('names a retest owed and links it to the assessments page', async () => {
    const { start } = endedBlock(1);
    await putMetricEntry({ metricId: 'dead_hang', date: addDays(start, 3), value: 40 });
    await hydrate();
    running(start);
    renderAt('/finish', <FinishPage />);
    // Scoped to the card: the block report above lists every assessment by
    // name too, which is what a bare getByText found first.
    const card = screen.getByText('The retest you owe').closest('section, div')!;
    const link = [...card.querySelectorAll('a')].find((a) => a.textContent?.includes('Dead Hang'));
    expect(link?.getAttribute('href')).toContain('/assessments');
    expect(link?.textContent).toContain('Baseline 40 sec');
  });

  it('shows no retest card when nothing has a lonely baseline', async () => {
    await hydrate();
    running(endedBlock(1).start);
    renderAt('/finish', <FinishPage />);
    expect(screen.queryByText(/retest you owe|retests you owe/)).toBeNull();
  });
});

describe('home, once the block has run out', () => {
  it('stops saying it is week twelve and offers the review', async () => {
    await hydrate();
    running(endedBlock(4).start);
    renderAt('/', <HomePage />);
    expect(screen.queryByText(/Week 12 of 12/)).toBeNull();
    expect(screen.queryByText(/Test week/)).toBeNull();
    expect(screen.getByText(/has run its course/)).toBeTruthy();
    const link = screen.getByText(/what the block moved/i).closest('a');
    expect(link?.getAttribute('href')).toContain('/finish');
  });

  it('stops offering to log a rest day for a block that ended', async () => {
    // `over` sets `isRest`, so the button read "Log rest day" three weeks
    // after the block ran out.
    await hydrate();
    running(endedBlock(4).start);
    renderAt('/', <HomePage />);
    expect(screen.queryByText('Log rest day')).toBeNull();
    expect(screen.getByText('Log a session')).toBeTruthy();
  });

  it('does not claim no program is running when one is', async () => {
    await hydrate();
    running(endedBlock(4).start);
    renderAt('/', <HomePage />);
    expect(screen.queryByText(/no program is running/)).toBeNull();
  });

  it('leaves a running block alone', async () => {
    await hydrate();
    running(addDays(today(), -14));
    renderAt('/', <HomePage />);
    expect(screen.queryByText(/has run its course/)).toBeNull();
  });
});

/**
 * A past block is reachable (PLAN.md M87).
 *
 * The whole point of keeping a history: before this, the block you
 * finished last week became invisible the moment you started the next one,
 * because every screen read `activeProgramId`.
 */
describe('the blocks you have run', () => {
  const row = (patch: Partial<BlockRecord>): BlockRecord => ({
    id: 'iron_grip#2026-01-04',
    programId: 'iron_grip',
    name: 'Iron Grip',
    startDate: '2026-01-04',
    weeks: 12,
    endedAt: '2026-03-28',
    ...patch,
  });

  function withHistory(blocks: BlockRecord[], active: string | null = null) {
    useProfile.setState({
      activeProgramId: active,
      startDates: {},
      plans: {},
      blocks,
    });
  }

  it('shows no list with only one block', async () => {
    await hydrate();
    withHistory([row({})]);
    renderAt('/finish', <FinishPage />);
    expect(screen.queryByText('Blocks you have run')).toBeNull();
  });

  it('lists them newest first once there is more than one', async () => {
    await hydrate();
    withHistory([
      row({}),
      row({ id: `peak_performance#${today()}`, programId: 'peak_performance', name: 'Peak Performance', startDate: today(), endedAt: null }),
    ]);
    renderAt('/finish', <FinishPage />);
    const names = [...screen.getByText('Blocks you have run').closest('section, div')!.querySelectorAll('a')].map(
      (a) => a.textContent,
    );
    expect(names[0]).toContain('Peak Performance');
    expect(names[1]).toContain('Iron Grip');
  });

  it('opens the block the url names rather than the newest', async () => {
    await hydrate();
    withHistory([
      row({}),
      row({ id: `peak_performance#${today()}`, programId: 'peak_performance', name: 'Peak Performance', startDate: today(), endedAt: null }),
    ]);
    renderAt('/finish/iron_grip%232026-01-04', <FinishPage params={{ id: 'iron_grip%232026-01-04' }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Iron Grip');
  });

  it('says what became of each one', async () => {
    // The open block starts this week, so it is genuinely inside its
    // weeks — a fixture dated in the past reads as completed now, which is
    // the fix: an open row whose window has expired is not running.
    await hydrate();
    withHistory([
      row({ endedAt: '2026-02-01' }),
      row({ id: `peak_performance#${today()}`, programId: 'peak_performance', name: 'Peak Performance', startDate: today(), endedAt: null }),
    ]);
    renderAt('/finish', <FinishPage />);
    const list = screen.getByText('Blocks you have run').closest('section, div')!;
    expect(list.textContent).toContain('left early');
    expect(list.textContent).toContain('running');
  });

  it('does not claim to know how a reconstructed block ended', async () => {
    await hydrate();
    withHistory([
      row({ reconstructed: true }),
      row({ id: `peak_performance#${today()}`, programId: 'peak_performance', name: 'Peak Performance', startDate: today(), endedAt: null }),
    ]);
    renderAt('/finish', <FinishPage />);
    const list = screen.getByText('Blocks you have run').closest('section, div')!;
    expect(list.textContent).toContain('no record of how it ended');
    expect(list.textContent).not.toContain('ran to the end');
  });

  it('answers a url naming a block it does not have as a missing record', async () => {
    // Quietly showing a different block than the one asked for is the
    // worse failure, and every other `:id` route in the app says so.
    await hydrate();
    withHistory([row({})]);
    renderAt('/finish/gone%23nope', <FinishPage params={{ id: 'gone%23nope' }} />);
    expect(screen.getByText(/That block/)).toBeTruthy();
    expect(screen.queryByText('Iron Grip')).toBeNull();
  });

  it('says so when the block ran a program the app no longer has', async () => {
    await hydrate();
    withHistory([row({ id: 'deleted#2026-01-04', programId: 'deleted', name: 'A Fork I Deleted' })]);
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText(/no longer has the program itself/)).toBeTruthy();
  });
});

describe('an open block whose weeks have run out', () => {
  it('is not still described as running', async () => {
    // Found in a browser: "Week 12 of 12 · running" against a block that
    // had ended four weeks earlier. Nothing closes a row when its window
    // expires — it stays open until the climber starts something else.
    await hydrate();
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: {},
      plans: {},
      blocks: [
        { id: 'iron_grip#2026-01-04', programId: 'iron_grip', name: 'Iron Grip', startDate: '2026-01-04', weeks: 12, endedAt: null },
        { id: 'base_camp#2025-06-01', programId: 'base_camp', name: 'Base Camp', startDate: '2025-06-01', weeks: 12, endedAt: '2025-08-23' },
      ],
    });
    renderAt('/finish', <FinishPage />);
    const list = screen.getByText('Blocks you have run').closest('section, div')!;
    expect(list.textContent).not.toContain('running');
    expect(list.textContent).toContain('ran to the end');
  });
});


/**
 * Which of the sessions the plan placed actually happened (PLAN.md M91).
 *
 * The engine's arithmetic is in engine/adherence.test.ts. These are about
 * the two things that make it a report rather than a number: it reaches the
 * page the block is reviewed on, and it says when it is scoring a block
 * against a layout that block never ran.
 */
describe('did you do the work', () => {
  const MONDAY = 1;

  /** A completed session of `typeId` in the given week of the block. */
  async function logged(start: string, week: number, typeId: string, index = 0): Promise<void> {
    const date = addDays(blockWindow(IRON_GRIP, start).from, (week - 1) * 7 + MONDAY);
    await putSession({
      ...newSession(date, index, { completed: true }),
      programId: 'iron_grip',
      sessionTypeId: typeId,
    } as never);
  }

  it('counts the placements against what was logged', async () => {
    const { start } = endedBlock(1);
    await logged(start, 1, 'fp');
    await hydrate();
    running(start);
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText('Did you do the work?')).toBeTruthy();
    // Iron Grip's own layout, twelve weeks, and one session logged.
    expect(screen.getByText(/of \d+ Finger Protocol/)).toBeTruthy();
  });

  it('breaks it down by the session type the plan placed', async () => {
    const { start } = endedBlock(1);
    await hydrate();
    running(start);
    renderAt('/finish', <FinishPage />);
    const row = screen.getByText('Finger Protocol + Engine').closest('div')!;
    // Iron Grip's own layout places it twice a week, so twelve weeks is
    // twenty-four sessions, not twelve.
    expect(row.textContent).toMatch(/0 of 24/);
  });

  /**
   * A block recorded before M91 has no layout of its own, and scoring it
   * against today's is a guess. Saying which was used is the difference
   * between a measurement and a claim.
   */
  it('says when it is using today’s layout rather than the block’s', async () => {
    const { start } = endedBlock(1);
    await hydrate();
    running(start);
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText(/this block ran before the app kept the one it started with/)).toBeTruthy();
  });

  /**
   * Deliberately a *different* layout from the live one: a block whose
   * snapshot matches today's plan cannot tell you which of the two was
   * read.
   */
  it('scores a block against its own layout, not today’s', async () => {
    const { start } = endedBlock(1);
    await hydrate();
    running(start); // Iron Grip's own layout: two Finger Protocols a week.
    const row: BlockRecord = {
      id: `iron_grip#${start}`,
      programId: 'iron_grip',
      name: IRON_GRIP.name,
      startDate: start,
      weeks: IRON_GRIP.weeks,
      plan: { 1: 'fp' }, // One a week, so twelve rather than twenty-four.
      endedAt: null,
    };
    useProfile.setState({ blocks: [row] });
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText('Did you do the work?')).toBeTruthy();
    const fp = screen.getByText('Finger Protocol + Engine').closest('div')!;
    expect(fp.textContent).toMatch(/0 of 12/);
    expect(screen.queryByText(/before the app kept the one it started with/)).toBeNull();
  });

  // A session of a type the plan never placed is extra, not a row in a
  // breakdown of what the plan asked for.
  it('leaves a type the plan never placed out of the breakdown', async () => {
    const { start } = endedBlock(1);
    await logged(start, 1, 'perf');
    await hydrate();
    running(start);
    useProfile.setState({
      blocks: [
        {
          id: `iron_grip#${start}`,
          programId: 'iron_grip',
          name: IRON_GRIP.name,
          startDate: start,
          weeks: IRON_GRIP.weeks,
          plan: { 1: 'fp' },
          endedAt: null,
        },
      ],
    });
    renderAt('/finish', <FinishPage />);
    expect(screen.getByText('Finger Protocol + Engine')).toBeTruthy();
    expect(screen.queryByText('Climbing Session')).toBeNull();
  });

  it('says nothing at all when no plan placed anything', async () => {
    const { start } = endedBlock(1);
    await hydrate();
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: start },
      plans: { iron_grip: {} },
    });
    renderAt('/finish', <FinishPage />);
    expect(screen.queryByText('Did you do the work?')).toBeNull();
  });
});
