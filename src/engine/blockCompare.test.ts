import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import { BLOCK_DAYS, blockChanges, compareBlocks, describeBlocks } from './blockCompare';
import { CHANGE_ROWS } from './yearReview';

const TO = '2026-09-10';

const session = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 60,
    warmup: true,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

/** `count` sessions, one every `every` days, ending `endsAgo` days before TO. */
function run(count: number, every: number, endsAgo: number, patch: Partial<Session> = {}): Session[] {
  return Array.from({ length: count }, (_, i) =>
    session(addDays(TO, -(endsAgo + (count - 1 - i) * every)), patch),
  );
}

/**
 * `count` sessions spread across the earlier window, always including its
 * first day.
 *
 * The comparison is only offered when the log covers that window, so a
 * fixture that starts partway into it gets no comparison at all — which is
 * the rule working, not a bug, and cost several tests before this helper
 * existed.
 */
function earlier(count: number): Session[] {
  const first = BLOCK_DAYS * 2 - 1;
  const step = count <= 1 ? 0 : (BLOCK_DAYS - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) =>
    session(addDays(TO, -(first - Math.round(i * step)))),
  );
}

const build = (sessions: Session[], to = TO) => compareBlocks({ sessions, to });

describe('the two windows', () => {
  it('are four weeks each, back to back', () => {
    const c = build([]);
    expect(c.nowTo).toBe(TO);
    expect(c.nowFrom).toBe(addDays(TO, -(BLOCK_DAYS - 1)));
    expect(c.beforeTo).toBe(addDays(c.nowFrom, -1));
    expect(c.beforeFrom).toBe(addDays(c.beforeTo, -(BLOCK_DAYS - 1)));
  });

  it('do not overlap', () => {
    const c = build([]);
    expect(c.beforeTo < c.nowFrom).toBe(true);
  });

  it('take the end day rather than reading the clock', () => {
    expect(build([], '2020-02-29').nowTo).toBe('2020-02-29');
  });
});

describe('whether a comparison is offered at all', () => {
  it('declines when the log does not cover the earlier window', () => {
    // A climber who installed the app five weeks ago has an earlier window
    // that is mostly days before they arrived, and comparing against it
    // would report the act of installing as a training improvement.
    const c = build(run(10, 2, 0));
    expect(c.before).toBeNull();
    expect(blockChanges(c)).toEqual([]);
  });

  it('declines for an empty log', () => {
    const c = build([]);
    expect(c.before).toBeNull();
    expect(c.historyDays).toBe(0);
  });

  it('offers one once the log reaches back past the earlier window', () => {
    const c = build([session(addDays(TO, -(BLOCK_DAYS * 2 - 1))), ...run(8, 3, 0)]);
    expect(c.before).not.toBeNull();
  });

  it('does not count an uncompleted session as history', () => {
    const c = build([
      session(addDays(TO, -100), { completed: false }),
      ...run(6, 2, 0),
    ]);
    expect(c.before).toBeNull();
  });

  it('reports how much of the earlier window it has', () => {
    const c = build([session(addDays(TO, -40)), ...run(4, 2, 0)]);
    expect(c.coveredDays).toBeGreaterThan(0);
    expect(c.coveredDays).toBeLessThan(BLOCK_DAYS);
  });
});

describe('the totals', () => {
  it('counts each window separately', () => {
    const c = build([...run(4, 5, 0), ...earlier(9)]);
    expect(c.now.sessions).toBe(4);
    expect(c.before?.sessions).toBe(9);
  });

  it('puts a session on the boundary in the right window', () => {
    const c = build([
      session(addDays(TO, -(BLOCK_DAYS - 1))),
      session(addDays(TO, -BLOCK_DAYS)),
      session(addDays(TO, -(BLOCK_DAYS * 2 - 1))),
    ]);
    expect(c.before).not.toBeNull();
    expect(c.now.sessions).toBe(1);
    expect(c.before?.sessions).toBe(2);
  });

  it('ignores anything older than both windows', () => {
    const c = build([session('2019-01-01'), ...run(3, 2, 0), ...earlier(3)]);
    expect(c.now.sessions).toBe(3);
    expect(c.before?.sessions).toBe(3);
  });
});

describe('the change rows', () => {
  const full = () => build([...run(6, 4, 0), ...earlier(9)]);

  it('are the same rows as the year comparison', () => {
    // The "not sorted by flattery" rule is only a rule while there is one
    // list, so both comparisons read from it.
    expect(blockChanges(full()).map((c) => c.label)).toEqual(CHANGE_ROWS.map(([label]) => label));
  });

  it('keep their order whatever the numbers do', () => {
    // A block that went badly does not get its one improvement floated up.
    const worse = build([...run(2, 8, 0), ...earlier(12)]);
    const better = build([...run(12, 2, 0), ...earlier(2)]);
    expect(blockChanges(worse).map((c) => c.label)).toEqual(blockChanges(better).map((c) => c.label));
  });

  it('show a decline as a decline', () => {
    const c = build([...run(3, 8, 0), ...earlier(10)]);
    const sessions = blockChanges(c).find((r) => r.label === 'Sessions')!;
    expect(sessions.delta).toBeLessThan(0);
    expect(sessions.percent).toBeLessThan(0);
  });

  it('give no percentage against nothing', () => {
    const c = build([...run(4, 4, 0), session(addDays(TO, -(BLOCK_DAYS * 2 - 1)))]);
    const rock = blockChanges(c).find((r) => r.label === 'Days on rock')!;
    expect(rock.then).toBe(0);
    expect(rock.percent).toBeNull();
  });
});

describe('the sentence', () => {
  it('says how much more log it needs', () => {
    expect(describeBlocks(build(run(4, 2, 0)))).toMatch(/more days of log/);
  });

  it('says so when there is nothing at all', () => {
    expect(describeBlocks(build([]))).toMatch(/nothing logged yet/i);
  });

  it('names the direction and the count', () => {
    const c = build([...run(10, 2, 0), ...earlier(4)]);
    expect(describeBlocks(c)).toMatch(/6 more sessions/);
  });

  it('says fewer when it is fewer', () => {
    const c = build([...run(4, 6, 0), ...earlier(10)]);
    expect(describeBlocks(c)).toMatch(/6 fewer sessions/);
  });

  it('does not call a decline a failure', () => {
    // A deload block is supposed to show as a decline, and the app does not
    // know whether the last four weeks were a taper, an illness or a holiday.
    const c = build([...run(2, 10, 0), ...earlier(12)]);
    expect(describeBlocks(c)).not.toMatch(/should|slipped|only|worse|dropped off|worry|failed/i);
  });

  it('notices when nothing much changed', () => {
    const c = build([...run(8, 3, 0), ...earlier(8)]);
    expect(describeBlocks(c)).toMatch(/almost exactly the same/i);
  });

  it('handles both periods being empty', () => {
    const c = build([session(addDays(TO, -(BLOCK_DAYS * 2 - 1)), { completed: false })]);
    expect(describeBlocks(c)).toMatch(/nothing logged/i);
  });
});
