import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getProgram, loadPrograms } from '@/content/programs';
import type { MetricEntry } from '@/db/metrics';
import type { Session } from '@/db/sessions';
import { buildTips, type Tip } from './coach';
import { STALE_DAYS } from './assessments';
import { deriveClimberState } from './derive';
import { addDays } from './dates';
import { diagnose } from './plateau';

/**
 * The battery the coach could not see (PLAN.md M174).
 *
 * ## The finding, which is smaller and worse than the proposal's
 *
 * The proposal said the rule *"can only notice a number going stale, never a
 * number that was never taken"*, and blamed the early return on an empty
 * entries list. True, but that was a symptom. `CoachInput.programMetrics` has
 * carried the comment *"Program assessment ids, so staleness is judged on
 * what you were asked"* since it was written, and **nothing read it and
 * nothing filled it** — `useTips` built every other input the board needs and
 * skipped this one. The rule had no way to know what a climber had been asked
 * for, so it could only look at what they had already recorded.
 *
 * M169's sweep would have caught a dead field like this in
 * `content/types.ts`. It does not cover engine interfaces.
 *
 * ## Which broke it twice
 *
 * A prescribed number nobody has taken is invisible to a rule reading the
 * entries — and a number the climber took once out of curiosity gets nagged
 * about for ever, even on a program that never asked for it. Both are the
 * same missing input, and both are fixed by filling it.
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

const reading = (metricId: string, daysAgo: number): MetricEntry =>
  ({
    id: `m-${metricId}-${daysAgo}`,
    metricId,
    date: addDays(DAY, -daysAgo),
    value: 30,
    createdAt: `${addDays(DAY, -daysAgo)}T10:00:00.000Z`,
  }) as MetricEntry;

function tipsFor(options: {
  days?: number;
  programId?: string | null;
  metrics?: MetricEntry[];
}): Tip[] {
  const sessions = log(options.days ?? 30);
  const state = deriveClimberState(sessions, { today: DAY });
  const program = options.programId ? getProgram(options.programId) : undefined;
  return buildTips({
    sessions,
    state,
    diagnosis: diagnose({ sessions, state, today: DAY }),
    projects: [],
    metrics: options.metrics ?? [],
    programMetrics: program?.assessments ?? [],
    today: DAY,
  } as never);
}

const ask = (options: Parameters<typeof tipsFor>[0]): Tip | undefined =>
  tipsFor(options).find((t) => t.id === 'no-baseline' || t.id === 'stale-benchmarks');

describe('the input nothing filled', () => {
  it('is declared for exactly this, and now passed', () => {
    const coach = readFileSync('src/engine/coach.ts', 'utf8');
    expect(coach).toMatch(/programMetrics\?: MetricId\[\];/);
    expect(coach, 'the rule still ignores it').toMatch(/input\.programMetrics/);
    const hook = readFileSync('src/features/coach/useTips.ts', 'utf8');
    expect(hook, 'the hook still skips it').toMatch(/programMetrics: program\?\.assessments/);
  });

  /**
   * And the field changes the answer, which a source check cannot show. Same
   * climber, same empty metric list; the only difference is whether the
   * board is told what was asked of them.
   */
  it('is what the rule reads, not the entries', () => {
    expect(ask({ programId: 'iron_grip' })?.id).toBe('no-baseline');
    expect(ask({ programId: null }), 'nothing asked, nothing said').toBeUndefined();
  });
});

describe('a climber who has never measured anything', () => {
  it('is asked, and told how many', () => {
    const tip = ask({ programId: 'iron_grip' })!;
    expect(tip.id).toBe('no-baseline');
    expect(getProgram('iron_grip')!.assessments).toHaveLength(9);
    expect(tip.headline).toBe('No baseline for the 9 numbers your training is meant to move');
    expect(tip.action?.href).toBe('/assessments');
  });

  it('is asked why it has to be now', () => {
    expect(ask({ programId: 'iron_grip' })!.body).toMatch(
      /Taken now it is a before; taken in two months it is just a number/,
    );
  });

  /** Not after one session. `firstSession` and `cold-start` are talking. */
  it('is not asked on the way in', () => {
    expect(ask({ programId: 'iron_grip', days: 3 })?.id).toBeUndefined();
    expect(ask({ programId: 'iron_grip', days: 7 })?.id).toBe('no-baseline');
  });

  /** And stops the moment any of the battery has a reading. */
  it('stops once the battery has been started', () => {
    expect(ask({ programId: 'iron_grip', metrics: [reading('max_hang_20mm_7s', 3)] })).toBeUndefined();
  });

  /**
   * A program that asks for nothing asks for nothing. Trip Prep is four
   * weeks and prescribes no battery — the one entry in the catalogue that
   * does not — and a climber with no program was never asked either.
   */
  it.each([
    ['trip_prep', 'the one program that prescribes none'],
    [null, 'no program at all'],
  ] as [string | null, string][])('says nothing to %s — %s', (programId, _why) => {
    expect(ask({ programId })).toBeUndefined();
  });
});

