// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { getProgram, loadPrograms } from '@/content/programs';
import { addDays, startOfWeek, today } from '@/engine/dates';
import type { Objective } from '@/engine/objectives';
import { useObjectives } from '@/store/objectives';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';

/**
 * The season the calendar is not running yet (PLAN.md M112b).
 *
 * M109 built a season and then could not show it: the calendar draws the
 * active block and nothing else, so four blocks of intent rendered as one.
 * The rule that makes this safe is that a ghost only ever fills a day the
 * real block leaves empty — an intention never draws over a fact — and the
 * season's "Never" forbids placing a session in one either way.
 */

const TODAY = today();

const objective = (patch: Partial<Objective> = {}): Objective =>
  ({
    id: `o-${patch.targetDate ?? 'x'}-${(patch.season ?? []).join('-')}`,
    name: 'The project',
    kind: 'route',
    status: 'planning',
    requirements: [],
    createdAt: `${TODAY}T00:00:00.000Z`,
    updatedAt: `${TODAY}T00:00:00.000Z`,
    ...patch,
  }) as Objective;

/** Far enough out that the season is blocks rather than a peak runway. */
const TARGET = addDays(startOfWeek(TODAY), 7 * 30);

async function calendarWith(objectives: Objective[]): Promise<void> {
  await loadPrograms();
  await reset();
  await hydrate();
  // After `hydrate`, never before: it reloads every store from the database
  // and would discard this.
  useObjectives.setState({ objectives });
  renderAt('/calendar', <CalendarPage />);
}

const banner = () => screen.queryByText(/Shaded days are your season/);

describe('a season on the calendar', () => {
  it('says which blocks it is drawing', async () => {
    await calendarWith([objective({ targetDate: TARGET, season: ['base_camp', 'iron_grip'] })]);
    expect(banner()).toBeTruthy();
    expect(screen.getByText('Base Camp')).toBeTruthy();
    expect(screen.getByText('Iron Grip')).toBeTruthy();
  });

  it('says nothing is scheduled there', async () => {
    // The one claim that matters. A shaded day is an intention, and a
    // climber who reads it as "sessions are waiting here" would go looking
    // for them.
    await calendarWith([objective({ targetDate: TARGET, season: ['base_camp'] })]);
    expect(screen.getByText(/Nothing is scheduled there yet/)).toBeTruthy();
  });

  it('draws nothing without a season', async () => {
    await calendarWith([objective({ targetDate: TARGET })]);
    expect(banner()).toBeNull();
  });

  it('draws nothing without a target to count back from', async () => {
    // Every date in a season is derived backwards from the target.
    await calendarWith([objective({ season: ['base_camp'] })]);
    expect(banner()).toBeNull();
  });

  it('draws nothing at all when there are no objectives', async () => {
    await calendarWith([]);
    expect(banner()).toBeNull();
  });
});

describe('choosing between seasons', () => {
  it('takes the nearer target', async () => {
    await calendarWith([
      objective({ targetDate: addDays(TARGET, 120), season: ['iron_grip'] }),
      objective({ targetDate: TARGET, season: ['base_camp'] }),
    ]);
    expect(screen.getByText('Base Camp')).toBeTruthy();
    expect(screen.queryByText('Iron Grip')).toBeNull();
  });

  it('draws neither when two are tied', async () => {
    // A climber with two objectives on the same date has not decided which
    // season they are running, and picking one for them puts a season on
    // their calendar that they never chose.
    await calendarWith([
      objective({ targetDate: TARGET, season: ['base_camp'] }),
      objective({ targetDate: TARGET, season: ['iron_grip'] }),
    ]);
    expect(banner()).toBeNull();
  });

  it('ignores an objective that is no longer being trained for', async () => {
    // `activeObjectives` is planning-or-training. A sent project's season
    // is history, and a shelved one is a plan the climber put down.
    for (const status of ['sent', 'shelved'] as const) {
      await calendarWith([objective({ targetDate: TARGET, season: ['base_camp'], status })]);
      expect(banner(), `${status} still drew a season`).toBeNull();
    }
  });
});

