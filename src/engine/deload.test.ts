import { beforeEach, describe, expect, it } from 'vitest';
import { getProgram, loadPrograms } from '@/content/programs';
import type { BlockRecord } from './blocks';
import { addDays, blockStart, daysBetween, programWeek, startOfWeek } from './dates';
import { clearDeloadCache, deloadDatesFor } from './deload';
import { NO_DELOAD, clearClimberStateCache, deriveClimberState } from './derive';

/**
 * Which days are in a planned deload week (PLAN.md M306).
 *
 * The property that matters is agreement: a deload week is a *program* week,
 * so this set has to hold exactly the days `programWeek` puts in one. The
 * rest is about what a block record remembers — how long it was set to run,
 * and when it stopped.
 */

/** Iron Grip: twelve weeks, deloads in four and eight. */
const row = (patch: Partial<BlockRecord> = {}): BlockRecord => ({
  id: 'iron_grip#2026-06-21',
  programId: 'iron_grip',
  name: 'Iron Grip',
  startDate: '2026-06-21',
  weeks: 12,
  endedAt: null,
  ...patch,
});

beforeEach(async () => {
  await loadPrograms();
  clearDeloadCache();
});

describe('the days a block spends in a deload week', () => {
  it('holds exactly the days the program week numbering does', async () => {
    const block = row();
    const program = getProgram('iron_grip')!;
    const dates = deloadDatesFor([block]);
    const from = blockStart(block.startDate);
    const to = addDays(from, block.weeks * 7 - 1);
    let checked = 0;
    for (let i = 0; i <= daysBetween(from, to); i++) {
      const date = addDays(from, i);
      const week = programWeek(block.startDate, date, block.weeks);
      const planned = week !== null && (program.deloadWeeks ?? []).includes(week);
      expect(dates.has(date), `${date} (week ${week})`).toBe(planned);
      checked += 1;
    }
    expect(checked).toBe(84);
    expect(dates.size).toBe(14);
  });

  /**
   * `blockStart`, not `startOfWeek`.
   *
   * A start that is not a Sunday belongs to no week at all until the Sunday
   * after it (M259), so week four begins a week later than a naive
   * `startOfWeek` would put it. `blocks.rowWindow` uses `startOfWeek` and
   * says *"The arithmetic is the same and deliberately so"* — it is not, and
   * following it here would have put every deload day seven days early.
   */
  it('counts weeks from the first whole one, not from the Sunday behind the start', () => {
    const thursday = '2026-06-25';
    expect(startOfWeek(thursday)).not.toBe(blockStart(thursday));
    const dates = deloadDatesFor([row({ startDate: thursday })]);
    const week4 = addDays(blockStart(thursday), 21);
    expect(dates.has(week4)).toBe(true);
    expect(dates.has(addDays(week4, -7))).toBe(false);
  });

  it('stops at the day the block stopped', () => {
    // Left in week five: week eight is a plan nobody was following.
    const left = deloadDatesFor([row({ endedAt: addDays(blockStart('2026-06-21'), 34) })]);
    expect(left.size).toBe(7);
    expect([...left].every((d) => d < addDays(blockStart('2026-06-21'), 49))).toBe(true);
  });

  it('counts the weeks the row was set to run, not the ones the program lists', () => {
    // Adapted to six weeks, so week eight never arrives.
    expect(deloadDatesFor([row({ weeks: 6 })]).size).toBe(7);
  });

  it('is empty for a program that plans no deload', () => {
    expect(deloadDatesFor([row({ programId: 'trip_prep', weeks: 6 })]).size).toBe(0);
  });

  it('is empty for a program the app no longer has', () => {
    // A custom program the climber deleted: the row outlives it, and a
    // history row is not a reason to guess at a plan.
    expect(deloadDatesFor([row({ programId: 'custom_gone' })]).size).toBe(0);
  });

  it('adds up every block the climber has run', () => {
    const two = deloadDatesFor([row(), row({ id: 'b', startDate: '2026-01-04' })]);
    expect(two.size).toBe(28);
  });
});

describe('the identity the derive cache keys on', () => {
  it('hands the same set back for the same array', () => {
    const blocks = [row()];
    expect(deloadDatesFor(blocks)).toBe(deloadDatesFor(blocks));
  });

  it('recomputes when the blocks change', () => {
    const first = deloadDatesFor([row()]);
    const second = deloadDatesFor([row(), row({ id: 'b', startDate: '2026-01-04' })]);
    expect(first).not.toBe(second);
    expect(second.size).toBeGreaterThan(first.size);
  });

  /**
   * The one that makes the wiring pay.
   *
   * `deriveClimberState` resolves an omitted `deloadDates` to `NO_DELOAD`,
   * so a climber with no block has to get that exact set rather than a fresh
   * empty one — otherwise every call site that asks is a cache miss, which
   * is the thing `oneDerivation.test.tsx` measures.
   */
  it('gives a climber with nothing to deload the set derive defaults to', () => {
    expect(deloadDatesFor([])).toBe(NO_DELOAD);
    expect(deloadDatesFor([row({ programId: 'trip_prep', weeks: 6 })])).toBe(NO_DELOAD);
  });

  /** And the half of that claim that lives in `derive.ts`. */
  it('costs a climber with no block nothing to ask', () => {
    const sessions: never[] = [];
    clearClimberStateCache();
    const bare = deriveClimberState(sessions, { today: '2026-09-21' });
    const asked = deriveClimberState(sessions, {
      today: '2026-09-21',
      deloadDates: deloadDatesFor([]),
    });
    expect(asked).toBe(bare);
  });
});
