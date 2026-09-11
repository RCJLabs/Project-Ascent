import { describe, expect, it } from 'vitest';
import type { Program } from '@/content/types';
import {
  activeBlock,
  blockId,
  closeBlock,
  findBlock,
  openBlock,
  outcomeOf,
  reconstructBlocks,
  rowWindow,
  sortBlocks,
  weeksRun,
  type BlockRecord,
} from './blocks';

/**
 * The history the app did not keep (PLAN.md M87).
 *
 * `startDates` held one date per program: a restart wrote over it, and a
 * switch left it unreachable. These hold the shape that replaces it — above
 * all the rule that makes the rest work, that there is never more than one
 * block open.
 */

const program = (id: string, name: string, weeks = 12): Program =>
  ({ id, name, weeks, kind: 'program', phases: [], assessments: [], sessionTypes: [] }) as unknown as Program;

const IRON = program('iron_grip', 'Iron Grip');
const PEAK = program('peak_performance', 'Peak Performance');

describe('opening a block', () => {
  it('writes down what the program was at the time', () => {
    const rows = openBlock([], { program: IRON, startDate: '2026-01-04' }, '2026-01-04');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: blockId('iron_grip', '2026-01-04'),
      programId: 'iron_grip',
      name: 'Iron Grip',
      weeks: 12,
      endedAt: null,
    });
  });

  it('keeps the name and length even after the program changes', () => {
    // The reason these are stored rather than derived: M56's adaptation is
    // one current value per program, so a block run over eight weeks would
    // become twelve the day the same program is started at its full length.
    const short = openBlock([], { program: program('iron_grip', 'Iron Grip', 8), startDate: '2026-01-04' }, '2026-01-04');
    const full = openBlock(short, { program: IRON, startDate: '2026-04-05' }, '2026-04-05');
    expect(full.find((r) => r.startDate === '2026-01-04')!.weeks).toBe(8);
    expect(full.find((r) => r.startDate === '2026-04-05')!.weeks).toBe(12);
  });

  it('carries the track when there is one', () => {
    const rows = openBlock([], { program: IRON, startDate: '2026-01-04', trackId: 'board' }, '2026-01-04');
    expect(rows[0]!.trackId).toBe('board');
  });

  it('leaves no track key when there is none', () => {
    expect('trackId' in openBlock([], { program: IRON, startDate: '2026-01-04' }, '2026-01-04')[0]!).toBe(false);
  });
});

describe('only one block is ever open', () => {
  const first = openBlock([], { program: IRON, startDate: '2026-01-04' }, '2026-01-04');

  it('closes the old one when a different program starts', () => {
    const rows = openBlock(first, { program: PEAK, startDate: '2026-02-01' }, '2026-02-01');
    expect(rows.filter((r) => r.endedAt === null)).toHaveLength(1);
    expect(activeBlock(rows)!.programId).toBe('peak_performance');
    const old = rows.find((r) => r.programId === 'iron_grip')!;
    expect(old.endedAt).toBe('2026-02-01');
    expect(old.reason).toBe('switched');
  });

  it('calls it a restart when the same program starts again', () => {
    const rows = openBlock(first, { program: IRON, startDate: '2026-02-01' }, '2026-02-01');
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.startDate === '2026-01-04')!.reason).toBe('restarted');
    expect(activeBlock(rows)!.startDate).toBe('2026-02-01');
  });

  it('replaces rather than duplicates when a program is started twice in a day', () => {
    const again = openBlock(first, { program: IRON, startDate: '2026-01-04', trackId: 'board' }, '2026-01-04');
    expect(again).toHaveLength(1);
    expect(again[0]!.trackId).toBe('board');
    expect(again[0]!.endedAt).toBeNull();
  });

  it('closes the open one and leaves the closed ones alone', () => {
    const two = openBlock(first, { program: PEAK, startDate: '2026-02-01' }, '2026-02-01');
    const stopped = closeBlock(two, '2026-03-01', 'stopped');
    expect(stopped.filter((r) => r.endedAt === null)).toHaveLength(0);
    expect(stopped.find((r) => r.programId === 'iron_grip')!.endedAt).toBe('2026-02-01');
  });

  it('does nothing when nothing is open', () => {
    const closed = closeBlock(first, '2026-02-01', 'stopped');
    expect(closeBlock(closed, '2026-03-01', 'stopped')).toEqual(closed);
  });
});

describe('reading the history back', () => {
  const rows: BlockRecord[] = [
    { id: 'a#2026-01-04', programId: 'a', name: 'A', startDate: '2026-01-04', weeks: 12, endedAt: '2026-03-01' },
    { id: 'b#2026-03-01', programId: 'b', name: 'B', startDate: '2026-03-01', weeks: 12, endedAt: null },
  ];

  it('puts the newest first', () => {
    expect(sortBlocks(rows).map((r) => r.programId)).toEqual(['b', 'a']);
    expect(sortBlocks([...rows].reverse()).map((r) => r.programId)).toEqual(['b', 'a']);
  });

  it('puts the later of two same-day blocks first', () => {
    // Switching programs the afternoon you started one. Nothing in the
    // record says which came first except its position — sorting on the id
    // put the one already abandoned on top.
    const sameDay = openBlock(
      openBlock([], { program: IRON, startDate: '2026-01-04' }, '2026-01-04'),
      { program: PEAK, startDate: '2026-01-04' },
      '2026-01-04',
    );
    expect(sortBlocks(sameDay).map((r) => r.programId)).toEqual(['peak_performance', 'iron_grip']);
  });

  it('finds one by id, and says so when there is none', () => {
    expect(findBlock(rows, 'a#2026-01-04')!.name).toBe('A');
    expect(findBlock(rows, 'nope')).toBeNull();
  });

  it('computes the window from the row, not from the program', () => {
    // A row outlives the program it names — a deleted custom one, or one
    // whose length has since been re-adapted.
    const { from, to } = rowWindow(rows[0]!);
    expect(from).toBe('2026-01-04');
    expect(to).toBe('2026-03-28');
  });
});

