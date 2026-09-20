// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { loadPrograms } from '@/content/programs';
import { blockId } from '@/engine/blocks';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { TrainPage } from '@/features/train/TrainPage';

/**
 * A block that noticed it was interrupted, asking what to do (PLAN.md M149).
 *
 * Proposed, never applied: the whole operation is one field, so the app
 * could slide the block back silently and every number would agree. It does
 * not, because a block that rewrites itself is one nobody can trust.
 */

const TODAY = today();
/** Nine weeks back, on a Sunday, so today is week 9 of a twelve-week block. */
const START = addDays(startOfWeek(TODAY), -8 * 7);
/**
 * The Sunday of week `n` — a day of that week that has already happened
 * (PLAN.md M299).
 *
 * This was the Monday, `+ 7 * (n - 1) + 1`, and `interruption` ignores a
 * session dated after today: run on a Sunday, the block's own current week
 * had not reached its Monday, the session below landed tomorrow, and the
 * last week trained was week 1 whatever this was asked for. The card the
 * first test says stays away appeared, seven weeks missed.
 *
 * A week here begins on its Sunday, so `+ 7 * (n - 1)` is the one day of
 * week `n` that exists from the moment week `n` does.
 */
const week = (n: number) => addDays(START, (n - 1) * 7);

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

/** Iron Grip running since `START`, last trained in `lastWeek`. */
async function train(lastWeek: number | null) {
  for (const w of lastWeek === null ? [] : [1, lastWeek]) {
    await putSession({
      ...newSession(week(w), 0, { completed: true }),
      programId: 'iron_grip',
      sessionTypeId: 'fp',
    } as never);
  }
  await hydrate();
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: START },
    plans: { iron_grip: { 1: 'fp' } },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
    blocks: [
      {
        id: blockId('iron_grip', START),
        programId: 'iron_grip',
        name: 'Iron Grip',
        startDate: START,
        weeks: 12,
        endedAt: null,
      },
    ],
  } as never);
  renderAt('/train', <TrainPage />);
  await screen.findByText('Train');
}

describe('the card', () => {
  it('stays away while the block is being run', async () => {
    await train(9);
    expect(screen.queryByText('This block has moved on without you')).toBeNull();
  });

  it('appears once whole weeks have gone by with nothing in them', async () => {
    await train(6);
    expect(await screen.findByText('This block has moved on without you')).toBeTruthy();
    expect(screen.getByText(/last week you trained was 6/)).toBeTruthy();
  });

  it('offers both the resume and the phase opening', async () => {
    await train(6);
    expect(await screen.findByText(/Pick up at week 7/)).toBeTruthy();
    expect(screen.getByText(/Go back to week 5/)).toBeTruthy();
  });

  it('says that doing nothing is also an answer', async () => {
    await train(6);
    expect(screen.getByText(/Or leave it/)).toBeTruthy();
  });
});

describe('why you were away', () => {
  it('reorders the choices without removing any', async () => {
    await train(6);
    const before = screen.getAllByRole('button', { name: 'Move the block here' }).length;
    fireEvent.click(screen.getByText('Hurt'));
    await screen.findByText(/the week you stopped on is the last one to re-enter at/);
    expect(screen.getAllByRole('button', { name: 'Move the block here' })).toHaveLength(before);
    // The phase opening now leads.
    const headings = screen.getAllByText(/Pick up at week 7|Go back to week 5/);
    expect(headings[0]!.textContent).toMatch(/Go back to week 5/);
  });

  it('can be taken back', async () => {
    await train(6);
    fireEvent.click(screen.getByText('Away'));
    await screen.findByText(/fortnight off/);
    fireEvent.click(screen.getByText('Away'));
    await waitFor(() => expect(screen.queryByText(/fortnight off/)).toBeNull());
  });
});

describe('taking one', () => {
  it('moves the block rather than starting a new one', async () => {
    await train(6);
    fireEvent.click(screen.getAllByRole('button', { name: 'Move the block here' })[0]!);

    await waitFor(() => {
      expect(useProfile.getState().startDates['iron_grip']).toBe(addDays(START, 2 * 7));
    });
    const blocks = useProfile.getState().blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.id).toBe(blockId('iron_grip', addDays(START, 2 * 7)));
    expect(blocks[0]!.endedAt).toBeNull();
  });

  it('leaves nothing to say once the block has caught up', async () => {
    await train(6);
    fireEvent.click(screen.getAllByRole('button', { name: 'Move the block here' })[0]!);
    await waitFor(() =>
      expect(screen.queryByText('This block has moved on without you')).toBeNull(),
    );
  });
});

/**
 * The store's own guard: a shift of zero or less is not a move, and asking
 * for one would slide a block backwards into weeks it has already run.
 */
describe('the move itself', () => {
  it('refuses a shift that is not forwards', async () => {
    await train(6);
    const before = useProfile.getState().startDates['iron_grip'];
    useProfile.getState().resumeBlock('iron_grip', 0);
    useProfile.getState().resumeBlock('iron_grip', -3);
    expect(useProfile.getState().startDates['iron_grip']).toBe(before);
    expect(useProfile.getState().resumedAt['iron_grip']).toBeUndefined();
  });

  it('does nothing for a program that was never started', async () => {
    await train(6);
    useProfile.getState().resumeBlock('the_siege', 2);
    expect(useProfile.getState().startDates['the_siege']).toBeUndefined();
    expect(useProfile.getState().blocks[0]!.programId).toBe('iron_grip');
  });
});
