import { beforeAll, describe, expect, it } from 'vitest';
import { loadPrograms } from '@/content/programs';
import type { Session } from '@/db/sessions';
import { buildTips, visibleTips, type Tip } from './coach';
import {
  MIN_CHRONIC_DAYS,
  MIN_HISTORY_DAYS,
  deriveClimberState,
  type ClimberState,
} from './derive';
import { addDays } from './dates';
import { diagnose } from './plateau';

/**
 * What the app says before it can model anything (PLAN.md M173).
 *
 * ## The measurement the milestone was built on
 *
 * A probe asked `buildTips` what it had for four climbers on each day of
 * their first two months. Before this milestone a climber training three
 * times a week got `firstSession` on day zero and then **nothing at all
 * until day eighteen** — and `HomePage`'s `CoachCard` returns `null` on an
 * empty list, so Coach's Corner did not go quiet in that window, it
 * disappeared. Logging the first session removed the feature.
 *
 * ## And the proposal understated it
 *
 * It said three weeks. Measured, the silence is a function of frequency, and
 * for one climber it is not a window at all: a readable ratio needs
 * `MIN_CHRONIC_DAYS` of scored training inside the **rolling 28-day**
 * window, and at one session a week that tops out at four. The first tip of
 * any kind arrived on day 56 and the ratio never arrived. The app told them
 * *"three weeks of logged sessions and this becomes meaningful"*.
 */

beforeAll(async () => {
  await loadPrograms();
});

/**
 * A fixed Monday, not `today()` (PLAN.md M179b).
 *
 * These fixtures lay sessions on Mondays, Wednesdays and Fridays inside a
 * window ending on the anchor day — so the number of sessions in an 18-day
 * window depends on **which weekday the anchor is**, and the suite quietly
 * changed shape at midnight. It went red on a Tuesday: an 18-day window that
 * held eight sessions on Monday holds seven, one short of the gate
 * `domain:drills` opens at, and the guards written to refuse a vacuous pass
 * did exactly that.
 *
 * Every rule these tests exercise takes its date as an argument, so the
 * anchor can simply be a constant. The render tests alongside them cannot do
 * this — `useTips` reads the clock itself — and they seed at fixed offsets
 * from today instead, which is deterministic for the same reason.
 */
const DAY = '2026-03-02';

