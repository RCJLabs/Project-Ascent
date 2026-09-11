import { describe, expect, it } from 'vitest';
import { IRON_GRIP } from '@/content/programs/catalogue';
import { loadPrograms } from '@/content/programs';
import type { Program } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { addDays } from './dates';
import { blockWindow } from './plan';
import { blockEnd, describeBlockEnd, programForRecord } from './blockEnd';
import type { BlockRecord } from './blocks';

/**
 * The end of a block (PLAN.md M85).
 *
 * `plan.test.ts` holds the window and the fix to the clamp. These hold what
 * the app says once it knows the block is over — and that the two things it
 * had already authored for this moment, the graduation line and the next
 * programs, actually arrive.
 */

const START = '2026-03-09';
const { to: LAST } = blockWindow(IRON_GRIP, START);

let seq = 0;
const entry = (metricId: string, date: string, value: number): MetricEntry =>
  ({ id: `e${seq++}`, metricId, date, value, createdAt: `${date}T10:00:00.000Z` }) as MetricEntry;

const end = (entries: MetricEntry[] = [], today = addDays(LAST, 1), program: Program = IRON_GRIP) =>
  blockEnd({ program, startDate: START, entries, today });

describe('where the block is', () => {
  it('knows it has not started', () => {
    expect(end([], '2026-01-01').status.state).toBe('before');
    expect(describeBlockEnd(end([], '2026-01-01'))).toContain('has not started yet');
  });

  it('knows it is running, and says when it runs to', () => {
    const running = end([], addDays(LAST, -7));
    expect(running.status.state).toBe('running');
    expect(describeBlockEnd(running)).toContain(LAST);
  });

  it('knows it has ended, and how long ago', () => {
    expect(end([], addDays(LAST, 1)).status.state).toBe('ended');
    expect(describeBlockEnd(end([], addDays(LAST, 1)))).toContain('yesterday');
    expect(describeBlockEnd(end([], LAST))).toContain('runs to');
    expect(describeBlockEnd(end([], addDays(LAST, 40)))).toContain('6 weeks ago');
  });

  it('does not congratulate a block nobody trained', () => {
    // A climber who stopped in week six and let the calendar run out
    // arrives here too. Saying they finished it would be making it up.
    const text = describeBlockEnd(end([], addDays(LAST, 1)));
    expect(text).not.toMatch(/congratulat|well done|nice work|finished it/i);
    expect(text).toContain('between you and the log');
  });
});

describe('what the program already had to say', () => {
  it('carries its graduation line', () => {
    expect(end().graduation).toBe(IRON_GRIP.intro.graduation);
    expect(end().graduation.length).toBeGreaterThan(0);
  });

  it('carries every authored successor with its reason', async () => {
    await loadPrograms();
    const next = end().next;
    expect(next.length).toBe(IRON_GRIP.nextPrograms.length);
    expect(next.map((n) => n.program.id)).toEqual(IRON_GRIP.nextPrograms.map((n) => n.id));
    for (const step of next) expect(step.reason.length).toBeGreaterThan(0);
  });

  it('drops a successor the catalogue does not have rather than showing a dead end', async () => {
    await loadPrograms();
    const invented = {
      ...IRON_GRIP,
      nextPrograms: [
        { id: 'peak_performance', reason: 'real' },
        { id: 'never_shipped', reason: 'not real' },
      ],
    } as unknown as Program;
    const next = end([], addDays(LAST, 1), invented).next;
    expect(next.map((n) => n.program.id)).toEqual(['peak_performance']);
  });

  it('survives a program with no graduation line', () => {
    const bare = { ...IRON_GRIP, intro: { ...IRON_GRIP.intro, graduation: '' } } as Program;
    expect(end([], addDays(LAST, 1), bare).graduation).toBe('');
  });
});