describe('what became of a block', () => {
  const row = (patch: Partial<BlockRecord>): BlockRecord => ({
    id: 'a#2026-01-04', programId: 'a', name: 'A', startDate: '2026-01-04', weeks: 12, endedAt: null, ...patch,
  });

  it('is running while it is open and inside its weeks', () => {
    expect(outcomeOf(row({}), '2026-02-01')).toBe('running');
    expect(outcomeOf(row({}), '2026-03-28')).toBe('running');
  });

  it('is completed once an open block runs past its last week', () => {
    // Nothing closes a row when its weeks expire — it stays open until the
    // climber starts something else — so reading the null alone reported
    // "Week 12 of 12, running" against a block that ended a month ago.
    expect(outcomeOf(row({}), '2026-03-29')).toBe('completed');
    expect(outcomeOf(row({}), '2026-09-01')).toBe('completed');
  });

  it('is completed when the climber was still on it at the end', () => {
    expect(outcomeOf(row({ endedAt: '2026-03-28' }), '2026-09-01')).toBe('completed');
    expect(outcomeOf(row({ endedAt: '2026-06-01' }), '2026-09-01')).toBe('completed');
  });

  it('is left when they stopped before the last day', () => {
    expect(outcomeOf(row({ endedAt: '2026-03-27' }), '2026-09-01')).toBe('left');
  });

  it('is unknown for a reconstructed row, whatever date it carries', () => {
    // The migration knows when a block started and not whether it was seen
    // through. Nothing may report it as either.
    expect(outcomeOf(row({ endedAt: '2026-03-28', reconstructed: true }), '2026-09-01')).toBe('unknown');
    expect(outcomeOf(row({ endedAt: '2026-01-10', reconstructed: true }), '2026-09-01')).toBe('unknown');
    expect(outcomeOf(row({ reconstructed: true }), '2026-09-01')).toBe('unknown');
  });

  it('counts the weeks actually stayed on it', () => {
    expect(weeksRun(row({ endedAt: '2026-01-04' }), '2026-09-01')).toBe(1);
    expect(weeksRun(row({ endedAt: '2026-01-11' }), '2026-09-01')).toBe(2);
    expect(weeksRun(row({ endedAt: '2026-03-28' }), '2026-09-01')).toBe(12);
    // Never past its own length, however long ago it was abandoned.
    expect(weeksRun(row({ endedAt: '2027-01-01' }), '2027-06-01')).toBe(12);
  });

  it('counts an open block up to today', () => {
    expect(weeksRun(row({}), '2026-01-18')).toBe(3);
  });
});

describe('reconstructing from the old shape', () => {
  const rebuild = (startDates: Record<string, string>, active: string | null) =>
    reconstructBlocks({
      startDates,
      activeProgramId: active,
      nameFor: (id) => ({ a: 'A', b: 'B' })[id],
      weeksFor: (id) => ({ a: 12, b: 8 })[id],
    });

  it('makes a row per program that was ever started', () => {
    const rows = rebuild({ a: '2026-01-04', b: '2026-04-05' }, 'b');
    expect(rows.map((r) => r.programId)).toEqual(['a', 'b']);
    expect(rows.every((r) => r.reconstructed === true)).toBe(true);
  });

  it('leaves the active one open', () => {
    const rows = rebuild({ a: '2026-01-04', b: '2026-04-05' }, 'b');
    expect(activeBlock(rows)!.programId).toBe('b');
  });

  it('closes an earlier one where the next one began', () => {
    // The one thing the old shape does tell us: you stopped running that
    // when you started this.
    const rows = rebuild({ a: '2026-01-04', b: '2026-02-01' }, 'b');
    expect(rows.find((r) => r.programId === 'a')!.endedAt).toBe('2026-01-31');
    expect(rows.find((r) => r.programId === 'a')!.reason).toBe('switched');
  });

  it('does not extend one past its own window', () => {
    const rows = rebuild({ a: '2026-01-04', b: '2027-01-03' }, 'b');
    expect(rows.find((r) => r.programId === 'a')!.endedAt).toBe('2026-03-28');
    expect(rows.find((r) => r.programId === 'a')!.reason).toBe('switched');
  });

  it('reports every reconstructed row as unknown rather than finished', () => {
    const rows = rebuild({ a: '2026-01-04', b: '2026-02-01' }, 'b');
    expect(rows.filter((r) => r.endedAt !== null).map((r) => outcomeOf(r, '2026-09-01'))).toEqual(['unknown']);
  });

  it('drops a program the app can no longer size', () => {
    const rows = reconstructBlocks({
      startDates: { gone: '2026-01-04', a: '2026-02-01' },
      activeProgramId: 'a',
      nameFor: () => undefined,
      weeksFor: (id) => (id === 'a' ? 12 : undefined),
    });
    expect(rows.map((r) => r.programId)).toEqual(['a']);
  });

  it('falls back to the id when the name is gone but the length is known', () => {
    const rows = reconstructBlocks({
      startDates: { forked: '2026-01-04' },
      activeProgramId: 'forked',
      nameFor: () => undefined,
      weeksFor: () => 6,
    });
    expect(rows[0]!.name).toBe('forked');
  });

  it('ignores a blank date rather than making a row for it', () => {
    expect(rebuild({ a: '', b: '2026-02-01' }, 'b').map((r) => r.programId)).toEqual(['b']);
  });

  it('makes nothing from nothing', () => {
    expect(rebuild({}, null)).toEqual([]);
  });
});
