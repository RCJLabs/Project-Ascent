import { beforeAll, describe, expect, it } from 'vitest';
import { loadPrograms } from '@/content/programs';
import type { Session } from '@/db/sessions';
import { buildTips, type Tip } from './coach';
import { deriveClimberState } from './derive';
import { addDays } from './dates';
import { diagnose, recoverySentence } from './plateau';

/**
 * Two cards, one number (PLAN.md M190).
 *
 * `load-spike` sits at weight 93 and the recovery verdict at 92, so on the
 * board where load is the problem they were adjacent and quoting the same
 * ratio to two decimal places:
 *
 *     93  Load spike       You are at 2.43× your own four-week baseline…
 *     92  Recovery is the blocker
 *                          …your load has jumped to 2.43× your baseline…
 *
 * Measured before anything was changed, and kept here as the test. What is
 * dropped is only the clause that repeats — the verdict is a different fact
 * from *ease off*, and it is the one that explains why Progress has stopped
 * giving a read.
 */

beforeAll(async () => {
  await loadPrograms();
});

const DAY = '2026-03-02';

function train(
  days: readonly number[],
  options: { rpe?: number; minutes?: number } = {},
): Session[] {
  return days.map((d) => {
    const date = addDays(DAY, -d);
    return {
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: options.rpe ?? 7,
      durationMin: options.minutes ?? 90,
      warmup: true,
      drillDone: false,
      climbs: [
        { id: `c${d}`, grade: 'V4', scale: 'V', count: 4, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session;
  });
}

const steady = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let d = from; d >= to; d -= 2) out.push(d);
  return out;
};

/** A steady log and then a week several times heavier: zone `danger`. */
const SPIKE_AND_GRIND = [
  ...train(steady(76, 8)),
  ...train([6, 5, 4, 3, 2, 1], { rpe: 9, minutes: 180 }),
];
/** The same spike with rest days in it, so nothing is grinding. */
const SPIKE_ONLY = [...train(steady(76, 10)), ...train([8, 6, 4, 2], { rpe: 10, minutes: 240 })];

function read(sessions: Session[], injuries: string[] = []) {
  const state = deriveClimberState(sessions, { today: DAY });
  const diagnosis = diagnose({ sessions, state, injuries: injuries as never, today: DAY });
  const tips = buildTips({
    sessions,
    state,
    diagnosis,
    projects: [],
    metrics: [],
    programMetrics: [],
    objectives: [],
    today: DAY,
  } as never);
  const find = (id: string): Tip | undefined => tips.find((t) => t.id === id);
  return { state, diagnosis, tips, recovery: find('recovery'), spike: find('load-spike') };
}

/** The ratio as the spike card writes it, so the test cannot drift from it. */
const ratioOf = (sessions: Session[]): string =>
  deriveClimberState(sessions, { today: DAY }).load.acwr!.toFixed(2);

describe('the number said twice', () => {
  it('is on one card now, not two', () => {
    const { recovery, spike } = read(SPIKE_AND_GRIND);
    const ratio = ratioOf(SPIKE_AND_GRIND);
    expect(spike!.body, 'the spike stopped carrying the number').toContain(`${ratio}×`);
    expect(recovery!.body, 'both cards still quote the ratio').not.toContain(`${ratio}×`);
  });

  /** Both cards are still there. Neither fact was the duplicate. */
  it('keeps both cards, and keeps them adjacent', () => {
    const { tips, recovery, spike } = read(SPIKE_AND_GRIND);
    expect(spike).toBeDefined();
    expect(recovery).toBeDefined();
    expect(tips.indexOf(spike!), 'the spike stopped leading').toBeLessThan(tips.indexOf(recovery!));
    expect(recovery!.headline).toBe('Recovery is the blocker');
  });

  /** And the reason that is not a duplicate survives. */
  it('still says the part the spike card does not', () => {
    const { recovery } = read(SPIKE_AND_GRIND);
    expect(recovery!.body).toMatch(/6 training days deep with no rest/);
  });

  /**
   * When the load was the *only* reason there is nothing left to list, and
   * the card must not fill the gap by saying the number again.
   */
  it('says the verdict without the number when the load was the whole of it', () => {
    const { recovery, diagnosis } = read(SPIKE_ONLY);
    expect(diagnosis.reasons.map((r) => r.kind)).toEqual(['overload']);
    expect(recovery!.body).toMatch(/The load ratio is the whole of it/);
    expect(recovery!.body).not.toContain(`${ratioOf(SPIKE_ONLY)}×`);
    expect(recovery!.body, 'the verdict itself went with the clause').toMatch(
      /Nothing else in your training is worth changing/,
    );
  });
});

describe('what is left alone', () => {
  /**
   * Progress renders `explanation` whole and has nothing beside it, so the
   * sentence there keeps every clause — including the number.
   */
  it('leaves the Progress sentence complete', () => {
    const { diagnosis } = read(SPIKE_AND_GRIND);
    const ratio = ratioOf(SPIKE_AND_GRIND);
    expect(diagnosis.explanation).toContain(`${ratio}×`);
    expect(diagnosis.explanation).toMatch(/6 training days deep/);
    expect(diagnosis.explanation, 'two makers of one sentence').toBe(
      recoverySentence(diagnosis.reasons),
    );
  });

  it('changes nothing for a climber whose reason is an injury', () => {
    const { recovery, spike } = read(train(steady(76, 2)), ['fingers']);
    expect(spike, 'this fixture has a spike, so it proves nothing').toBeUndefined();
    expect(recovery!.body).toMatch(/you have logged a fingers injury/);
  });

  /**
   * A deload suppresses the spike card, and then this card is the only place
   * the number appears — which is why the drop is keyed on the spike really
   * being there rather than on the zone.
   *
   * Driven with a diagnosis built by hand, because the coach consumes one
   * and that is the seam: reproducing `inPlannedDeload` needs a program, a
   * start date and a plan, none of which this rule reads. The first draft of
   * this test asserted the fixture's shape instead of the branch, which is
   * the vacuous kind this file would rather not have.
   */
  it('keeps the number when there is no spike card to carry it', () => {
    const quiet = train(steady(76, 2));
    const state = deriveClimberState(quiet, { today: DAY });
    expect(state.load.zone, 'this fixture has a spike, so it proves nothing').not.toBe('danger');

    const overloadOnly = {
      verdict: 'recovery-compromised' as const,
      headline: 'Recovery first',
      reasons: [{ kind: 'overload' as const, text: 'your load has jumped to 2.43× your baseline' }],
      explanation: 'unused here',
      evidence: [],
    };
    const tips = buildTips({
      sessions: quiet,
      state,
      diagnosis: overloadOnly,
      projects: [],
      metrics: [],
      programMetrics: [],
      objectives: [],
      today: DAY,
    } as never);

    expect(tips.find((t) => t.id === 'load-spike'), 'a spike fired after all').toBeUndefined();
    expect(
      tips.find((t) => t.id === 'recovery')!.body,
      'the only place the number could appear dropped it',
    ).toContain('2.43×');
  });
});

describe('what a dismissal covers', () => {
  /**
   * The reasons, not just the verdict. Waving this away with a tweaked
   * finger must not also wave it away three weeks later when the reason is a
   * load spike — M175's rule, applied to a card that has three quite
   * different things to say.
   */
  it('signs the reasons, not the verdict alone', () => {
    const injury = read(train(steady(76, 2)), ['fingers']).recovery!;
    const load = read(SPIKE_ONLY).recovery!;
    const both = read(SPIKE_AND_GRIND).recovery!;
    expect(injury.signature).not.toBe(load.signature);
    expect(load.signature).not.toBe(both.signature);
    expect(injury.signature).toBe('recovery-compromised:injury');
    expect(both.signature).toBe('recovery-compromised:overload+grinding');
  });
});
