import { beforeAll, describe, expect, it } from 'vitest';
import { loadPrograms } from '@/content/programs';
import type { MetricEntry } from '@/db/metrics';
import type { Session } from '@/db/sessions';
import { GAIN_ADDED_LBS, GAIN_PERCENT, GAIN_WINDOW_DAYS, buildTips, type Tip } from './coach';
import { deriveClimberState } from './derive';
import { addDays } from './dates';
import { diagnose } from './plateau';

/**
 * The good news the coach was already holding (PLAN.md M178).
 *
 * ## The measurement
 *
 * Twenty-three tips are constructed in `coach.ts` and exactly one carried
 * `tone: 'good'` — `streakPraise`, at weight 20, the lowest number in the
 * table. Everything else is a fault, a gap, a risk or a nag.
 *
 * And the other half was already computed: `assessmentStatus` returns a
 * `change` — delta, percent, improved — beside the `due`, and `benchmarks`
 * has called it since M174 reading only `due`. This is M174's finding one
 * level deeper: the input was there, the rule looked at the other field.
 *
 * ## What is tested here
 *
 * Mostly the gate, because a praise rule that fires easily is worth less
 * than no praise rule. Two readings, a real size, and a recent window — and
 * silence for everyone else, including the climber training well who has
 * measured nothing.
 */

beforeAll(async () => {
  await loadPrograms();
});

/** A fixed Monday, not `today()` — see M179b and `deterministic.test.ts`. */
const DAY = '2026-03-02';

