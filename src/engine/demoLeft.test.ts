import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import { demoProgramIds } from '@/db/demo';
import { blockAdherence } from './adherence';
import { blockEnd, describeBlockEnd } from './blockEnd';
import { addDays, dayOfWeek } from './dates';
import { demoClimber, DEMO_PROGRAM_ID } from './demoClimber';
import { isRestSession } from './rest';

/**
 * The block the sample climber left (PLAN.md M372).
 *
 * The review of a block left early — measured to the day it was left, with
 * *"Ran to"* at the top (M365) — was on no screen the sample climber could
 * open. These hold the block that puts it there: the first run of their own
 * program, five weeks in, ended by the week they took off to move house.
 */

/** A Sunday through the Saturday after it, so every weekday is a `today`. */
const WEEK = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'];

describe('the block', () => {
  it('is the first run of their own program, stopped after five of its eight weeks', () => {
    for (const today of WEEK) {
      const made = demoClimber(today);
      const [left, finished] = made.blocks;
      expect(made.blocks, today).toHaveLength(2);
      expect(left, today).toMatchObject({ programId: DEMO_PROGRAM_ID, name: 'My winter block', weeks: 8, reason: 'stopped' });
      expect(left!.id, today).toBe(`${DEMO_PROGRAM_ID}#${left!.startDate}`);
      expect(dayOfWeek(left!.startDate), today).toBe(0);
      expect(left!.endedAt, today).toBe(addDays(left!.startDate, 34));
      // Oldest first, and the second run is the one that went to the end.
      expect(left!.startDate < finished!.startDate, today).toBe(true);
      expect(finished!.reason, today).toBe('ran-out');
    }
  });

  it('ends the day before the week off begins', () => {
    for (const today of WEEK) {
      const made = demoClimber(today);
      const away = made.away[0]!;
      // The Saturday, then the Sunday nothing was logged on, then the move.
      expect(addDays(made.blocks[0]!.endedAt!, 2), today).toBe(away.from);
      expect(made.sessions.some((s) => s.date > made.blocks[0]!.endedAt! && s.date < away.from), today).toBe(false);
    }
  });

  /**
   * Its types are drawn for the first time here, and their icons were the
   * words *grid* and *repeat*, printed beside each name. The builder only
   * offers pictures, so a written program never holds a word.
   */
  it('draws its types with pictures, as the builder would have written them', () => {
    for (const type of demoClimber('2026-09-22').program.sessionTypes) {
      expect(type.icon, type.id).toMatch(/^\p{Extended_Pictographic}/u);
      expect(type.icon, type.id).not.toMatch(/[a-z]/i);
    }
  });

  it('plans the week the climber already trained', () => {
    const left = demoClimber('2026-09-22').blocks[0]!;
    expect(left.plan).toEqual({ 1: 'own_board', 3: 'own_volume', 5: 'own_volume' });
    const types = demoClimber('2026-09-22').program.sessionTypes.map((t) => t.id);
    for (const id of Object.values(left.plan!)) expect(types).toContain(id);
  });

  /**
   * The clear unpicks every program a sample block names, by id (M282), so
   * a catalogue program here would take a climber's own blocks of it along.
   */
  it('adds no program for the clear to unpick', () => {
    expect(demoProgramIds('2026-09-22').sort()).toEqual([DEMO_PROGRAM_ID, 'iron_grip'].sort());
  });
});

describe('its review', () => {
  for (const today of WEEK) {
    it(`counts the sessions of the weeks it ran, on ${today}`, () => {
      const made = demoClimber(today);
      const left = made.blocks[0]!;
      const score = blockAdherence({
        program: made.program,
        startDate: left.startDate,
        plan: left.plan!,
        sessions: made.sessions,
        away: made.away,
        today,
        until: left.endedAt!,
      })!;
      expect(score.through).toBe(left.endedAt);
      expect(score.weeks).toBe(5);
      // Fifteen placed, on the days the climber trained anyway; the route
      // nights, on the weeks there was one, are unplanned.
      expect([score.planned, score.done]).toEqual([15, 15]);
      const nights = made.sessions.filter(
        (s) => s.date >= left.startDate && s.date <= left.endedAt! && s.sessionTypeId === undefined && !isRestSession(s),
      );
      expect(nights.length).toBeGreaterThan(0);
      expect(nights.every((s) => s.programId === made.program.id && s.planned === false)).toBe(true);
      expect(score.unplanned).toBe(nights.length);
    });
  }

  it('says it was left, and when', () => {
    const made = demoClimber('2026-09-22');
    const left = made.blocks[0]!;
    const end = blockEnd({ program: made.program, startDate: left.startDate, entries: made.metrics, today: '2026-09-22', record: left })!;
    const text = describeBlockEnd(end, { sessions: true, numbers: false, next: false });
    expect(text).toMatch(/^You left My winter block after 5 of its 8 weeks\./);
  });
});

describe('the catalogue', () => {
  it('still holds the program the running block is on', () => {
    // Guards the `!` this file's fixture leans on.
    expect(getProgram('iron_grip')).toBeTruthy();
  });
});

/**
 * The run that went to the end, given the same treatment (PLAN.md M376):
 * its plan on the row and its sessions stamped from it, so its review counts
 * them rather than saying one sentence beside the first run's full one.
 */
describe('the run to the end', () => {
  it('carries the same plan as the run they left', () => {
    const [left, finished] = demoClimber('2026-09-22').blocks;
    expect(finished!.plan).toEqual(left!.plan);
  });

  for (const today of WEEK) {
    it(`counts its eight weeks, short where a week was, on ${today}`, () => {
      const made = demoClimber(today);
      const finished = made.blocks[1]!;
      const score = blockAdherence({
        program: made.program, startDate: finished.startDate, plan: finished.plan!,
        sessions: made.sessions, away: made.away, today, until: finished.endedAt!,
      })!;
      const typed = made.sessions.filter(
        (s) => s.date >= finished.startDate && s.date <= finished.endedAt! && s.sessionTypeId !== undefined,
      );
      expect(score.weeks).toBe(8);
      expect(score.planned).toBe(24);
      // Every typed session was placed, and the weeks of two days are the
      // shortfall: a block kept, not a perfect one.
      expect(score.done).toBe(typed.length);
      expect(score.done).toBeLessThan(score.planned);
      expect(score.done).toBeGreaterThan(score.planned * 0.75);
    });
  }
});
