import { describe, expect, it } from 'vitest';
import type { Climb, Session } from '@/db/sessions';
import { addDays } from './dates';
import {
  BLOCK_DAYS,
  BLOCKS,
  ENOUGH_TRIES,
  biggestMover,
  conversionTrend,
  describeConversion,
  drawable,
  movers,
  shift,
  tooThin,
} from './conversion';

/**
 * Conversion, block by block (PLAN.md M83).
 *
 * The pyramid's `conversion` is an all-time snapshot. These hold the series
 * — and above all the gate, which is the whole reason the module exists: a
 * one-in-two that came from two tries is not a number.
 */

const TO = '2026-09-10';

/** `n` climbs at a grade, as one row with a count. */
const climbs = (grade: string, sends: number, attempts: number, scale: 'V' | 'YDS' = 'V'): Climb[] => [
  ...(sends > 0 ? [{ id: `s-${grade}-${sends}`, grade, scale, count: sends, result: 'send' as const }] : []),
  ...(attempts > 0
    ? [{ id: `a-${grade}-${attempts}`, grade, scale, count: attempts, result: 'attempt' as const }]
    : []),
];

const session = (date: string, rows: Climb[], patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 6,
    durationMin: 60,
    climbs: rows,
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

/** A day inside block `i`, counting from 0 as the oldest of BLOCKS. */
const inBlock = (i: number): string => addDays(TO, -(BLOCKS - 1 - i) * BLOCK_DAYS - 3);

const trend = (sessions: Session[], scale: 'V' | 'YDS' = 'V') =>
  conversionTrend({ sessions, scale, to: TO });

describe('the blocks', () => {
  it('run oldest first and end on the day asked for', () => {
    const t = trend([]);
    expect(t.edges.length).toBe(BLOCKS);
    expect(t.edges[BLOCKS - 1]!.to).toBe(TO);
    expect(t.edges[0]!.from).toBe(t.from);
    for (let i = 1; i < BLOCKS; i += 1) {
      expect(t.edges[i]!.from).toBe(addDays(t.edges[i - 1]!.to, 1));
    }
  });

  it('files a climb in the block its date falls in', () => {
    const t = trend([session(inBlock(2), climbs('V5', 3, 5))]);
    const row = t.grades.find((g) => g.grade === 'V5')!;
    expect(row.blocks[2]!.sends).toBe(3);
    expect(row.blocks[2]!.attempts).toBe(5);
    expect(row.blocks.filter((b) => b.sends + b.attempts > 0).length).toBe(1);
  });

  it('ignores anything before the window', () => {
    const before = addDays(addDays(TO, -(BLOCKS - 1) * BLOCK_DAYS - (BLOCK_DAYS - 1)), -1);
    expect(trend([session(before, climbs('V5', 9, 9))]).grades).toEqual([]);
  });

  it('ignores anything after it', () => {
    expect(trend([session(addDays(TO, 1), climbs('V5', 9, 9))]).grades).toEqual([]);
  });

  it('ignores a session that was never finished', () => {
    expect(trend([session(inBlock(3), climbs('V5', 9, 9), { completed: false })]).grades).toEqual([]);
  });

  it('keeps the two ladders apart', () => {
    const t = trend([
      session(inBlock(3), climbs('V5', 4, 4)),
      session(inBlock(3), climbs('5.11a', 9, 9, 'YDS')),
    ]);
    expect(t.grades.map((g) => g.grade)).toEqual(['V5']);
    expect(trend([session(inBlock(3), climbs('5.11a', 4, 4, 'YDS'))], 'YDS').grades.map((g) => g.grade)).toEqual(['5.11a']);
  });

  it('reads the scale on the climb, not the grade it happens to carry', () => {
    // The two checks look like one until a record disagrees with itself:
    // `{ scale: 'YDS', grade: 'V5' }` is on the boulder ladder by its text
    // and on the route ladder by its field, and only the field is a claim
    // the climber made. Dropping the scale check let it through, because
    // the ladder lookup afterwards was happy with the string.
    const confused = [
      { id: 'x', grade: 'V5', scale: 'YDS' as const, count: 9, result: 'send' as const },
    ];
    expect(trend([session(inBlock(3), confused)]).grades).toEqual([]);
  });

  it('drops a grade the ladder does not have, rather than sorting it to the bottom', () => {
    // What an older export or another app's vocabulary leaves behind.
    const t = trend([session(inBlock(3), climbs('V5', 4, 4)), session(inBlock(3), climbs('7c+', 9, 9))]);
    expect(t.grades.map((g) => g.grade)).toEqual(['V5']);
  });

  it('puts the hardest grade first', () => {
    const t = trend([
      session(inBlock(3), climbs('V3', 4, 4)),
      session(inBlock(3), climbs('V7', 1, 7)),
      session(inBlock(3), climbs('V5', 3, 5)),
    ]);
    expect(t.grades.map((g) => g.grade)).toEqual(['V7', 'V5', 'V3']);
  });
});

describe('the gate', () => {
  it('reports nothing for a block under the threshold', () => {
    const t = trend([session(inBlock(4), climbs('V5', 1, ENOUGH_TRIES - 2))]);
    const row = t.grades.find((g) => g.grade === 'V5')!;
    expect(row.blocks[4]!.conversion).toBeNull();
    expect(row.last).toBeNull();
  });

  it('reports a block that reaches it exactly', () => {
    const t = trend([session(inBlock(4), climbs('V5', 2, ENOUGH_TRIES - 2))]);
    const row = t.grades.find((g) => g.grade === 'V5')!;
    expect(row.blocks[4]!.conversion).toBeCloseTo(2 / ENOUGH_TRIES, 6);
  });

  it('counts a row by its count, not as one climb', () => {
    // A single logged row can carry six tries, which is why the threshold
    // is on tries rather than on rows.
    const t = trend([session(inBlock(4), climbs('V5', 6, 0))]);
    expect(t.grades[0]!.blocks[4]!.conversion).toBe(1);
  });

  it('still counts the tries of a block it will not report', () => {
    const t = trend([session(inBlock(1), climbs('V5', 1, 1))]);
    expect(t.grades[0]!.tries).toBe(2);
    expect(t.grades[0]!.blocks[1]!.conversion).toBeNull();
  });
});

describe('what moved', () => {
  /** Two reportable blocks at V5, `a` then `b` sends out of ten. */
  const across = (a: number, b: number) =>
    trend([
      session(inBlock(1), climbs('V5', a, 10 - a)),
      session(inBlock(4), climbs('V5', b, 10 - b)),
    ]);

  it('needs two reportable blocks before it says anything', () => {
    expect(movers(trend([session(inBlock(1), climbs('V5', 3, 7))]))).toEqual([]);
    expect(movers(across(1, 5)).map((g) => g.grade)).toEqual(['V5']);
  });

  it('measures from the earliest reportable block to the latest', () => {
    expect(shift(across(1, 5).grades[0]!)).toBeCloseTo(0.4, 6);
  });

  it('reports a fall as readily as a rise', () => {
    expect(shift(across(8, 2).grades[0]!)).toBeCloseTo(-0.6, 6);
    expect(biggestMover(across(8, 2))!.grade).toBe('V5');
  });

  it('picks the grade that moved furthest either way', () => {
    // The big mover is the *easier* grade, so it is not the first in the
    // hardest-first order either: taking the first mover rather than the
    // largest passed this test until it was written this way round.
    const t = trend([
      session(inBlock(1), climbs('V4', 8, 2)),
      session(inBlock(4), climbs('V4', 1, 9)),
      session(inBlock(1), climbs('V6', 5, 5)),
      session(inBlock(4), climbs('V6', 6, 4)),
    ]);
    expect(t.grades.map((g) => g.grade)).toEqual(['V6', 'V4']);
    expect(biggestMover(t)!.grade).toBe('V4');
  });

  it('has no mover when nothing has two blocks', () => {
    expect(biggestMover(trend([session(inBlock(1), climbs('V5', 3, 7))]))).toBeNull();
  });
});

describe('grades too thin to draw', () => {
  it('are separated from the ones with something to show', () => {
    const t = trend([
      session(inBlock(4), climbs('V5', 3, 7)),
      session(inBlock(4), climbs('V7', 0, 3)),
    ]);
    expect(drawable(t).map((g) => g.grade)).toEqual(['V5']);
    expect(tooThin(t).map((g) => g.grade)).toEqual(['V7']);
  });

  it('are not counted as thin when they were never touched at all', () => {
    expect(tooThin(trend([session(inBlock(4), climbs('V5', 3, 7))]))).toEqual([]);
  });

  const withThin = (thin: [string, number][]) =>
    describeConversion(
      trend([
        session(inBlock(1), climbs('V5', 1, 9)),
        session(inBlock(4), climbs('V5', 5, 5)),
        ...thin.map(([grade, tries]) => session(inBlock(4), climbs(grade, 0, tries))),
      ]),
    );

  it('are named in the sentence, with what they were tried', () => {
    const text = withThin([['V7', 4]]);
    expect(text).toContain('V7 is not drawn: 4 tries in six months');
    expect(text).toContain(`never ${ENOUGH_TRIES} inside one block`);
  });

  it('joins more than one into a list rather than a run of numbers', () => {
    // "V7 5 tries in six months" was the first wording, and a browser made
    // it obvious nobody could parse it.
    const text = withThin([
      ['V7', 4],
      ['V8', 2],
    ]);
    // Hardest first, like every other list here, so V8 leads.
    expect(text).toContain('V8 and V7 are not drawn: 2 and 4 tries in six months');
  });

  it('says try rather than tries for one', () => {
    expect(withThin([['V7', 1]])).toContain('1 try in six months');
  });

  it('say nothing when there are none', () => {
    const text = describeConversion(
      trend([session(inBlock(1), climbs('V5', 1, 9)), session(inBlock(4), climbs('V5', 5, 5))]),
    );
    expect(text).not.toContain('Not drawn');
  });
});

describe('what it says out loud', () => {
  const said = (sessions: Session[]) => describeConversion(trend(sessions));

  it('says so when nothing is logged', () => {
    expect(said([])).toContain('nothing to compare');
  });

  it('names the threshold rather than going quiet', () => {
    const text = said([session(inBlock(3), climbs('V5', 1, 1))]);
    expect(text).toContain(`${ENOUGH_TRIES} tries`);
    expect(text).toContain('2 across the whole six months');
  });

  it('says what is missing when only one block reaches the threshold', () => {
    const text = said([session(inBlock(3), climbs('V5', 4, 6))]);
    expect(text).toContain('nothing to compare it against yet');
  });

  it('prints the counts, never a bare rate', () => {
    // The whole objection to the proposed sentence: "one in two" over two
    // tries and over twenty are different claims.
    const text = said([
      session(inBlock(1), climbs('V5', 1, 9)),
      session(inBlock(4), climbs('V5', 5, 5)),
    ]);
    expect(text).toContain('1 from 10');
    expect(text).toContain('5 from 10');
    expect(text).not.toMatch(/\d+%/);
  });

  it('says up when it went up and down when it went down', () => {
    expect(
      said([session(inBlock(1), climbs('V5', 1, 9)), session(inBlock(4), climbs('V5', 5, 5))]),
    ).toContain('went up');
    expect(
      said([session(inBlock(1), climbs('V5', 8, 2)), session(inBlock(4), climbs('V5', 2, 8))]),
    ).toContain('went down');
  });

  it('does not call a rounding difference a move', () => {
    const text = said([
      session(inBlock(1), climbs('V5', 5, 5)),
      session(inBlock(4), climbs('V5', 5, 5)),
    ]);
    expect(text).toContain('is where it was');
  });

  it('says a fall is often a step up rather than a bad block', () => {
    const text = said([
      session(inBlock(1), climbs('V5', 8, 2)),
      session(inBlock(4), climbs('V5', 2, 8)),
    ]);
    expect(text).toContain('step up to a harder project');
  });

  it('labels the grade the way the climber reads grades', () => {
    const t = trend([
      session(inBlock(1), climbs('V5', 1, 9)),
      session(inBlock(4), climbs('V5', 5, 5)),
    ]);
    expect(describeConversion(t, { boulder: 'Font', route: 'YDS' })).not.toContain('V5');
    expect(describeConversion(t, { boulder: 'V', route: 'YDS' })).toContain('V5');
  });
});