describe('a ghost never draws over a real day', () => {
  /** Cells carrying the ghost fill. Exactly one background class each. */
  /** Blocks alternate, so a ghost is either tint. */
  const GHOST_FILLS = ['bg-accent/10', 'bg-accent/3'];
  const sunken = (view: { container: HTMLElement }) =>
    [...view.container.querySelectorAll('[class*="aspect-square"]')].filter((c) =>
      c.className.split(/\s+/).some((n) => GHOST_FILLS.includes(n)),
    ).length;

  /** A target close enough that the season covers this month. */
  const overlapping = () => {
    const weeks =
      (getProgram('base_camp')?.weeks ?? 0) + (getProgram('iron_grip')?.weeks ?? 0);
    return addDays(startOfWeek(TODAY), weeks * 7 - 1);
  };

  async function render(active: boolean) {
    await loadPrograms();
    await reset();
    await hydrate();
    useObjectives.setState({
      objectives: [objective({ targetDate: overlapping(), season: ['base_camp', 'iron_grip'] })],
    });
    if (active) {
      useProfile.setState({
        activeProgramId: 'base_camp',
        startDates: { base_camp: startOfWeek(TODAY) },
      } as never);
    }
    return renderAt('/calendar', <CalendarPage />);
  }

  it('shades this month when nothing is running', async () => {
    // Proves the comparison below is not between two zeroes — the first
    // draft of this test used a target thirty weeks out, and the season
    // never reached the visible month at all.
    expect(sunken(await render(false))).toBeGreaterThan(0);
  });

  it('gives those days back once a block is actually running', async () => {
    // The season runs on its own clock: `season()` dates blocks backwards
    // from the target and never reads the active program or its start date,
    // so the two overlap. Where they do, the fact wins and the ghost yields.
    const without = sunken(await render(false));
    const withBlock = sunken(await render(true));
    expect(withBlock).toBeLessThan(without);
  });

  it('keeps the last day of a block for that block', async () => {
    // An exclusive upper bound puts a ghost on the final day of a block the
    // climber is still running — the one day of it that most looks like it
    // has already ended.
    await loadPrograms();
    await reset();
    await hydrate();
    useObjectives.setState({
      objectives: [objective({ targetDate: overlapping(), season: ['base_camp', 'iron_grip'] })],
    });
    // Started far enough back that its final week is this one, so its last
    // day is on screen. The calendar opens on the current month, and a
    // twelve-week block started last week ends outside it.
    const program = getProgram('base_camp')!;
    const from = addDays(startOfWeek(TODAY), -(program.weeks - 1) * 7);
    useProfile.setState({
      activeProgramId: 'base_camp',
      startDates: { base_camp: from },
    } as never);

    const last = addDays(startOfWeek(from), program.weeks * 7 - 1);
    expect(last, 'the block no longer ends this week').toBe(addDays(startOfWeek(TODAY), 6));
    const view = renderAt('/calendar', <CalendarPage />);

    // Cells are links to that day's log, which is how a date is addressable
    // here without adding an attribute to production code for a test.
    const cell = view.container.querySelector(`a[href$="/log/${last}"]`);
    expect(cell, 'no cell carries the block\u2019s last day').toBeTruthy();
    expect(cell!.className.split(/\s+/).some((n) => GHOST_FILLS.includes(n))).toBe(false);
  });

  it('keeps the first day of a block for that block', async () => {
    // The other end, and the same bug mirrored: an exclusive lower bound
    // ghosts the day a block begins, which is the day it is least true of.
    await loadPrograms();
    await reset();
    await hydrate();
    useObjectives.setState({
      objectives: [objective({ targetDate: overlapping(), season: ['base_camp', 'iron_grip'] })],
    });
    const first = startOfWeek(TODAY);
    useProfile.setState({
      activeProgramId: 'base_camp',
      startDates: { base_camp: first },
    } as never);

    const view = renderAt('/calendar', <CalendarPage />);
    const cell = view.container.querySelector(`a[href$="/log/${first}"]`);
    expect(cell, 'no cell carries the block\u2019s first day').toBeTruthy();
    expect(cell!.className.split(/\s+/).some((n) => GHOST_FILLS.includes(n))).toBe(false);
  });

  it('never stacks two backgrounds on one cell', async () => {
    // The cell's own comment records the trap: two background classes fight
    // on Tailwind's emit order rather than class order, and jsdom cannot
    // see which one wins. What it can see is that there is only ever one.
    const view = await render(true);
    const cells = [...view.container.querySelectorAll('[class*="aspect-square"]')];
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const backgrounds = cell.className.split(/\s+/).filter((c) => c.startsWith('bg-'));
      expect(backgrounds.length, `cell had ${backgrounds.length}: ${cell.className}`).toBe(1);
    }
  });
});