describe('staleness, judged on what was asked', () => {
  const STALE = STALE_DAYS + 10;

  it('still nags about a prescribed number gone cold', () => {
    const tip = ask({
      programId: 'iron_grip',
      days: 120,
      metrics: [reading('max_hang_20mm_7s', STALE)],
    })!;
    expect(tip.id).toBe('stale-benchmarks');
    expect(tip.headline).toBe('1 benchmark out of date');
  });

  /**
   * And stops nagging about one nobody asked for. `flexibility` is the one
   * metric in the registry no program prescribes (M169 measured that), so a
   * climber who took it once used to be told for ever that it was out of
   * date — by a rule whose own field says staleness is judged on what you
   * were asked.
   */
  it('leaves a number no program prescribed alone', () => {
    const tip = ask({ programId: 'iron_grip', days: 120, metrics: [reading('flexibility', STALE)] });
    expect(tip?.id, 'nagged about a number nothing asked for').not.toBe('stale-benchmarks');
    // What it says instead is the truthful thing: the nine it *was* asked
    // for have never been taken.
    expect(tip?.id).toBe('no-baseline');
  });

  /**
   * Unless nobody asked for anything, where what the climber chose to track
   * is the only battery there is. This is the rule's behaviour before the
   * milestone, kept for the climber it was right for.
   */
  it('falls back to what the climber tracks when no program asked', () => {
    const tip = ask({ programId: null, days: 120, metrics: [reading('flexibility', STALE)] })!;
    expect(tip.id).toBe('stale-benchmarks');
  });
});

describe('the two asks are one gap at a time', () => {
  it('never puts both on the board', () => {
    const cases = [
      { programId: 'iron_grip' },
      { programId: 'iron_grip', days: 120, metrics: [reading('max_hang_20mm_7s', STALE_DAYS + 10)] },
      { programId: 'iron_grip', days: 120, metrics: [reading('flexibility', STALE_DAYS + 10)] },
      { programId: null, days: 120, metrics: [reading('flexibility', STALE_DAYS + 10)] },
    ];
    for (const options of cases) {
      const ids = tipsFor(options).map((t) => t.id).filter((id) => id === 'no-baseline' || id === 'stale-benchmarks');
      expect(ids.length, JSON.stringify(options)).toBeLessThanOrEqual(1);
    }
  });

  /**
   * Two ids rather than two signatures under one, so waving away *"nothing
   * measured yet"* does not also wave away *"three are out of date"* two
   * months later. They are different facts about different climbers.
   */
  it('signs them as different facts', () => {
    const baseline = ask({ programId: 'iron_grip' })!;
    const stale = ask({
      programId: 'iron_grip',
      days: 120,
      metrics: [reading('max_hang_20mm_7s', STALE_DAYS + 10)],
    })!;
    expect(baseline.id).not.toBe(stale.id);
  });

  /**
   * And where they sit. The baseline ask outranks the stale one because its
   * window closes, and sits under M173's `cold-start` so the front door
   * still explains itself first — the trade-off is recorded in the rule.
   */
  it('ranks the ask that expires above the one that does not', () => {
    const baseline = ask({ programId: 'iron_grip' })!;
    const stale = ask({
      programId: 'iron_grip',
      days: 120,
      metrics: [reading('max_hang_20mm_7s', STALE_DAYS + 10)],
    })!;
    const cold = tipsFor({ programId: 'iron_grip', days: 7 }).find((t) => t.id === 'cold-start')!;
    expect(stale.weight).toBeLessThan(baseline.weight);
    expect(baseline.weight).toBeLessThan(cold.weight);
  });

  /** Which shows on the front door, measured rather than reasoned about. */
  it('leads the board once the load model has warmed up', () => {
    expect(tipsFor({ programId: 'iron_grip', days: 7 })[0]!.id).toBe('cold-start');
    expect(tipsFor({ programId: 'iron_grip', days: 30 })[0]!.id).toBe('no-baseline');
  });
});