/** Sessions on the given weekdays, over a window ending today. */
function log(days: number, dows: readonly number[], scored = true): Session[] {
  const out: Session[] = [];
  for (let d = days - 1; d >= 0; d -= 1) {
    const date = addDays(DAY, -d);
    if (!dows.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
    out.push({
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      durationMin: 60,
      warmup: true,
      drillDone: false,
      ...(scored ? { rpe: 7 } : {}),
      climbs: [
        { id: `a${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session);
  }
  return out;
}

function tipsFor(sessions: Session[], at = DAY): { tips: Tip[]; state: ClimberState } {
  // `at` has to reach the derivation as well as the rules. `deriveLoad`
  // measures the span against its own `today`, so passing it only to
  // `buildTips` would move the rules forward and leave the number they read
  // where it was — which is how the first draft of the countdown test read
  // the same figure four days running.
  const state = deriveClimberState(sessions, { today: at });
  const diagnosis = diagnose({ sessions, state, today: at });
  const tips = buildTips({
    sessions,
    state,
    diagnosis,
    projects: [],
    metrics: [],
    today: at,
  } as never);
  return { tips, state };
}

const cold = (sessions: Session[]): Tip | undefined =>
  tipsFor(sessions).tips.find((t) => t.id === 'cold-start');

const THREE_A_WEEK = [1, 3, 5];
const ONCE_A_WEEK = [3];
const FIVE_A_WEEK = [1, 2, 3, 4, 5];

describe('the silence the milestone was built on', () => {
  /**
   * The invariant, and the whole point: a climber whose ratio cannot be read
   * always has something on the board. Home shows `visible[0]` and renders
   * nothing at all when the list is empty, so an empty list is not a quiet
   * screen — it is a missing feature.
   */
  it.each([
    ['three a week', THREE_A_WEEK, true],
    ['once a week', ONCE_A_WEEK, true],
    ['five a week', FIVE_A_WEEK, true],
    ['three a week, unscored', THREE_A_WEEK, false],
    ['once a week, unscored', ONCE_A_WEEK, false],
  ] as const)('never leaves %s with an empty board', (_label, dows, scored) => {
    for (const days of [1, 3, 7, 11, 14, 18, 21, 25, 28, 40, 60, 120, 365]) {
      const sessions = log(days, dows, scored);
      if (sessions.length === 0) continue;
      const { tips, state } = tipsFor(sessions);
      expect(
        tips.length,
        `day ${days}: nothing on the board, zone ${state.load.zone}`,
      ).toBeGreaterThan(0);
    }
  });

  /**
   * And it is this rule doing it, not an accident of the fixture. Every one
   * of those days with an unreadable ratio has to be covered by `cold-start`
   * or by the two rules that own the cases either side of it — a log with
   * nothing in it, and a month of unscored training.
   */
  it.each([
    ['three a week', THREE_A_WEEK, true],
    ['once a week', ONCE_A_WEEK, true],
    ['three a week, unscored', THREE_A_WEEK, false],
  ] as const)('covers every unreadable day for %s by rule', (_label, dows, scored) => {
    const OWNERS = ['cold-start', 'first-session', 'unscored-effort'];
    for (const days of [1, 3, 7, 11, 14, 18, 21, 25, 28, 40, 60, 120, 365]) {
      const sessions = log(days, dows, scored);
      if (sessions.length === 0) continue;
      const { tips, state } = tipsFor(sessions);
      if (state.load.zone !== 'unknown') continue;
      expect(
        tips.map((t) => t.id).filter((id) => OWNERS.includes(id)),
        `day ${days}: the unreadable ratio is explained by nothing`,
      ).not.toEqual([]);
    }
  });

  /** And it gets out of the way the moment there is a real number. */
  it('says nothing once the ratio is readable', () => {
    const { state } = tipsFor(log(60, THREE_A_WEEK));
    expect(state.load.zone, 'the fixture never reaches a ratio').not.toBe('unknown');
    expect(cold(log(60, THREE_A_WEEK))).toBeUndefined();
  });

  /** A log with nothing in it belongs to `firstSession`, which says more. */
  it('leaves an empty log to the rule written for it', () => {
    const { tips } = tipsFor([]);
    expect(tips.map((t) => t.id)).toEqual(['first-session']);
  });
});

describe('the countdown, for the climber who only has to wait', () => {
  it('names the days left from the span the app already held', () => {
    const sessions = log(7, THREE_A_WEEK);
    const { state } = tipsFor(sessions);
    const left = MIN_HISTORY_DAYS - state.load.daysOfHistory;
    expect(left).toBeGreaterThan(0);
    expect(cold(sessions)!.headline).toBe(`${left} more days before the load ratio can say anything`);
  });

  /**
   * It counts *down*. `daysOfHistory` is measured from the earliest scored
   * day, which is fixed once a session is logged, so the number falls by one
   * a day whether or not the climber trains — which is what a countdown has
   * to do to be one.
   */
  it('falls by one a day on a log that does not change', () => {
    const sessions = log(7, THREE_A_WEEK);
    const seen = [0, 1, 2, 3].map((ahead) => {
      const tip = tipsFor(sessions, addDays(DAY, ahead)).tips.find((t) => t.id === 'cold-start');
      return Number(/^(\d+) more/.exec(tip?.headline ?? '')?.[1] ?? NaN);
    });
    // Derived per-day rather than from one reading, so a headline built from
    // a constant would not produce a run.
    expect(seen.every(Number.isFinite), `headlines: ${seen.join(', ')}`).toBe(true);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i], `day ${i}: ${seen[i - 1]} then ${seen[i]}`).toBe(seen[i - 1]! - 1);
    }
  });

  /** One day is one day. */
  it('says day rather than days at the end', () => {
    let found: string | null = null;
    for (let days = 14; days <= 30; days += 1) {
      const tip = cold(log(days, FIVE_A_WEEK));
      if (tip?.headline.startsWith('1 more ')) found = tip.headline;
    }
    expect(found, 'the countdown never reached one').toBe(
      '1 more day before the load ratio can say anything',
    );
  });

  /** And it promises nothing about a date, because the second condition can
   *  still be short when the first is met. */
  it('names both conditions rather than only the one being counted', () => {
    const body = cold(log(7, THREE_A_WEEK))!.body;
    expect(body).toContain(`${MIN_HISTORY_DAYS} days of span`);
    expect(body).toContain(`${MIN_CHRONIC_DAYS} days of scored training`);
  });
});

describe('the climber the ratio will never fit', () => {
  /**
   * Density is counted inside the rolling 28-day window, so one session a
   * week is four scored days in it — for ever. This is the measurement the
   * proposal missed and the reason the old note was a promise.
   */
  it('never reaches the density the ratio needs, at any age', () => {
    for (const days of [28, 56, 120, 365, 1000]) {
      const { state } = tipsFor(log(days, ONCE_A_WEEK));
      expect(state.load.scoredDays, `day ${days}`).toBeLessThan(MIN_CHRONIC_DAYS);
      expect(state.load.zone, `day ${days}`).toBe('unknown');
    }
  });

  it('is told that, rather than counted down at', () => {
    const tip = cold(log(365, ONCE_A_WEEK))!;
    expect(tip.headline).toBe('The load ratio needs more training weeks than yours have');
    expect(tip.body).not.toMatch(/more days/);
    expect(tip.body).toContain(`there are ${4}`);
    expect(tip.action?.href).toBe('/progress');
  });

  /** It does not call a schedule a fault. */
  it('does not tell them to train more', () => {
    const tip = cold(log(365, ONCE_A_WEEK))!;
    expect(tip.tone).toBe('neutral');
    expect(tip.body).toContain('not a reason to train more than suits you');
  });

  /** And it is the countdown before the span is there, not this. */
  it('counts down first and explains second', () => {
    expect(cold(log(7, ONCE_A_WEEK))!.headline).toMatch(/more days before/);
    expect(cold(log(365, ONCE_A_WEEK))!.headline).not.toMatch(/more days before/);
  });
});

describe('the climber whose sessions are not counting', () => {
  /**
   * `daysOfHistory` is measured from the earliest *scored* day, so for a log
   * with no effort on it the countdown reads twenty-one for ever. A number
   * that never moves is worse than no number, which is why this branch is
   * tested before the span one.
   */
  it('is told so in the first week, not the fifth', () => {
    const tip = cold(log(7, THREE_A_WEEK, false))!;
    expect(tip.headline).toBe('None of what you have logged is counting yet');
    expect(tip.tone).toBe('caution');
    expect(tip.action?.href).toBe('/calendar');
  });

  it('is never handed a countdown that cannot move', () => {
    // Every day this rule owns, rather than a list of days: the handover to
    // `unscored-effort` lands somewhere in the low twenties and its exact
    // date is a property of the fixture, not of the claim.
    let owned = 0;
    for (let days = 1; days <= 60; days += 1) {
      const sessions = log(days, THREE_A_WEEK, false);
      if (sessions.length === 0) continue;
      const { tips, state } = tipsFor(sessions);
      const tip = tips.find((t) => t.id === 'cold-start');
      if (tip === undefined) continue;
      owned += 1;
      expect(state.load.daysOfHistory, `day ${days}`).toBe(0);
      expect(tip.headline, `day ${days}`).not.toMatch(/more days before/);
      expect(tip.headline, `day ${days}`).toBe('None of what you have logged is counting yet');
    }
    expect(owned, 'the rule owned no unscored day, so this proves nothing').toBeGreaterThan(10);
  });

  /** And it hands over to the rule that owns the case once that rule can
   *  see it, rather than both of them saying it. */
  it('hands over to unscored-effort and stops', () => {
    const { tips, state } = tipsFor(log(35, THREE_A_WEEK, false));
    expect(state.load.unknownBecause).toBe('unscored');
    expect(tips.map((t) => t.id)).toContain('unscored-effort');
    expect(tips.map((t) => t.id)).not.toContain('cold-start');
  });
});

describe('where it sits, and how it ages', () => {
  /**
   * Below anything that reads real data and above the gaps, for **all
   * three** branches.
   *
   * The first version of this asserted that `load-spike` came top of a
   * five-a-week fixture — which it did, because that climber's ratio is
   * readable and `cold-start` was not in the list at all. The battery said
   * so by surviving a weight of 99, and again by surviving a weight of 5 on
   * the branch the fixture never reached. A ranking claim needs both rules
   * in hand, so the weights are read off real firings and compared.
   */
  const weightOf = (sessions: Session[], id: string): number => {
    const tip = tipsFor(sessions).tips.find((t) => t.id === id);
    expect(tip, `${id} never fired, so this proves nothing`).toBeDefined();
    return tip!.weight;
  };

  it('sits between the gaps and the measurements, on every branch', () => {
    const gap = weightOf(log(18, THREE_A_WEEK), 'domain:drills');
    const measured = weightOf(log(21, FIVE_A_WEEK), 'load-spike');
    expect(gap).toBeLessThan(measured);

    const branches = [
      ['counting down', weightOf(log(7, THREE_A_WEEK), 'cold-start')],
      ['frequency', weightOf(log(365, ONCE_A_WEEK), 'cold-start')],
      ['unscored', weightOf(log(7, THREE_A_WEEK, false), 'cold-start')],
    ] as const;
    for (const [label, weight] of branches) {
      expect(weight, `${label} outranks a real measurement`).toBeLessThan(measured);
      expect(weight, `${label} sinks below a domain gap`).toBeGreaterThan(gap);
    }
    // One rule, one rank: three branches of the same observation should not
    // reorder the board between them.
    expect(new Set(branches.map(([, w]) => w)).size).toBe(1);
  });

  /** And on the board it is actually top, in the window where nothing else
   *  can fire. */
  it('leads the board while the ratio cannot be read', () => {
    const { tips, state } = tipsFor(log(18, THREE_A_WEEK));
    expect(state.load.zone).toBe('unknown');
    expect(tips[0]!.id).toBe('cold-start');
    expect(tips.map((t) => t.id), 'the fixture lost its domain gap').toContain('domain:drills');
  });

  /**
   * Waving it away in week one does not wave away week two. This is the
   * mechanism `visibleTips` is built on, and the reason it matters here is
   * that the tip's whole subject is how far in you are.
   */
  it('comes back the following week under a new signature', () => {
    const early = cold(log(4, THREE_A_WEEK))!;
    const later = cold(log(14, THREE_A_WEEK))!;
    expect(later.signature).not.toBe(early.signature);
    expect(visibleTips([later], { 'cold-start': early.signature }).map((t) => t.id)).toEqual([
      'cold-start',
    ]);
  });

  /** And the same week is the same fact. */
  it('stays away inside the week it was set aside in', () => {
    const tip = cold(log(4, THREE_A_WEEK))!;
    expect(visibleTips([tip], { 'cold-start': tip.signature })).toEqual([]);
  });

  /** The three branches are three facts, so a dismissal of one is not a
   *  dismissal of the others. */
  it('signs its three branches apart', () => {
    const signatures = [
      cold(log(7, THREE_A_WEEK))!.signature,
      cold(log(365, ONCE_A_WEEK))!.signature,
      cold(log(7, THREE_A_WEEK, false))!.signature,
    ];
    expect(new Set(signatures).size).toBe(3);
  });
});
