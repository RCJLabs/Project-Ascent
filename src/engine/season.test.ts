import { describe, expect, it } from 'vitest';
import type { ProgramId } from '@/content/types';
import { getProgram } from '@/content/programs';
import { addDays, daysBetween, startOfWeek } from './dates';
import { MAX_RUNWAY_WEEKS, peakPlan } from './peak';
import { describeSeason, MAX_BLOCKS, season, wantsSeason } from './season';

/**
 * A season, as a sequence of blocks (PLAN.md M109).
 *
 * `peak.ts` withholds the runway past twelve weeks with "pick a program for
 * the first part of it and come back when the trip is closer" — an
 * instruction the app gave and could not help with.
 */

const TODAY = '2026-01-05'; // A Monday.
const read = (programIds: string[], targetDate: string, adaptations?: Record<string, number>) =>
  season({ programIds: programIds as ProgramId[], targetDate, today: TODAY, ...(adaptations ? { adaptations } : {}) });

/**
 * A target date with exactly `n` weeks of runway to it, counting this week.
 *
 * Written against `weeksTo`, which the reading and the decision to show it
 * both use — they were two separate calculations disagreeing by a week
 * until a surviving mutation on the seam exposed it.
 */
const inWeeks = (n: number) => addDays(startOfWeek(TODAY), n * 7 - 1);

describe('dating a sequence backwards from the target', () => {
  it('ends the last block on the target week', () => {
    const s = read(['iron_grip'], inWeeks(12));
    expect(s.blocks).toHaveLength(1);
    expect(s.blocks[0]!.to).toBe(addDays(startOfWeek(inWeeks(12)), 6));
    expect(s.runway).toBe(12);
  });

  // A block is as long as it says it is. Both ends moving together keeps
  // the blocks butted against each other while every one of them is a day
  // too long.
  it('gives each block exactly the days its weeks are worth', () => {
    for (const block of read(['base_camp', 'iron_grip'], inWeeks(24)).blocks) {
      expect(daysBetween(block.from, block.to) + 1).toBe(block.weeks * 7);
    }
  });

  it('butts each block against the next', () => {
    const s = read(['base_camp', 'iron_grip'], inWeeks(24));
    const [first, second] = s.blocks;
    expect(addDays(first!.to, 1)).toBe(second!.from);
  });

  it('keeps the order it was given', () => {
    const s = read(['base_camp', 'iron_grip'], inWeeks(24));
    expect(s.blocks.map((b) => b.programId)).toEqual(['base_camp', 'iron_grip']);
  });

  it('adds the weeks up', () => {
    const s = read(['base_camp', 'iron_grip'], inWeeks(24));
    expect(s.weeks).toBe(getProgram('base_camp' as ProgramId)!.weeks + getProgram('iron_grip' as ProgramId)!.weeks);
  });

  it('drops a program the catalogue does not have', () => {
    expect(read(['iron_grip', 'no_such_program'], inWeeks(24)).blocks.map((b) => b.programId)).toEqual([
      'iron_grip',
    ]);
  });

  // More is a plan nobody keeps.
  it('takes no more blocks than it will hold', () => {
    // Every id here resolves, or the cap is not what is being tested.
    const many = ['base_camp', 'iron_grip', 'trip_prep', 'lockdown', 'the_siege'];
    expect(many.every((id) => getProgram(id as ProgramId) !== undefined)).toBe(true);
    expect(read(many, inWeeks(80)).blocks).toHaveLength(MAX_BLOCKS);
  });

  it('says nothing about a sequence of nothing', () => {
    const s = read([], inWeeks(24));
    expect(s.blocks).toEqual([]);
    expect(describeSeason(s)).toBeNull();
  });
});

describe('a block runs at the length this climber runs it', () => {
  it('uses the length they already chose', () => {
    const s = read(['iron_grip'], inWeeks(24), { iron_grip: 8 });
    expect(s.blocks[0]!.weeks).toBe(8);
    expect(s.blocks[0]!.program.weeks).toBe(8);
  });

  it('uses the program\'s own length when they have chosen none', () => {
    const s = read(['iron_grip'], inWeeks(24));
    expect(s.blocks[0]!.weeks).toBe(getProgram('iron_grip' as ProgramId)!.weeks);
  });

  it('ignores a nonsense adaptation rather than running a zero-week block', () => {
    expect(read(['iron_grip'], inWeeks(24), { iron_grip: 0 }).blocks[0]!.weeks).toBe(
      getProgram('iron_grip' as ProgramId)!.weeks,
    );
  });
});

