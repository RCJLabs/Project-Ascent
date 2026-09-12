import { describe, expect, it } from 'vitest';
import { newSession, type Climb, type Session } from '@/db/sessions';
import { describeLadders, ladders, THIN_SENDS } from './ladders';

/**
 * Indoor and outdoor are two ladders (PLAN.md M106).
 *
 * The comparison every climber makes out loud, and the one the app computed
 * nowhere: `progress.ts` does not mention `mode`.
 */

const climb = (grade: string, count = 1, patch: Partial<Climb> = {}): Climb => ({
  id: `c-${grade}-${Math.random()}`,
  grade,
  scale: grade.startsWith('V') ? 'V' : 'YDS',
  count,
  result: 'send',
  ...patch,
});

const day = (date: string, mode: 'indoor' | 'outdoor', climbs: Climb[], patch: Partial<Session> = {}): Session =>
  newSession(date, 0, { completed: true, mode, climbs, ...patch });

/** n sends of one grade, spread one per day so coverage is real. */
const runOf = (grade: string, n: number, mode: 'indoor' | 'outdoor', from = 1): Session[] =>
  Array.from({ length: n }, (_, i) =>
    day(`2026-01-${String(from + i).padStart(2, '0')}`, mode, [climb(grade)]),
  );

const read = (sessions: Session[]) => ladders(sessions, 'V');

describe('two tallies, kept apart', () => {
  it('puts each climb on the ladder its session was on', () => {
    const out = read([
      day('2026-01-01', 'indoor', [climb('V6')]),
      day('2026-01-02', 'outdoor', [climb('V4')]),
    ]);
    expect(out.indoor.tally.best).toBe('V6');
    expect(out.outdoor.tally.best).toBe('V4');
  });

  it('counts the days each way, not only the sends', () => {
    const out = read([
      day('2026-01-01', 'indoor', [climb('V4'), climb('V5')]),
      day('2026-01-01', 'indoor', [climb('V3')], { id: '2026-01-01#1' }),
      day('2026-01-02', 'outdoor', [climb('V2')]),
    ]);
    expect(out.indoor.days).toBe(1);
    expect(out.outdoor.days).toBe(1);
    expect(out.indoor.tally.totalSends).toBe(3);
  });

  it('ignores the other scale entirely', () => {
    const out = read([day('2026-01-01', 'outdoor', [climb('5.12a'), climb('V4')])]);
    expect(out.outdoor.tally.totalSends).toBe(1);
    expect(out.outdoor.tally.best).toBe('V4');
  });

  it('reads a session that was never finished as nothing', () => {
    const out = read([day('2026-01-01', 'outdoor', [climb('V8')], { completed: false })]);
    expect(out.outdoor.tally.best).toBeNull();
  });

  // A day you turned up and tried counts as a day on that ladder only if
  // something was logged on it.
  it('does not count a day with nothing on this ladder', () => {
    expect(read([day('2026-01-01', 'outdoor', [climb('5.11a')])]).outdoor.days).toBe(0);
  });
});

describe('the gap, which is a count of rungs and nothing else', () => {
  it('counts the rungs between the two bests', () => {
    const out = read([...runOf('V6', 6, 'indoor'), ...runOf('V4', 6, 'outdoor', 10)]);
    expect(out.gap).toBe(2);
  });

  it('goes the other way when rock is the harder one', () => {
    const out = read([...runOf('V3', 6, 'indoor'), ...runOf('V5', 6, 'outdoor', 10)]);
    expect(out.gap).toBe(-2);
  });

  it('is nothing at all with only one ladder climbed', () => {
    expect(read(runOf('V5', 6, 'indoor')).gap).toBeNull();
    expect(read([]).gap).toBeNull();
  });
});

describe('what it says', () => {
  const say = (sessions: Session[]) => describeLadders(read(sessions));

  it('says nothing with nothing logged', () => {
    expect(say([])).toBeNull();
  });

  it('names both bests and what each rests on', () => {
    const out = say([...runOf('V6', 8, 'indoor'), ...runOf('V4', 6, 'outdoor', 10)]);
    expect(out).toMatch(/V6 indoors from 8 sends/);
    expect(out).toMatch(/V4 on rock from 6 sends/);
    expect(out).toMatch(/2 rungs apart, harder indoors/);
  });

  /**
   * The "Never" of the milestone, held as a test: no conversion, and no
   * verdict. Some of the gap is a soft gym, some is fear, some is one
   * outdoor day a year, and the log says which of those it is never.
   */
  it('converts nothing and blames nobody', () => {
    const out = say([...runOf('V8', 8, 'indoor'), ...runOf('V3', 8, 'outdoor', 10)])!;
    expect(out).not.toMatch(/equivalent|equals|worth|really a|weak|soft|sandbag|should|need to|problem/i);
    expect(out).toMatch(/the log cannot say/);
  });

  // "Two grades harder indoors" from four outdoor sends is a coincidence
  // with a decimal point.
  it('refuses to read a gap off too few sends, and says so', () => {
    const out = say([...runOf('V6', 8, 'indoor'), ...runOf('V4', THIN_SENDS - 1, 'outdoor', 10)])!;
    expect(out).toMatch(/Too little on rock to read a gap from/);
    expect(out).not.toMatch(/rungs apart/);
    // And the counts are still there, because the count is the finding.
    expect(out).toMatch(/V4 on rock from 4 sends/);
  });

  it('names the thin side, whichever it is', () => {
    const out = say([...runOf('V6', THIN_SENDS - 1, 'indoor'), ...runOf('V4', 8, 'outdoor', 10)])!;
    expect(out).toMatch(/Too little indoors/);
  });

  it('reads a gap once both sides are thick enough', () => {
    const out = say([...runOf('V6', THIN_SENDS, 'indoor'), ...runOf('V4', THIN_SENDS, 'outdoor', 10)])!;
    expect(out).toMatch(/rungs apart/);
  });

  it('says the two are level rather than nought rungs apart', () => {
    const out = say([...runOf('V5', 8, 'indoor'), ...runOf('V5', 8, 'outdoor', 10)])!;
    expect(out).toMatch(/the same rung on both ladders/);
    expect(out).not.toMatch(/0 rungs/);
  });

  it('counts one rung in the singular', () => {
    const out = say([...runOf('V6', 8, 'indoor'), ...runOf('V5', 8, 'outdoor', 10)])!;
    expect(out).toMatch(/1 rung apart/);
  });

  it('says there is only one ladder when nothing is on rock', () => {
    expect(say(runOf('V5', 8, 'indoor'))).toMatch(/Nothing sent on rock yet/);
  });

  it('reads the rock on its own when nothing is indoors', () => {
    const out = say(runOf('V5', 8, 'outdoor'))!;
    expect(out).toMatch(/V5 on rock, from 8 sends over 8 days/);
    expect(out).toMatch(/Nothing logged indoors/);
  });
});
