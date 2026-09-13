// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { loadPrograms } from '@/content/programs';
import { IRON_GRIP } from '@/content/programs/catalogue';
import { addDays, startOfWeek, today } from '@/engine/dates';
import type { BlockRecord } from '@/engine/blocks';
import { planFromLayout } from '@/engine/scheduler';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinishPage } from '@/features/finish/FinishPage';
import { ProgramDetailPage } from './ProgramDetailPage';
import { TrainPage } from './TrainPage';

/**
 * The block you are running, and the way out of it (PLAN.md M126).
 *
 * Three holes, one milestone. The Train tab never read `activeProgramId`,
 * so the tab named after training offered to find you a program in week 6
 * of one. The program page said *Start this program* on the program you
 * were already on, and on a second one without saying it would end the
 * first. And `stopProgram` was reachable only from clearing the sample data
 * and from deleting a custom program, so a climber who got injured had no
 * control to press at all.
 *
 * These drive all three from the outside: what the tab shows, what the
 * button says, and what is in the store after the stop.
 */

const TODAY = today();
const PLAN = planFromLayout(IRON_GRIP.recommendedLayout!);

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await hydrate();
});

/** A block that started `weeksAgo` weeks back and is still open. */
function running(weeksAgo = 1): void {
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: addDays(startOfWeek(TODAY), -weeksAgo * 7) },
    plans: { iron_grip: PLAN },
    weekOverrides: {},
    adaptations: {},
  });
}

function nothingRunning(blocks: BlockRecord[] = []): void {
  useProfile.setState({ activeProgramId: null, startDates: {}, plans: {}, blocks });
}

const ended = (name: string): BlockRecord => ({
  id: `iron_grip#2026-01-04`,
  programId: 'iron_grip',
  name,
  startDate: '2026-01-04',
  weeks: 12,
  endedAt: '2026-03-28',
  reason: 'stopped',
});

describe('the Train tab knows what you are running', () => {
  it('leads with the block, its week and its phase', async () => {
    running(1);
    renderAt('/train', <TrainPage />);
    const hero = await screen.findByText('Your block');
    const card = hero.closest('a')!;
    expect(card.getAttribute('href')).toBe('#/finish');
    expect(card.textContent).toContain('Iron Grip');
    expect(card.textContent).toMatch(/Week 2 of 12/);
  });

  it('steps the finder down, and says what starting another costs', async () => {
    running(1);
    renderAt('/train', <TrainPage />);
    await screen.findByText('Your block');
    const finder = screen.getByText('Find another program').closest('a')!;
    expect(finder.getAttribute('href')).toBe('#/find');
    expect(finder.textContent).toMatch(/Starting one ends this block/);
    // And it is no longer the loudest thing on the page.
    expect(screen.queryByText('Find my program')).toBeNull();
  });

  it('names the phase as well as the week', async () => {
    running(1);
    renderAt('/train', <TrainPage />);
    const hero = await screen.findByText('Your block');
    const phase = IRON_GRIP.phases[0]!.name;
    expect(hero.closest('a')!.textContent).toContain(phase);
  });

  it('says when the block has run its weeks', async () => {
    running(14);
    renderAt('/train', <TrainPage />);
    const hero = await screen.findByText('Your block');
    expect(hero.closest('a')!.textContent).toMatch(/run its course/);
  });

  it('leads with the finder again when nothing is running', async () => {
    nothingRunning();
    renderAt('/train', <TrainPage />);
    await screen.findByText('Find my program');
    expect(screen.queryByText('Your block')).toBeNull();
    expect(screen.queryByText('Find another program')).toBeNull();
  });

  it('offers the history when there is one and nothing is running', async () => {
    nothingRunning([ended('Iron Grip')]);
    renderAt('/train', <TrainPage />);
    const link = (await screen.findByText('Blocks you have run')).closest('a')!;
    expect(link.getAttribute('href')).toBe('#/finish');
    expect(link.textContent).toMatch(/1 behind you/);
  });

  it('names the most recent block, not the first one ever run', async () => {
    // `sortBlocks` is newest-first, and reading the other end of it named
    // the oldest block a climber had ever run as "the last".
    nothingRunning([
      { ...ended('Ground Zero'), id: 'a', startDate: '2025-01-05', endedAt: '2025-03-29' },
      { ...ended('Iron Grip'), id: 'b', startDate: '2026-01-04', endedAt: '2026-03-28' },
    ]);
    renderAt('/train', <TrainPage />);
    const link = (await screen.findByText('Blocks you have run')).closest('a')!;
    expect(link.textContent).toMatch(/2 behind you\. The last was Iron Grip\./);
  });

  it('counts a block left open by its own last week', async () => {
    // Nothing closes a row when its weeks run out — the climber simply
    // stops being on it — so a history that counted only closed rows would
    // tell someone who saw a block through that they have run none.
    nothingRunning([{ ...ended('Iron Grip'), endedAt: null }]);
    renderAt('/train', <TrainPage />);
    const link = (await screen.findByText('Blocks you have run')).closest('a')!;
    expect(link.textContent).toMatch(/1 behind you/);
  });

  it('offers no history to a climber who has never run a block', async () => {
    nothingRunning();
    renderAt('/train', <TrainPage />);
    await screen.findByText('Find my program');
    expect(screen.queryByText('Blocks you have run')).toBeNull();
  });
});

