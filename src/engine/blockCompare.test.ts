import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import type { AwayPeriod } from './away';
import { addDays } from './dates';
import {
  BLOCK_DAYS,
  MIN_ASIDE_DAYS,
  blockAside,
  blockChanges,
  compareBlocks,
  describeBlocks,
} from './blockCompare';
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

/** A marked stretch, dated in days before TO. `fromAgo` is the earlier end. */
const marked = (fromAgo: number, toAgo: number, patch: Partial<AwayPeriod> = {}): AwayPeriod => ({
  id: `away-${fromAgo}-${toAgo}`,
  from: addDays(TO, -fromAgo),
  to: addDays(TO, -toAgo),
  kind: 'injured',
  updatedAt: `${addDays(TO, -fromAgo)}T09:00:00.000Z`,
  ...patch,
});

const withAway = (sessions: Session[], away: AwayPeriod[]) =>
  compareBlocks({ sessions, to: TO, away });

/** Six fewer sessions in the last four weeks than in the four before them. */
const DOWN = [...run(4, 6, 0), ...earlier(10)];
/** Six more. */
const UP = [...run(10, 2, 0), ...earlier(4)];

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
    // A deload block is supposed to show as a decline. Since M305 the app
    // can name an illness or a holiday the climber marked — and a verdict on
    // one is still not its to give.
    const c = build([...run(2, 10, 0), ...earlier(12)]);
    expect(describeBlocks(c)).not.toMatch(/should|slipped|only|worse|dropped off|worry|failed/i);
  });

  it('notices when nothing much changed', () => {
    const c = build([...run(8, 3, 0), ...earlier(8)]);
    expect(describeBlocks(c)).toMatch(/almost exactly the same/i);
  });

  it('handles both periods being empty', () => {
    // A completed session *older* than both windows, which is what makes the
    // comparison available and both halves of it nought. The fixture used to
    // be an uncompleted one inside the earlier window: that leaves the log
    // with no earliest date at all, so this took the "nothing logged yet"
    // branch and matched `/nothing logged/i` on the way past (PLAN.md M305).
    const c = build([session(addDays(TO, -BLOCK_DAYS * 2))]);
    expect(c.before).not.toBeNull();
    expect(describeBlocks(c)).toBe('Nothing logged in either period.');
  });
});

/**
 * The stretches the climber marked, named beside the change (PLAN.md M305).
 *
 * The rule this holds is about *which window*: a quieter month is explained
 * by what happened in it, and a busier one by what happened in the month
 * before. Getting that backwards would tell a climber coming back from flu
 * that they were improving.
 */
describe('the marked stretches', () => {
  it('names one in the recent window when training went down', () => {
    const c = withAway(DOWN, [marked(10, 1)]);
    expect(describeBlocks(c)).toBe(
      '6 fewer sessions than the four weeks before. 10 of those days are marked injured.',
    );
  });

  it('names one in the earlier window when training went up', () => {
    const c = withAway(UP, [marked(50, 40)]);
    expect(describeBlocks(c)).toMatch(/The earlier four weeks have 11 days marked injured\.$/);
  });

  it('does not explain a decline with something that happened before it', () => {
    // The marker is in the earlier window and training went *down*, so it is
    // not the reason — saying it would blame this month on last month.
    expect(blockAside(withAway(DOWN, [marked(50, 40)]))).toBeNull();
  });

  it('says nothing about a month that did not change', () => {
    const level = [...run(8, 3, 0), ...earlier(8)];
    // One marker in each window, because the guard is only reachable from
    // one side at a time and which side depends on where the rounding of a
    // half-hour lands. With a marker in the recent window only, a mutant
    // that drops the guard entirely still returns null — it picks the
    // earlier window and finds nothing there — and survived saying so.
    expect(blockAside(withAway(level, [marked(20, 1)]))).toBeNull();
    expect(blockAside(withAway(level, [marked(50, 40)]))).toBeNull();
  });

  it('ignores a stretch too short to be the reason', () => {
    const short = MIN_ASIDE_DAYS - 1;
    expect(blockAside(withAway(DOWN, [marked(short, 1)]))).toBeNull();
    expect(blockAside(withAway(DOWN, [marked(MIN_ASIDE_DAYS, 1)]))?.days).toBe(MIN_ASIDE_DAYS);
  });

  it('counts days of the window, not days of the stretch', () => {
    // Three months either side of it: the window is four weeks whatever the
    // marker says, and four weeks is what the sentence is about.
    const aside = blockAside(withAway(DOWN, [marked(120, -60)]));
    expect(aside?.days).toBe(BLOCK_DAYS);
  });

  it('takes the stretch covering most of the window when two overlap', () => {
    const c = withAway(DOWN, [marked(4, 1, { note: 'short' }), marked(20, 1, { note: 'long' })]);
    expect(blockAside(c)?.period.note).toBe('long');
  });

  it('prints what the climber called it, and the kind when they called it nothing', () => {
    expect(describeBlocks(withAway(DOWN, [marked(10, 1, { note: "Font '26" })]))).toContain(
      "marked Font '26",
    );
    expect(describeBlocks(withAway(DOWN, [marked(10, 1, { kind: 'trip' })]))).toContain(
      'marked climbing trip',
    );
  });

  it('names a trip and an illness alike', () => {
    // `wasClimbing` is deliberately unread here: both are reasons a month is
    // quieter than the one before it, and which it was is the climber's word
    // rather than this card's judgement.
    const trip = describeBlocks(withAway(DOWN, [marked(10, 1, { kind: 'trip' })]));
    const hurt = describeBlocks(withAway(DOWN, [marked(10, 1, { kind: 'injured' })]));
    expect(trip.replace('climbing trip', 'X')).toBe(hurt.replace('injured', 'X'));
  });

  it('leaves the sentence exactly as it was for a climber who marked nothing', () => {
    expect(describeBlocks(withAway(DOWN, []))).toBe(describeBlocks(build(DOWN)));
    expect(describeBlocks(withAway(UP, []))).toBe(describeBlocks(build(UP)));
  });

  it('says nothing before there is a comparison to explain', () => {
    // No earlier window means no change, and a marker over four weeks that
    // are not being compared to anything explains nothing.
    const c = compareBlocks({ sessions: run(4, 2, 0), to: TO, away: [marked(10, 1)] });
    expect(c.before).toBeNull();
    expect(c.beforeAway).toEqual([]);
    expect(blockAside(c)).toBeNull();
  });

  it('explains a silence in both windows with the recent one', () => {
    const c = compareBlocks({
      sessions: [session(addDays(TO, -BLOCK_DAYS * 2))],
      to: TO,
      away: [marked(20, 1)],
    });
    expect(describeBlocks(c)).toBe(
      'Nothing logged in either period. 20 of those days are marked injured.',
    );
  });

  it('only ever names a stretch that touches the window it claims', () => {
    for (const aside of [
      blockAside(withAway(DOWN, [marked(10, 1)])),
      blockAside(withAway(UP, [marked(50, 40)])),
    ]) {
      const c = aside!.window === 'now' ? withAway(DOWN, []) : withAway(UP, []);
      const from = aside!.window === 'now' ? c.nowFrom : c.beforeFrom;
      const to = aside!.window === 'now' ? c.nowTo : c.beforeTo;
      expect(aside!.period.from <= to && aside!.period.to >= from).toBe(true);
    }
  });
});