function log(days: number): Session[] {
  const out: Session[] = [];
  for (let d = days - 1; d >= 0; d -= 1) {
    const date = addDays(DAY, -d);
    if (![1, 3, 5].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
    out.push({
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: 7,
      durationMin: 60,
      warmup: true,
      drillDone: false,
      climbs: [
        { id: `a${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session);
  }
  return out;
}

const reading = (
  metricId: string,
  daysAgo: number,
  value: number,
  display?: string,
): MetricEntry =>
  ({
    id: `m-${metricId}-${daysAgo}`,
    metricId,
    date: addDays(DAY, -daysAgo),
    value,
    ...(display === undefined ? {} : { display }),
    createdAt: `${addDays(DAY, -daysAgo)}T10:00:00.000Z`,
  }) as MetricEntry;

function tipsFor(metrics: MetricEntry[], days = 60): Tip[] {
  const sessions = log(days);
  const state = deriveClimberState(sessions, { today: DAY });
  return buildTips({
    sessions,
    state,
    diagnosis: diagnose({ sessions, state, today: DAY }),
    projects: [],
    metrics,
    programMetrics: [],
    today: DAY,
  } as never);
}

const gain = (metrics: MetricEntry[], days = 60): Tip | undefined =>
  tipsFor(metrics, days).find((t) => t.id === 'benchmark-gain');

/**
 * +10% on the hang: 30 seconds eight weeks ago, 33 last week.
 *
 * A dead hang rather than a max hang, since M234. This file's workhorse was
 * `max_hang_20mm_7s`, whose unit is *added* weight — so every "+3 BW+lbs
 * (10%)" in it was the app reporting ten per cent of the plate as though it
 * were ten per cent of what the fingers hold. The percentage is gone from
 * that metric now, and the tests about the *rule* use a metric where a
 * percentage means what it says. Added weight has its own block below.
 */
const TEN_PERCENT = [
  reading('dead_hang', 60, 30),
  reading('dead_hang', 4, 33),
];

describe('a number that moved', () => {
  it('names the number, the size and the window', () => {
    const tip = gain(TEN_PERCENT)!;
    expect(tip.headline).toBe('Dead Hang improved: +3 sec (10%)');
    expect(tip.body).toMatch(/over 8 weeks/);
    expect(tip.tone).toBe('good');
    expect(tip.action?.href).toBe('/assessments');
  });

  /**
   * The subject, the size and the window are what this rule has and
   * `streakPraise` does not — it is why this one is worth reading and a
   * bare "well done" is not. Each of them has to be in the sentence.
   */
  it('says all three, not two of them', () => {
    const tip = gain(TEN_PERCENT)!;
    const said = `${tip.headline} ${tip.body}`;
    expect(said, 'which number').toContain('Dead Hang');
    expect(said, 'how much').toContain('+3 sec');
    expect(said, 'over how long').toMatch(/8 weeks/);
  });

  it('is silent on one reading, because one reading is not a change', () => {
    expect(gain([reading('dead_hang', 4, 33)])).toBeUndefined();
  });

  it('is silent on a decline', () => {
    expect(
      gain([reading('dead_hang', 60, 33), reading('dead_hang', 4, 30)]),
    ).toBeUndefined();
  });

  it('is silent when nothing was measured at all', () => {
    expect(gain([])).toBeUndefined();
  });

  /**
   * A metric that improves downwards improves. `min_edge` is the one in the
   * registry with `higherIsBetter: false`, and the rule reads that flag
   * rather than the sign — 20mm down to 18mm is the climber getting
   * stronger, and the headline has to be able to say so without claiming
   * the number went up.
   */
  it('reads the metric direction, not the sign of the delta', () => {
    const tip = gain([reading('min_edge', 50, 20), reading('min_edge', 3, 18)])!;
    expect(tip.headline).toBe('Min Edge Achievable improved: −2 mm (10%)');
  });
});

describe('the gate, which is the whole rule', () => {
  /**
   * Derived from the constant rather than written out, so moving the
   * threshold moves the test with it and a mutation of either shows.
   */
  const from = (percent: number): MetricEntry[] => [
    reading('repeater_weight', 56, 100),
    reading('repeater_weight', 7, 100 + percent),
  ];

  it('fires at the threshold and not below it', () => {
    expect(gain(from(GAIN_PERCENT))?.id, 'exactly the threshold').toBe('benchmark-gain');
    expect(gain(from(GAIN_PERCENT - 1)), 'a hair under').toBeUndefined();
  });

  /** Two per cent is the same hand on the same edge on a different day. */
  it('treats a retest wobble as a wobble', () => {
    expect(gain(from(2))).toBeUndefined();
  });

  /**
   * Both ends of the window, separately: a gain the climber already knows
   * about, and two readings so far apart they describe a different person.
   */
  it('is silent once the gain is old news', () => {
    const stale = [
      reading('repeater_weight', GAIN_WINDOW_DAYS + 40, 100),
      reading('repeater_weight', GAIN_WINDOW_DAYS + 10, 120),
    ];
    expect(gain(stale, 400)).toBeUndefined();
  });

  it('is silent when the two readings are a training life apart', () => {
    const far = [
      reading('repeater_weight', GAIN_WINDOW_DAYS + 30, 100),
      reading('repeater_weight', 3, 120),
    ];
    expect(gain(far, 400)).toBeUndefined();
  });

  /** And the near side of each: one day inside the window still fires. */
  it('fires at the far edge of both windows', () => {
    const edge = [
      reading('repeater_weight', GAIN_WINDOW_DAYS * 2 - 1, 100),
      reading('repeater_weight', GAIN_WINDOW_DAYS - 1, 120),
    ];
    expect(gain(edge, 400)?.id).toBe('benchmark-gain');
  });
});

describe('a metric with no percentage', () => {
  const grade = (daysAgo: number, value: number, display: string): MetricEntry =>
    reading('max_boulder_grade', daysAgo, value, display);

  it('takes the step itself as the size', () => {
    const tip = gain([grade(40, 4, 'V4'), grade(5, 5, 'V5')])!;
    expect(tip.headline).toBe('Max Boulder Grade improved: +1 grade');
    expect(tip.headline, 'a percentage of a ladder position means nothing').not.toMatch(/%/);
  });

  /**
   * Two rungs beat one. Both orders, because every percentless gain carries
   * the same size and a sort with no tie-break just keeps whichever the
   * entries happened to mention first — which passes this test half the
   * time by luck, and was a battery survivor until it read both ways.
   */
  it('prefers two rungs to one, whichever was written down first', () => {
    const twoRungs = [grade(40, 4, 'V4'), grade(5, 6, 'V6')];
    const oneRung = [
      reading('max_sport_grade', 40, 10, '5.11a'),
      reading('max_sport_grade', 5, 11, '5.11b'),
    ];
    expect(gain([...twoRungs, ...oneRung])!.headline).toMatch(/^Max Boulder Grade/);
    expect(gain([...oneRung, ...twoRungs])!.headline).toMatch(/^Max Boulder Grade/);
  });

  /** A pass that used to be a fail is a gain with no number attached. */
  it('counts a pass', () => {
    const tip = gain([reading('landing_control', 40, 0, 'Fail'), reading('landing_control', 5, 1, 'Pass')])!;
    expect(tip.headline).toBe('Landing Control improved: now passing');
  });
});

describe('when more than one thing went right', () => {
  it('says the biggest, not the first', () => {
    const tip = gain([
      reading('dead_hang', 50, 30),
      reading('dead_hang', 5, 33),
      reading('max_pullups', 50, 10),
      reading('max_pullups', 5, 14),
    ])!;
    expect(tip.headline, '40% beats 10%').toMatch(/^Max Pull-Ups/);
  });

  it('says one thing, not a list', () => {
    const many = tipsFor([
      reading('dead_hang', 50, 30),
      reading('dead_hang', 5, 33),
      reading('max_pullups', 50, 10),
      reading('max_pullups', 5, 14),
      reading('max_pushups', 50, 20),
      reading('max_pushups', 5, 30),
    ]).filter((t) => t.id === 'benchmark-gain');
    expect(many).toHaveLength(1);
  });
});

describe('said once', () => {
  it('signs the reading it is about, so the next retest earns its own', () => {
    const first = gain(TEN_PERCENT)!;
    const next = gain([...TEN_PERCENT, reading('dead_hang', 1, 37)])!;
    expect(first.signature).toBe(`dead_hang:${addDays(DAY, -4)}`);
    expect(next.signature).not.toBe(first.signature);
  });

  it('signs the same fact the same way twice', () => {
    expect(gain(TEN_PERCENT)!.signature).toBe(gain(TEN_PERCENT)!.signature);
  });

  /**
   * And the window it reports is the last step, not the whole history. A
   * climber with three readings who retests three days after the last one
   * gained that in three days; saying *over 8 weeks* would be measuring
   * from a number that has already been superseded.
   *
   * Rounded up to a week at the bottom, because *over 0 weeks* is not a
   * sentence.
   */
  it('reports the step it is about, not the series', () => {
    const third = gain([...TEN_PERCENT, reading('dead_hang', 1, 37)])!;
    expect(third.headline).toBe('Dead Hang improved: +4 sec (12%)');
    expect(third.body).toMatch(/over 1 week,/);
    expect(third.body, 'a plural week').not.toMatch(/over 1 weeks/);
  });
});

/**
 * Added weight, which used to carry a percentage and carried the wrong one
 * (PLAN.md M234).
 *
 * `max_hang_20mm_7s` and `weighted_pullup_3rm` store the plate and not the
 * load: thirty pounds becoming thirty-three is ten per cent of what is
 * recorded and under two per cent of what the fingers hold. The app reported
 * the first, six times over.
 *
 * Taking the percentage away was half the fix. The other half is that the
 * rule ranked percentless metrics as `Infinity` — right for a grade, where a
 * step up a ladder is already the size, and wrong here, where a one-pound
 * retest would have outranked every real gain in the log.
 */
describe('a benchmark measured in added weight', () => {
  const added = (from: number, to: number) => [
    reading('max_hang_20mm_7s', 50, from),
    reading('max_hang_20mm_7s', 5, to),
  ];

  it('never claims a percentage of a number it does not have', () => {
    const tip = gain(added(30, 40))!;
    expect(tip.headline).toBe('Max Hang 20mm 7s improved: +10 BW+lbs');
    expect(tip.headline, 'a percentage of the plate is not a percentage').not.toMatch(/%/);
  });

  /**
   * And it still has a floor. Five pounds is the smallest plate most climbers
   * can add and past the noise of a retest on the same hand and the same
   * edge; three is the retest.
   */
  it('stays quiet under the smallest plate there is', () => {
    expect(GAIN_ADDED_LBS).toBe(5);
    expect(gain(added(30, 33)), '+3 lbs is a retest').toBeUndefined();
    expect(gain(added(30, 35)), '+5 lbs is a block').toBeDefined();
  });

  /**
   * The ranking, which is the half that taking the percentage away broke.
   * A ten-pound max hang is twice its floor and a 40% pull-up gain is eight
   * times its own, so the pull-ups lead — and `Infinity` would have had the
   * hang lead on a single pound.
   */
  it('ranks against its own floor rather than above everything', () => {
    const tip = gain([
      ...added(30, 40),
      reading('max_pullups', 50, 10),
      reading('max_pullups', 5, 14),
    ])!;
    expect(tip.headline, '40% of a real percentage beats ten pounds').toMatch(/^Max Pull-Ups/);

    // And it does lead when the gain is the larger multiple: +30 lbs is six
    // floors against the pull-ups' eight per cent, which is under two.
    const bigger = gain([
      ...added(30, 60),
      reading('max_pullups', 50, 12),
      reading('max_pullups', 5, 13),
    ])!;
    expect(bigger.headline).toMatch(/^Max Hang/);
  });

  it('says it of the pull-up benchmark too, not just the hang', () => {
    const tip = gain([
      reading('weighted_pullup_3rm', 50, 20),
      reading('weighted_pullup_3rm', 5, 30),
    ])!;
    expect(tip.headline).toBe('Weighted Pull-Ups 3RM improved: +10 BW+lbs');
  });
});

describe('where it sits on the board', () => {
  /**
   * Measured against the tips that actually fire for these climbers, not
   * against written-down weights — M173's lesson. A number is only right
   * relative to the cards it has to beat and lose to.
   *
   * Forty days of the same three sessions a week is a climber with nothing
   * wrong yet; ninety is the same climber after `plateau` has noticed the
   * line went flat.
   */
  const NO_FAULT = 40;
  const PLATEAUED = 90;

  it('leads for a climber with a gain and no fault', () => {
    const board = tipsFor(TEN_PERCENT, NO_FAULT);
    expect(board.some((t) => t.id === 'plateau'), 'this climber has a fault').toBe(false);
    expect(board[0]!.id).toBe('benchmark-gain');
    expect(board.length, 'a board of one proves nothing').toBeGreaterThan(2);
  });

  /**
   * And loses to a fault. A flat line is something to do something about;
   * a hang that went up is not, and *the thing to do something about* goes
   * first however nice the other card is.
   */
  it('sits under a fault', () => {
    const board = tipsFor(TEN_PERCENT, PLATEAUED);
    const fault = board.findIndex((t) => t.id === 'plateau');
    expect(fault, 'no fault fired, so this proves nothing').toBeGreaterThanOrEqual(0);
    expect(fault).toBeLessThan(board.findIndex((t) => t.id === 'benchmark-gain'));
  });

  /**
   * Above the gaps and the nags, though, which is the part that changes
   * what a climber sees. Those stay true tomorrow; this happened on a day.
   */
  it('sits over the gaps and the nags', () => {
    const board = tipsFor(TEN_PERCENT, PLATEAUED);
    const gainAt = board.findIndex((t) => t.id === 'benchmark-gain');
    const under = ['domain:rest', 'backup', 'streak'];
    for (const id of under) {
      const at = board.findIndex((t) => t.id === id);
      expect(at, `${id} did not fire, so this proves nothing`).toBeGreaterThanOrEqual(0);
      expect(at, `${id} outranked the good news`).toBeGreaterThan(gainAt);
    }
  });

  /**
   * The rule the coach was missing. `streakPraise` was the file's only
   * `tone: 'good'` and sat at the bottom of every board it appeared on, so
   * good news could never lead. Same climber, same sessions, one difference
   * — whether they measured anything.
   */
  it('is the difference between a good lead and a nag', () => {
    const measured = tipsFor(TEN_PERCENT, NO_FAULT);
    const not = tipsFor([], NO_FAULT);
    expect(measured[0]!.tone).toBe('good');
    expect(not[0]!.tone, 'good news for a climber who measured nothing').not.toBe('good');
    expect(not.some((t) => t.tone === 'good'), 'the streak still says its piece').toBe(true);
    expect(not.at(-1)!.id, 'and still says it last').toBe('streak');
  });
});