describe('the retest you owe', () => {
  it('names the assessments with a baseline and no after', () => {
    const owed = end([
      entry('dead_hang', addDays(START, 1), 30),
      entry('dead_hang', addDays(START, 40), 42),
      entry('max_pullups', addDays(START, 1), 9),
    ]).owed;
    expect(owed.map((r) => r.metric.id)).toEqual(['max_pullups']);
  });

  it('says nothing for one never taken at all', () => {
    // Never tested is a different problem from owing a retest, and the
    // block report already counts it.
    const result = end([entry('dead_hang', addDays(START, 1), 30)]);
    expect(result.owed.map((r) => r.metric.id)).toEqual(['dead_hang']);
    expect(result.report!.untested).toBeGreaterThan(1);
  });

  it('is empty when every baseline got its retest', () => {
    expect(
      end([
        entry('dead_hang', addDays(START, 1), 30),
        entry('dead_hang', addDays(START, 40), 42),
      ]).owed,
    ).toEqual([]);
  });

  it('is empty for a program with no test weeks', () => {
    const mode = { ...IRON_GRIP, kind: 'mode' } as Program;
    const result = end([], addDays(LAST, 1), mode);
    expect(result.report).toBeNull();
    expect(result.owed).toEqual([]);
  });
});

describe('describing a past block (PLAN.md M87)', () => {
  const row = (patch: Partial<BlockRecord> = {}): BlockRecord => ({
    id: `iron_grip#${START}`,
    programId: 'iron_grip',
    name: 'Iron Grip',
    startDate: START,
    weeks: IRON_GRIP.weeks,
    endedAt: LAST,
    ...patch,
  });

  const forRow = (r: BlockRecord) =>
    blockEnd({ program: IRON_GRIP, startDate: r.startDate, entries: [], today: addDays(LAST, 30), record: r });

  it('reads the outcome from the record, not from the calendar', () => {
    expect(forRow(row()).outcome).toBe('completed');
    expect(forRow(row({ endedAt: addDays(LAST, -40) })).outcome).toBe('left');
    expect(forRow(row({ reconstructed: true })).outcome).toBe('unknown');
  });

  it('does not tell a climber who walked away that it ran out on them', () => {
    const text = describeBlockEnd(forRow(row({ endedAt: addDays(START, 20) })));
    // Twenty days past a Monday start is day 21 of the block's week, which
    // is the start of week four.
    expect(text).toContain('You left Iron Grip after 4 of its 12 weeks');
    expect(text).toContain('not a verdict');
    expect(text).not.toContain('ran out');
  });

  it('admits it does not know how a reconstructed block ended', () => {
    const text = describeBlockEnd(forRow(row({ reconstructed: true })));
    expect(text).toContain('no record of how it ended');
    expect(text).not.toContain('ran out');
  });

  it('still says it ran out when the climber was on it at the end', () => {
    expect(describeBlockEnd(forRow(row()))).toContain('ran out');
  });

  it('assumes the live block ran out rather than was left', () => {
    // Without a record there is nothing to say otherwise, and the live
    // block is by definition one the climber is still on.
    expect(blockEnd({ program: IRON_GRIP, startDate: START, entries: [], today: addDays(LAST, 1) }).outcome).toBe('completed');
    expect(blockEnd({ program: IRON_GRIP, startDate: START, entries: [], today: LAST }).outcome).toBe('running');
  });
});

describe('the program a past block ran', () => {
  it('is the written one when the block ran it at full length', async () => {
    await loadPrograms();
    const found = programForRecord({
      id: 'x', programId: 'iron_grip', name: 'Iron Grip', startDate: START, weeks: IRON_GRIP.weeks, endedAt: LAST,
    });
    expect(found!.weeks).toBe(IRON_GRIP.weeks);
  });

  it('is adapted back to the length the block actually ran', async () => {
    // M56 stores one length per program, so the current setting would
    // describe an eight-week block as twelve.
    await loadPrograms();
    const found = programForRecord({
      id: 'x', programId: 'iron_grip', name: 'Iron Grip', startDate: START, weeks: 8, endedAt: LAST,
    });
    expect(found!.weeks).toBe(8);
  });

  it('is null for a program the app no longer has', () => {
    expect(programForRecord({
      id: 'x', programId: 'deleted_fork', name: 'Gone', startDate: START, weeks: 12, endedAt: LAST,
    })).toBeNull();
  });
});
