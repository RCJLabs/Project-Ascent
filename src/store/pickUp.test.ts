// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '@/db/db';
import { loadPrograms } from '@/content/programs';
import { blockId, type BlockRecord } from '@/engine/blocks';
import { addDays, programWeek, startOfWeek, today } from '@/engine/dates';
import { useProfile } from './profile';

/**
 * Resume picks up where the climber left off (PLAN.md M369).
 *
 * The Stop card promised *"starting Iron Grip again later resumes the week
 * you were on"*, and the start page *"Resume keeps your place"*. Resuming
 * kept the start date, so a block stopped at the end of week six and
 * resumed four weeks later was in week ten.
 */

const PLAN = { 1: 'fp', 3: 'perf' };

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await loadPrograms();
  useProfile.setState({ activeProgramId: null, startDates: {}, blocks: [], plans: {}, tracks: {} });
});

/** Iron Grip from a Sunday `weeksAgo` weeks back, stopped on `stoppedDay` of week six (0 = its Sunday). */
function stoppedInWeekSix(weeksAgo: number, stoppedDay: number) {
  const start = addDays(startOfWeek(today()), -weeksAgo * 7);
  const stopped = addDays(start, 5 * 7 + stoppedDay);
  const row: BlockRecord = {
    id: blockId('iron_grip', start), programId: 'iron_grip', name: 'Iron Grip', startDate: start, weeks: 12,
    plan: PLAN, endedAt: stopped, reason: 'stopped',
  };
  useProfile.setState({ activeProgramId: null, startDates: { iron_grip: start }, blocks: [row], plans: { iron_grip: PLAN } });
  return { start, stopped };
}

describe('resuming a stopped block', () => {
  it('puts today at the week the climber was on', () => {
    const { stopped } = stoppedInWeekSix(9, 3); // stopped on the Wednesday of week six
    useProfile.getState().startProgram('iron_grip', PLAN);
    const s = useProfile.getState();
    expect(programWeek(s.startDates.iron_grip!, today(), 12)).toBe(6);
    expect(s.blocks, 'resuming added a second row for the same run').toHaveLength(1);
    expect(s.blocks[0]).toMatchObject({ startDate: s.startDates.iron_grip, endedAt: null });
    // Nine weeks back from this week's Sunday is week ten today: four to move.
    expect(s.blocks[0]!.resumed).toEqual([{ on: today(), weeks: 4, stoppedOn: stopped }]);
    expect(s.activeProgramId).toBe('iron_grip');
  });

  it('closes whatever else was running', () => {
    stoppedInWeekSix(9, 3);
    useProfile.getState().startProgram('peak_performance', { 1: 'perf' });
    useProfile.getState().startProgram('iron_grip', PLAN);
    const rows = useProfile.getState().blocks;
    expect(rows.find((r) => r.programId === 'peak_performance')).toMatchObject({ endedAt: today(), reason: 'switched' });
    expect(rows.filter((r) => r.endedAt === null).map((r) => r.programId)).toEqual(['iron_grip']);
  });

  it('keeps the start when it is resumed in the week it stopped', () => {
    const { start } = stoppedInWeekSix(5, 0); // stopped this week
    useProfile.getState().startProgram('iron_grip', PLAN);
    const s = useProfile.getState();
    expect(s.startDates.iron_grip).toBe(start);
    expect(s.blocks[0]!.resumed).toBeUndefined();
  });

  it('starts over when asked to restart', () => {
    stoppedInWeekSix(9, 3);
    useProfile.getState().startProgram('iron_grip', PLAN, undefined, true);
    expect(useProfile.getState().startDates.iron_grip).toBe(today());
  });
});

describe("M149's pick it up", () => {
  it('records the pick-up, with no stop', () => {
    const start = addDays(startOfWeek(today()), -8 * 7);
    useProfile.getState().startProgram('iron_grip', PLAN);
    useProfile.setState({
      startDates: { iron_grip: start },
      blocks: useProfile.getState().blocks.map((r) => ({ ...r, id: blockId('iron_grip', start), startDate: start })),
    });
    useProfile.getState().resumeBlock('iron_grip', 2);
    const open = useProfile.getState().blocks.find((r) => r.endedAt === null)!;
    expect(open.startDate).toBe(addDays(start, 14));
    expect(open.resumed).toEqual([{ on: today(), weeks: 2 }]);
  });
});
