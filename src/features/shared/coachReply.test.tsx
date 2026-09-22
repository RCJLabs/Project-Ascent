// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { buildBlockFile, type BlockFile } from '@/engine/blockFile';
import type { BlockReport } from '@/engine/blockReport';
import type { Program } from '@/content/types';
import { loadPrograms } from '@/content/programs';
import { setLaunchFile } from '@/lib/launchFile';
import { clearWritingFor, writingFor } from '@/lib/writingFor';
import { useCustomPrograms } from '@/store/programs';
import { renderAt, reset } from '@/test/render';
import { blankProgram } from '@/engine/customProgram';
import { BuilderPage } from '@/features/builder/BuilderPage';
import { SharedBlockPage } from './SharedBlockPage';

/**
 * The coach loop's return leg (PLAN.md M322).
 *
 * M292 got a block from the athlete to the coach and kept none of it. This is
 * the way back, and what it must not do is the same thing: the program a
 * coach writes is theirs and is saved with their own, the athlete's block is
 * not saved at all, and the second half of that is easy to lose by accident.
 */

function file(name = 'Iron Grip'): BlockFile {
  return buildBlockFile({
    report: {
      program: { id: 'iron_grip', name, weeks: 12 } as BlockReport['program'],
      from: '2026-06-07',
      to: '2026-08-29',
      through: '2026-08-29',
      finished: true,
      tests: [],
      results: [],
      comparable: [],
      better: 2,
      worse: 0,
      flat: 1,
      untested: 4,
    } as BlockReport,
    outcome: 'completed',
    weeksRun: 12,
    sessions: 30,
    planned: 36,
    summary: 'Two improved; four were never tested.',
  });
}

async function open(body: BlockFile = file()): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  clearWritingFor();
  setLaunchFile(new File([JSON.stringify(body)], 't.ascent-block.json', { type: 'application/json' }));
  renderAt('/shared', <SharedBlockPage />);
  await screen.findByText(body.block.program);
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  await loadPrograms();
});

describe('writing one back', () => {
  it('offers a copy of the program they actually ran', async () => {
    await open();
    expect(screen.getByText(/They ran Iron Grip/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start from Iron Grip/ })).toBeTruthy();
  });

  it('saves the fork as the coach’s own and opens it', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Start from Iron Grip/ }));
    await waitFor(() => expect(useCustomPrograms.getState().custom).toHaveLength(1));
    const made = useCustomPrograms.getState().custom[0]!;
    // Not "(mine)", which is `forkProgram`'s default and the wrong word for a
    // program written for somebody else.
    expect(made.name).toBe('Iron Grip (revised)');
    expect(window.location.hash).toContain(`/build/${made.id}`);
  });

  it('carries the athlete’s block to the builder without saving it', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Start from Iron Grip/ }));
    await waitFor(() => expect(useCustomPrograms.getState().custom).toHaveLength(1));
    const made = useCustomPrograms.getState().custom[0]!;

    const held = writingFor(made.id)!;
    expect(held.program).toBe('Iron Grip');
    expect(held.summary).toBe('Two improved; four were never tested.');
    // All four counts, never three: `describeBlock`'s rule, which M292's own
    // card follows and this note would otherwise quietly break.
    expect([held.better, held.flat, held.worse, held.untested]).toEqual([2, 1, 0, 4]);

    // And the half that matters: none of it is in the coach's program, which
    // is the only thing this flow writes.
    expect(JSON.stringify(made)).not.toContain('Two improved');
    expect(JSON.stringify(made)).not.toContain('untested');
  });

  it('writes a blank one, with nothing of theirs in it either', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Write a blank one/ }));
    await waitFor(() => expect(useCustomPrograms.getState().custom).toHaveLength(1));
    const made = useCustomPrograms.getState().custom[0]!;
    expect(made.name).not.toContain('Iron Grip');
    // Held against the blank too — the note is about the block, not about
    // what the coach chose to start from.
    expect(writingFor(made.id)?.program).toBe('Iron Grip');
  });

  it('offers no copy of a program this app does not ship', async () => {
    // Their own program, or one of the two modes, which prescribe nothing a
    // coach could change. Saying so beats offering a copy of something else.
    await open(file('My winter block'));
    expect(screen.getByText(/is not a program this app ships/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start from/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Write a blank one/ })).toBeTruthy();
  });

  it('offers no copy of a mode, which has nothing to prescribe', async () => {
    await open(file('General Training'));
    expect(screen.queryByRole('button', { name: /Start from/ })).toBeNull();
  });

  it('still says the block itself is kept nowhere', async () => {
    await open();
    expect(screen.getByText(/Nothing on this screen is saved/)).toBeTruthy();
    expect(screen.getByText(/goes when this tab does/)).toBeTruthy();
  });
});

describe('the note in the builder', () => {
  async function builder(program: Program) {
    await useCustomPrograms.getState().save(program);
    renderAt(`/build/${program.id}`, <BuilderPage params={{ id: program.id }} />);
    await screen.findByText('What it is');
  }

  it('shows the block the program is answering', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Start from Iron Grip/ }));
    await waitFor(() => expect(useCustomPrograms.getState().custom).toHaveLength(1));
    const made = useCustomPrograms.getState().custom[0]!;

    cleanup();
    await builder(made);
    expect(screen.getByText('Answering a block they sent you')).toBeTruthy();
    expect(screen.getByText(/2 improved, 1 held, 0 down, 4 untested/)).toBeTruthy();
    expect(screen.getByText(/Two improved; four were never tested\./)).toBeTruthy();
  });

  it('shows nothing above a program it was not held for', async () => {
    // The keying, from the other end: a coach opening one of their own
    // programs after writing for an athlete must not find the athlete's
    // block above it.
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Start from Iron Grip/ }));
    await waitFor(() => expect(useCustomPrograms.getState().custom).toHaveLength(1));

    cleanup();
    await builder(blankProgram('Something of my own'));
    expect(screen.queryByText('Answering a block they sent you')).toBeNull();
  });

  it('puts it away when asked, and stays away', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: /Start from Iron Grip/ }));
    await waitFor(() => expect(useCustomPrograms.getState().custom).toHaveLength(1));
    const made = useCustomPrograms.getState().custom[0]!;

    cleanup();
    await builder(made);
    fireEvent.click(screen.getByRole('button', { name: 'Put it away' }));
    await waitFor(() => expect(screen.queryByText('Answering a block they sent you')).toBeNull());

    // Not just hidden in this component's state: the slot is empty, so a
    // remount does not bring it back.
    expect(writingFor(made.id)).toBeNull();
  });
});