describe('whether it fits, said rather than fixed', () => {
  it('reports the weeks it is short by', () => {
    // Two twelve-week blocks into sixteen weeks of runway.
    const s = read(['base_camp', 'iron_grip'], inWeeks(16));
    expect(s.over).toBe(8);
    expect(s.slack).toBe(0);
  });

  it('reports the room left over', () => {
    const s = read(['iron_grip'], inWeeks(20));
    expect(s.slack).toBe(8);
    expect(s.over).toBe(0);
  });

  /**
   * The two numbers in the sentence and the shortfall between them have to
   * agree. They did not: the shortfall was taken from the week-aligned
   * block dates while the runway came from `peak.ts`, and the card read
   * "24 weeks against 16 weeks — that is 7 weeks more than there is room
   * for".
   */
  it('has arithmetic a reader can check', () => {
    for (const n of [4, 10, 16, 24, 30]) {
      const s = read(['base_camp', 'iron_grip'], inWeeks(n));
      expect(s.weeks - s.runway, `${n} weeks out`).toBe(s.over - s.slack);
    }
  });

  it('is neither over nor slack when it starts this week', () => {
    const s = read(['iron_grip'], inWeeks(12));
    expect([s.over, s.slack]).toEqual([0, 0]);
  });

  /**
   * Shrinking a twelve-week block to seven changes the training.
   * `StartProgramPage` already makes that the climber's choice, with the
   * lengths the program actually supports.
   */
  it('never shortens a block to make it fit', () => {
    const s = read(['base_camp', 'iron_grip'], inWeeks(4));
    expect(s.blocks.map((b) => b.weeks)).toEqual([
      getProgram('base_camp' as ProgramId)!.weeks,
      getProgram('iron_grip' as ProgramId)!.weeks,
    ]);
  });
});

describe('which block is when', () => {
  it('calls a block that has not started future', () => {
    expect(read(['iron_grip'], inWeeks(20)).blocks[0]!.when).toBe('future');
  });

  it('calls the block covering this week running', () => {
    expect(read(['iron_grip'], inWeeks(12)).blocks[0]!.when).toBe('running');
  });

  it('calls a block that ended before this week past', () => {
    const s = read(['base_camp', 'iron_grip'], inWeeks(4));
    expect(s.blocks[0]!.when).toBe('past');
    expect(s.blocks[1]!.when).toBe('running');
  });
});

describe('what it says', () => {
  it('names the sequence and both totals', () => {
    const out = describeSeason(read(['base_camp', 'iron_grip'], inWeeks(24)))!;
    expect(out).toMatch(/Base Camp → Iron Grip is 24 weeks against 24 weeks to the day/);
  });

  it('says how far short it is, and whose decision the fix is', () => {
    const out = describeSeason(read(['base_camp', 'iron_grip'], inWeeks(16)))!;
    expect(out).toMatch(/8 weeks more than there is room for/);
    expect(out).toMatch(/run one of them shorter from its own page/);
  });

  it('says what the spare weeks are for, without filling them', () => {
    const out = describeSeason(read(['iron_grip'], inWeeks(20)))!;
    expect(out).toMatch(/8 weeks spare before it starts/);
    expect(out).toMatch(/nothing in particular/);
  });

  it('counts one week in the singular', () => {
    expect(describeSeason(read(['iron_grip'], inWeeks(13)))).toMatch(/1 week spare/);
  });

  // It is an intention. `Objective.targetDate` is documented as "not a
  // deadline that can be failed", and this is the same date.
  it('never calls a season missed or late', () => {
    const out = describeSeason(read(['base_camp', 'iron_grip'], inWeeks(2)))!;
    expect(out).not.toMatch(/missed|failed|behind|too late|overdue/i);
  });
});

describe('when a season is the question at all', () => {
  it('is not, inside the runway the peak plan covers', () => {
    expect(wantsSeason(inWeeks(MAX_RUNWAY_WEEKS), TODAY)).toBe(false);
    expect(wantsSeason(inWeeks(MAX_RUNWAY_WEEKS - 1), TODAY)).toBe(false);
  });

  /**
   * The season appears exactly where the peak plan withholds. Three
   * calculations of "weeks away" existed at one point — peak's, the
   * season's reading, and the season's own gate — and two of them
   * disagreeing by one put both cards on screen together for a week.
   */
  it('asks the same question the peak plan asks', () => {
    for (let n = 1; n <= 20; n += 1) {
      const target = inWeeks(n);
      const peak = peakPlan({ target, from: TODAY, sessions: [] });
      expect(wantsSeason(target, TODAY), `${n} weeks out`).toBe(peak.withheld === 'too-far');
      if (peak.withheld !== 'past') {
        expect(read(['iron_grip'], target).runway, `${n} weeks out`).toBe(peak.runway);
      }
    }
  });

  it('is, past it — which is where the peak plan withholds', () => {
    expect(wantsSeason(inWeeks(MAX_RUNWAY_WEEKS + 1), TODAY)).toBe(true);
  });

  it('is not for a date already gone, however long ago', () => {
    expect(wantsSeason(addDays(TODAY, -30), TODAY)).toBe(false);
    // Far enough back that its *distance* clears the seam: a season is
    // about a date ahead, and the sign is the whole question.
    expect(wantsSeason(addDays(TODAY, -180), TODAY)).toBe(false);
  });
});
