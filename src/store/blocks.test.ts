// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from '@/db/db';
import { loadPrograms } from '@/content/programs';
import { activeBlock, outcomeOf, sortBlocks } from '@/engine/blocks';
import { today } from '@/engine/dates';
import { hydrateProfile, useProfile } from './profile';

/**
 * The block history survives the lifecycle (PLAN.md M87).
 *
 * `engine/blocks.test.ts` holds the rules. This holds the wiring: that the
 * three transitions which used to lose a block now write one down, and that
 * a climber who has been using the app since before any of this existed
 * keeps their history rather than starting from today.
 */

const PLAN = { 1: 'fp', 3: 'pe' };

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await loadPrograms();
  useProfile.setState({ activeProgramId: null, startDates: {}, blocks: [], plans: {}, tracks: {} });
});

/** Seed a profile record in the shape the app wrote before M87. */
async function seedOldProfile(value: Record<string, unknown>) {
  const db = await getDb();
  await db.put('profile', { key: 'active-plan', value });
}

describe('starting, switching and stopping', () => {
  it('writes a row when a program starts', () => {
    useProfile.getState().startProgram('iron_grip', PLAN);
    const rows = useProfile.getState().blocks;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ programId: 'iron_grip', name: 'Iron Grip', endedAt: null });
  });

  it('closes the old block when another program starts', () => {
    // The case that used to strand a block: the date survived and nothing
    // could reach it.
    useProfile.getState().startProgram('iron_grip', PLAN);
    useProfile.getState().startProgram('peak_performance', PLAN);
    const rows = sortBlocks(useProfile.getState().blocks);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.programId).toBe('peak_performance');
    expect(rows[1]!.reason).toBe('switched');
    expect(rows.filter((r) => r.endedAt === null)).toHaveLength(1);
  });

  it('keeps the first run when the same program is restarted', () => {
    // The case that used to destroy one outright.
    useProfile.getState().startProgram('iron_grip', PLAN);
    useProfile.setState({ startDates: { iron_grip: '2020-01-05' } });
    useProfile.setState({ blocks: [{ ...useProfile.getState().blocks[0]!, startDate: '2020-01-05', id: 'iron_grip#2020-01-05' }] });
    useProfile.getState().startProgram('iron_grip', PLAN, undefined, true);
    const rows = sortBlocks(useProfile.getState().blocks);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.startDate)).toEqual([today(), '2020-01-05']);
    expect(rows[1]!.reason).toBe('restarted');
  });

  it('does not open a second block when the same program is picked up again', () => {
    useProfile.getState().startProgram('iron_grip', PLAN);
    useProfile.getState().startProgram('iron_grip', PLAN, 'board');
    const rows = useProfile.getState().blocks;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.trackId).toBe('board');
  });

  it('closes the block when the program is stopped', () => {
    useProfile.getState().startProgram('iron_grip', PLAN);
    useProfile.getState().stopProgram();
    const rows = useProfile.getState().blocks;
    expect(activeBlock(rows)).toBeNull();
    expect(rows[0]!.reason).toBe('stopped');
    expect(rows[0]!.endedAt).toBe(today());
  });

  it('survives a program the catalogue cannot resolve', () => {
    useProfile.getState().startProgram('never_shipped', PLAN);
    expect(useProfile.getState().blocks).toEqual([]);
    expect(useProfile.getState().activeProgramId).toBe('never_shipped');
  });
});

describe('a climber who was here before the history was', () => {
  it('reconstructs their blocks from the old shape', async () => {
    await seedOldProfile({
      activeProgramId: 'peak_performance',
      startDates: { iron_grip: '2026-01-04', peak_performance: '2026-04-05' },
    });
    await hydrateProfile();
    const rows = sortBlocks(useProfile.getState().blocks);
    expect(rows.map((r) => r.programId)).toEqual(['peak_performance', 'iron_grip']);
    expect(activeBlock(rows)!.programId).toBe('peak_performance');
  });

  it('does not claim a reconstructed block was finished', async () => {
    await seedOldProfile({
      activeProgramId: 'peak_performance',
      startDates: { iron_grip: '2026-01-04', peak_performance: '2026-04-05' },
    });
    await hydrateProfile();
    const old = useProfile.getState().blocks.find((r) => r.programId === 'iron_grip')!;
    expect(old.reconstructed).toBe(true);
    expect(outcomeOf(old, today())).toBe('unknown');
  });

  it('leaves a real history alone', async () => {
    const recorded = [
      { id: 'a#2026-01-04', programId: 'iron_grip', name: 'Iron Grip', startDate: '2026-01-04', weeks: 12, endedAt: null },
    ];
    await seedOldProfile({ activeProgramId: 'iron_grip', startDates: { iron_grip: '2026-01-04' }, blocks: recorded });
    await hydrateProfile();
    expect(useProfile.getState().blocks).toEqual(recorded);
    expect(useProfile.getState().blocks[0]!.reconstructed).toBeUndefined();
  });

  it('treats a stored empty history as unknown rather than as none', async () => {
    // An empty array is not evidence there were no blocks — a profile
    // saved from default state before its first hydrate writes one, and so
    // can a partially restored backup. `startDates` is the older and more
    // trustworthy record when the two disagree.
    await seedOldProfile({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: '2026-01-04' },
      blocks: [],
    });
    await hydrateProfile();
    expect(useProfile.getState().blocks).toHaveLength(1);
    expect(useProfile.getState().blocks[0]!.reconstructed).toBe(true);
  });

  it('makes nothing from a profile that never started anything', async () => {
    await seedOldProfile({ activeProgramId: null, startDates: {} });
    await hydrateProfile();
    expect(useProfile.getState().blocks).toEqual([]);
  });

  it('keeps the history across a save and a reload', async () => {
    useProfile.getState().startProgram('iron_grip', PLAN);
    useProfile.getState().startProgram('peak_performance', PLAN);
    const before = useProfile.getState().blocks;
    await new Promise((r) => setTimeout(r, 10));
    useProfile.setState({ blocks: [] });
    await hydrateProfile();
    expect(useProfile.getState().blocks).toEqual(before);
  });
});