describe('the program page knows whether you are on it', () => {
  it('opens the block instead of offering to start it again', async () => {
    running(1);
    renderAt('/train/iron_grip', <ProgramDetailPage params={{ id: 'iron_grip' }} />);
    const open = await screen.findByRole('link', { name: /How this block is going/ });
    expect(open.getAttribute('href')).toBe('#/finish');
    expect(screen.queryByRole('link', { name: /Start this program/ })).toBeNull();
    expect(screen.getByText(/You are on this one · Week 2 of 12/)).toBeTruthy();
    // Re-planning the week is still reachable, which is what the old button
    // was doing for someone already on it.
    expect(screen.getByRole('link', { name: 'Change my week' }).getAttribute('href')).toBe(
      '#/train/iron_grip/start',
    );
  });

  it('warns that starting another ends the one you are on', async () => {
    running(1);
    renderAt('/train/lockdown', <ProgramDetailPage params={{ id: 'lockdown' }} />);
    await screen.findByRole('link', { name: /Start this program/ });
    // The whole sentence, because the phase does not belong in it: fitting
    // the full week line into the middle of a sentence meant lowercasing
    // it, and "The Anvil (Repeaters)" came out as "the anvil (repeaters)".
    expect(screen.getByText(/Starting this ends Iron Grip in week 2 of 12\./)).toBeTruthy();
    expect(screen.queryByText(/the anvil/i), 'a phase name was folded into the warning').toBeNull();
  });

  it('says nothing about switching when nothing is running', async () => {
    nothingRunning();
    renderAt('/train/lockdown', <ProgramDetailPage params={{ id: 'lockdown' }} />);
    await screen.findByRole('link', { name: /Start this program/ });
    expect(screen.queryByText(/Starting this ends/)).toBeNull();
  });

  it('still offers no start button on a log-only mode', async () => {
    nothingRunning();
    renderAt('/train/general_training', <ProgramDetailPage params={{ id: 'general_training' }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: /Start this program/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /How this block is going/ })).toBeNull();
  });
});

describe('stopping a block', () => {
  it('is offered on the block you are running', async () => {
    running(1);
    renderAt('/finish', <FinishPage />);
    expect(await screen.findByRole('button', { name: /Stop Iron Grip/ })).toBeTruthy();
  });

  it('says what it costs, which is almost nothing', async () => {
    running(1);
    renderAt('/finish', <FinishPage />);
    await screen.findByRole('button', { name: /Stop Iron Grip/ });
    expect(screen.getByText(/Everything you have logged stays where it is/)).toBeTruthy();
    expect(screen.getByText(/resumes the week you were on/)).toBeTruthy();
  });

  it('closes the block and leaves nothing prescribed', async () => {
    running(1);
    // A live row, so the close has something to write its reason on.
    useProfile.setState({
      blocks: [
        {
          id: 'iron_grip#x',
          programId: 'iron_grip',
          name: 'Iron Grip',
          startDate: addDays(startOfWeek(TODAY), -7),
          weeks: 12,
          endedAt: null,
        },
      ],
    });
    renderAt('/finish', <FinishPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Stop Iron Grip/ }));
    await waitFor(() => expect(useProfile.getState().activeProgramId).toBeNull());
    const row = useProfile.getState().blocks[0]!;
    expect(row.endedAt).not.toBeNull();
    expect(row.reason).toBe('stopped');
  });

  it('can be undone, and puts the same block back rather than a new one', async () => {
    running(1);
    const row: BlockRecord = {
      id: 'iron_grip#x',
      programId: 'iron_grip',
      name: 'Iron Grip',
      startDate: addDays(startOfWeek(TODAY), -7),
      weeks: 12,
      endedAt: null,
    };
    useProfile.setState({ blocks: [row] });
    renderAt('/finish', <FinishPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Stop Iron Grip/ }));
    await waitFor(() => expect(useProfile.getState().activeProgramId).toBeNull());

    const { useUndo } = await import('@/store/undo');
    const offer = useUndo.getState().offer;
    expect(offer, 'stopping offered no undo').not.toBeNull();
    await offer!.run();

    expect(useProfile.getState().activeProgramId).toBe('iron_grip');
    expect(useProfile.getState().blocks).toHaveLength(1);
    expect(useProfile.getState().blocks[0]).toEqual(row);
  });

  it('is not offered on a block that already ended', async () => {
    const row = ended('Iron Grip');
    nothingRunning([row]);
    renderAt(`/finish/${row.id}`, <FinishPage params={{ id: row.id }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /^Stop / })).toBeNull();
  });

  it('is not offered on a past block while a different one runs', async () => {
    // The card has to read the row on screen, not merely "something is
    // running": `/finish/:id` can show any block in the history while the
    // climber is mid-way through another.
    running(1);
    const row = ended('Iron Grip');
    useProfile.setState({ blocks: [row] });
    renderAt(`/finish/${row.id}`, <FinishPage params={{ id: row.id }} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /^Stop / })).toBeNull();
  });

  it('is not offered to a climber running nothing', async () => {
    nothingRunning();
    renderAt('/finish', <FinishPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /^Stop / })).toBeNull();
  });
});
