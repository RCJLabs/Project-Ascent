// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { addDays, startOfWeek, today } from '@/engine/dates';
import type { Objective } from '@/engine/objectives';
import { useObjectives } from '@/store/objectives';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinishPage } from '@/features/finish/FinishPage';

/**
 * The block you said you would run next (PLAN.md M112c).
 *
 * `/finish` offered the program author's successors and the finder, and
 * nothing else — so a climber who had planned four blocks and finished the
 * first was asked to choose again, by a page that had been told the answer.
 *
 * The card is above the authored ones deliberately: those are what the app
 * advises, this is what the climber decided, and on their own page the
 * decision outranks the advice.
 */

const TODAY = today();

const objective = (patch: Partial<Objective> = {}): Objective =>
  ({
    id: 'obj-1',
    name: 'Spain trip',
    kind: 'trip',
    status: 'planning',
    requirements: [],
    createdAt: `${TODAY}T00:00:00.000Z`,
    updatedAt: `${TODAY}T00:00:00.000Z`,
    ...patch,
  }) as Objective;

/**
 * A finished block, and a target far enough out that the season is blocks
 * rather than a peak runway.
 */
async function finished(season?: string[], startedWeeksAgo = 14): Promise<void> {
  await loadPrograms();
  await reset();
  await hydrate();
  const from = addDays(startOfWeek(TODAY), -startedWeeksAgo * 7);
  useProfile.setState({
    activeProgramId: 'base_camp',
    startDates: { base_camp: from },
  } as never);
  if (season) {
    useObjectives.setState({
      objectives: [objective({ targetDate: addDays(startOfWeek(TODAY), 7 * 20), season })],
    });
  }
  renderAt('/finish', <FinishPage />);
}

const card = () => screen.queryByText(/Next in your season/);

/**
 * Queries scoped to the season card.
 *
 * Unscoped they are ambiguous: the authored successors below often name the
 * same program, which is the point — both cards are meant to be there.
 */
const inCard = () => {
  const heading = screen.getByText(/Next in your season/);
  const box = heading.closest('section, div[class*="rounded"]');
  if (!box) throw new Error('the season card has no container');
  return within(box as HTMLElement);
};

describe('the season on the block-end page', () => {
  it('is not there without one', async () => {
    await finished();
    expect(card()).toBeNull();
  });

  it('names the block that comes after', async () => {
    await finished(['base_camp', 'iron_grip']);
    expect(card()).toBeTruthy();
    expect(inCard().getByText('Iron Grip')).toBeTruthy();
  });

  it('says where in the sequence this was', async () => {
    await finished(['base_camp', 'iron_grip', 'the_cruiser']);
    expect(screen.getByText(/Block 1 of 3/)).toBeTruthy();
  });

  it('names the objective it is on the way to', async () => {
    await finished(['base_camp', 'iron_grip']);
    expect(screen.getByText('Spain trip')).toBeTruthy();
  });

  it('leaves starting it to the climber', async () => {
    // The card is a reminder, not a commitment. Dates in a season are
    // derived from the target; a block starts when it is actually started.
    await finished(['base_camp', 'iron_grip']);
    expect(screen.getByText(/Starting it is still your call/)).toBeTruthy();
  });

  it('says so when that was the last block planned', async () => {
    await finished(['iron_grip', 'base_camp']);
    expect(screen.getByText(/That was the last block you planned/)).toBeTruthy();
  });

  it('never reads as a deadline passed or missed', async () => {
    // `targetDate` is documented as not a deadline that can be failed, and
    // this is the same date. The end of a season is not a verdict.
    await finished(['iron_grip', 'base_camp']);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/missed|failed|behind schedule|overdue|too late/i);
  });

  it('ignores a season on an objective that is no longer being trained for', async () => {
    // `activeObjectives` is planning-or-training. A sent project's season is
    // history and a shelved one is a plan the climber put down; neither
    // should be telling them what to run next.
    for (const status of ['sent', 'shelved'] as const) {
      await loadPrograms();
      await reset();
      await hydrate();
      useProfile.setState({
        activeProgramId: 'base_camp',
        startDates: { base_camp: addDays(startOfWeek(TODAY), -14 * 7) },
      } as never);
      useObjectives.setState({
        objectives: [
          objective({
            targetDate: addDays(startOfWeek(TODAY), 7 * 20),
            season: ['base_camp', 'iron_grip'],
            status,
          }),
        ],
      });
      renderAt('/finish', <FinishPage />);
      expect(card(), `${status} still offered a next block`).toBeNull();
    }
  });

  it('says nothing when the finished block is not in the season', async () => {
    // A climber who ran something other than the plan. The page falls back
    // to the authored successors rather than inventing a position.
    await finished(['iron_grip', 'the_cruiser']);
    expect(card()).toBeNull();
  });
});

describe('the climber’s plan outranks the app’s advice', () => {
  it('sits above the authored successors', async () => {
    // Both are true and they answer different questions — "what usually
    // follows" and "what you said you would do". On the climber's own page
    // the second one goes first.
    await finished(['base_camp', 'iron_grip']);
    const text = document.body.textContent ?? '';
    const mine = text.indexOf('Next in your season');
    const authored = text.indexOf('What comes next');
    expect(mine).toBeGreaterThan(-1);
    expect(authored, 'the authored card is gone, not reordered').toBeGreaterThan(-1);
    expect(mine).toBeLessThan(authored);
  });

  it('does not replace them', async () => {
    await finished(['base_camp', 'iron_grip']);
    expect(screen.getByText(/Written into .* itself/)).toBeTruthy();
  });
});
