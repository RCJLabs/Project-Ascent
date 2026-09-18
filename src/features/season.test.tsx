// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { addDays, today } from '@/engine/dates';
import { MAX_RUNWAY_WEEKS } from '@/engine/peak';
import type { Objective } from '@/engine/objectives';
import { useObjectives } from '@/store/objectives';
import { hydrate, renderAt, reset } from '@/test/render';
import { ObjectiveDetailPage } from '@/features/objectives/ObjectiveDetailPage';

/**
 * A season, on the page where a date already lives (PLAN.md M109).
 *
 * `peak.ts` withholds the runway past twelve weeks and tells the climber to
 * "pick a program for the first part of it" — which meant `/find`, one
 * block at a time, with nowhere to see the shape of the whole thing.
 */

/**
 * A target exactly `n` weeks away, measured the way `peak.ts` measures it —
 * from today, not from the start of the week. A week-anchored helper is off
 * by one on any day but the first of the week, and today is a Saturday.
 */
const weeksOut = (n: number) => addDays(today(), n * 7);

const objective = (patch: Partial<Objective> = {}): Objective => ({
  id: 'o1',
  name: 'Font trip',
  kind: 'trip',
  status: 'planning',
  requirements: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...patch,
});

async function page(o: Objective) {
  await reset();
  await hydrate();
  useObjectives.setState({ objectives: [o], hydrated: true });
  renderAt('/objectives/o1', <ObjectiveDetailPage params={{ id: 'o1' }} />);
  await screen.findByText('Font trip');
}

const card = () => screen.getByText('The season').closest('section')!;

describe('where the season appears', () => {
  it('is not asked about inside the runway the peak plan covers', async () => {
    await page(objective({ targetDate: weeksOut(MAX_RUNWAY_WEEKS - 2) }));
    expect(screen.queryByText('The season')).toBeNull();
    expect(screen.getByText('The runway')).toBeTruthy();
  });

  // Exactly where `peak.ts` says "pick a program for the first part of it".
  it('appears past it, beside the runway that withheld', async () => {
    await page(objective({ targetDate: weeksOut(MAX_RUNWAY_WEEKS + 1) }));
    expect(screen.getByText('The season')).toBeTruthy();
    expect(screen.getByText(/More than 12 weeks out is a training block/)).toBeTruthy();
  });

  it('is not asked about with no date at all', async () => {
    await page(objective());
    expect(screen.queryByText('The season')).toBeNull();
  });
});

describe('building one', () => {
  const far = () => objective({ targetDate: weeksOut(24) });

  it('offers the programs and takes an order', async () => {
    await page(far());
    fireEvent.click(within(card()).getByText('Base Camp'));
    await waitFor(() => expect(within(card()).getByText(/Base Camp is 12 weeks/)).toBeTruthy());
  });

  it('dates the blocks backwards from the target', async () => {
    await page(objective({ targetDate: weeksOut(24), season: ['base_camp', 'iron_grip'] as never }));
    expect(card().textContent).toMatch(/Base Camp → Iron Grip is 24 weeks against 24 weeks to the day/);
    // Two rows, each with its own window.
    expect(within(card()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('says how far over it runs, and leaves the fix to the climber', async () => {
    await page(objective({ targetDate: weeksOut(16), season: ['base_camp', 'iron_grip'] as never }));
    expect(card().textContent).toMatch(/8 weeks more than there is room for/);
    expect(card().textContent).toMatch(/run one of them shorter from its own page/);
  });

  it('takes a block back out', async () => {
    await page(objective({ targetDate: weeksOut(24), season: ['base_camp', 'iron_grip'] as never }));
    fireEvent.click(screen.getByLabelText('Take Base Camp out of the season'));
    await waitFor(() => expect(within(card()).getAllByRole('listitem')).toHaveLength(1));
  });

  /**
   * Base, power, base, peak (PLAN.md M274).
   *
   * Until M274 the chips hid anything already picked, which made the shape
   * `season.ts` documents — *"A season may name the same program twice"* —
   * unbuildable from the card that builds seasons. What the old rule was
   * written against was two of the same **back to back**, and that is all
   * that is refused now.
   */
  it('offers a program already in the season, so it can come round again', async () => {
    await page(objective({ targetDate: weeksOut(40), season: ['iron_grip', 'base_camp'] as never }));
    const chips = within(card()).getAllByRole('button').map((b) => b.textContent);
    expect(chips).toContain('Iron Grip');
  });

  it('does not offer the one it would sit straight after', async () => {
    await page(objective({ targetDate: weeksOut(40), season: ['base_camp', 'iron_grip'] as never }));
    const chips = within(card()).getAllByRole('button').map((b) => b.textContent);
    expect(chips.filter((t) => t === 'Iron Grip')).toHaveLength(0);
    expect(chips).toContain('Base Camp');
  });

  it('dates a repeat as two blocks and takes the right one back out', async () => {
    await page(
      objective({ targetDate: weeksOut(60), season: ['base_camp', 'iron_grip', 'base_camp'] as never }),
    );
    const rows = within(card()).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Base Camp'),
      expect.stringContaining('Iron Grip'),
      expect.stringContaining('Base Camp'),
    ]);
    // Two rows say Base Camp; the buttons have to be able to tell them
    // apart, which is what removal by position is for.
    const takeOut = within(card()).getAllByLabelText('Take Base Camp out of the season');
    expect(takeOut).toHaveLength(2);
    fireEvent.click(takeOut[0]!);
    await waitFor(() => {
      const left = within(card()).getAllByRole('listitem').map((r) => r.textContent);
      expect(left).toHaveLength(2);
      expect(left[0]).toContain('Iron Grip');
      expect(left[1]).toContain('Base Camp');
    });
  });

  it('stops offering more once the plan is a year long', async () => {
    await page(
      objective({
        targetDate: weeksOut(60),
        season: ['base_camp', 'iron_grip', 'trip_prep', 'lockdown'] as never,
      }),
    );
    expect(within(card()).getByText(/More than that is a plan nobody keeps/)).toBeTruthy();
  });

  /**
   * It is an intention. `Objective.targetDate` is documented as "not a
   * deadline that can be failed", and this is the same date.
   */
  it('never says a season was missed', async () => {
    await page(objective({ targetDate: weeksOut(14), season: ['base_camp', 'iron_grip'] as never }));
    const caveat = 'the app never marks a season missed';
    // The caveat is the one place the word belongs — it is the denial. The
    // check is on everything else, where it would be a verdict.
    expect(card().textContent).toContain(caveat);
    const rest = card().textContent!.replace(caveat, '');
    expect(rest).not.toMatch(/missed|failed|behind|too late|overdue|should have/i);
  });

  it('says it places nothing', async () => {
    await page(objective({ targetDate: weeksOut(24), season: ['iron_grip'] as never }));
    expect(card().textContent).toMatch(/Nothing here places a session/);
  });
});
