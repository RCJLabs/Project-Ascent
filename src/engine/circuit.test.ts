import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '@/content/programs/catalogue';
import type { CircuitFormat } from '@/content/types';
import { circuitPlan, parseDuration, parseRounds } from './circuit';
import { buildTimer } from './timer';

/**
 * A circuit, on the clock (PLAN.md M99).
 *
 * The dose is authored prose and is read strictly or not at all — the rule
 * M96 arrived at when a loose parser turned every valid height label into a
 * rejection and a lenient one would have invented numbers instead.
 */

describe('reading an authored duration', () => {
  it('reads a plain number of seconds', () => {
    expect(parseDuration('20s')).toBe(20);
    expect(parseDuration('45 sec')).toBe(45);
    expect(parseDuration('90 seconds')).toBe(90);
  });

  it('reads minutes', () => {
    expect(parseDuration('1 min')).toBe(60);
    expect(parseDuration('2 minutes')).toBe(120);
  });

  // "40-60s" is a coach saying "about a minute, don't be precious". A clock
  // has to pick one, and the bottom of the range is the one that does not
  // quietly make the session harder than it was written.
  it('runs a range at its lower bound', () => {
    expect(parseDuration('40-60s')).toBe(40);
    expect(parseDuration('50-70s')).toBe(50);
    expect(parseDuration('1-2 min')).toBe(60);
  });

  it('tolerates spacing and an en dash', () => {
    expect(parseDuration(' 45 - 60 s ')).toBe(45);
    expect(parseDuration('45–60s')).toBe(45);
  });

  // The exercise is either timed or counted and the program has not said
  // which, so the honest answer is that the clock does not know — even
  // though a perfectly good "30-60s" is sitting right there.
  it('refuses a duration with anything else attached', () => {
    expect(parseDuration('30-60s or 8-15 reps')).toBeNull();
    expect(parseDuration('40s each')).toBeNull();
  });

  it('refuses a word', () => {
    expect(parseDuration('Minimal')).toBeNull();
    expect(parseDuration('As needed')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });

  it('refuses a bare number with no unit', () => {
    expect(parseDuration('45')).toBeNull();
  });

  it('refuses zero, which is not a length', () => {
    expect(parseDuration('0s')).toBeNull();
  });
});

describe('reading a round count', () => {
  it('reads a number and the bottom of a range', () => {
    expect(parseRounds('3')).toBe(3);
    expect(parseRounds('2-3')).toBe(2);
    expect(parseRounds('1-2')).toBe(1);
  });

  it('refuses anything else', () => {
    expect(parseRounds('a few')).toBeNull();
    expect(parseRounds('3 rounds')).toBeNull();
    expect(parseRounds('0')).toBeNull();
  });
});

describe('turning a circuit into intervals', () => {
  const timed: CircuitFormat = { rounds: '2', work: '40-60s', restBetween: '20s' };

  it('maps rounds to sets and exercises to reps', () => {
    const plan = circuitPlan(timed, 5);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.sets).toBe(2);
    expect(plan.timer).toEqual({ workSec: 40, restSec: 20, repsPerSet: 5, setRestSec: 0 });
  });

  it('carries the rest between rounds', () => {
    const plan = circuitPlan({ rounds: '3', work: '30s', restBetweenRounds: '60s' }, 4);
    expect(plan.ok && plan.timer.setRestSec).toBe(60);
  });

  // "Minimal" is not a number and is not turned into one: the exercises run
  // back to back, which is what minimal rest means.
  it('turns an unreadable rest into no rest, not a guessed one', () => {
    const plan = circuitPlan({ rounds: '2', work: '30s', restBetween: 'Minimal' }, 3);
    expect(plan.ok && plan.timer.restSec).toBe(0);
  });

  it('refuses a circuit with no work time, and says why', () => {
    const plan = circuitPlan({ rounds: '3', restBetweenRounds: '60s' }, 4);
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.because).toMatch(/reps rather than timed/);
  });

  it('refuses a work time it cannot read, and quotes it', () => {
    const plan = circuitPlan({ rounds: '2-3', work: '30-60s or 8-15 reps' }, 4);
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.because).toContain('30-60s or 8-15 reps');
  });

  it('refuses a round count it cannot read', () => {
    const plan = circuitPlan({ rounds: 'a few', work: '30s' }, 4);
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.because).toMatch(/rounds/);
  });

  // Twelve of the seventeen circuits are menus, so which exercises are in a
  // round is the climber's pick and not something to invent.
  it('refuses to run a circuit of nothing', () => {
    const plan = circuitPlan(timed, 0);
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.because).toMatch(/Tick the exercises/);
  });

  /**
   * The two awkward rules in `buildTimer` land exactly right on a circuit:
   * the rest between exercises is dropped after the last exercise of a round
   * because the round rest takes over, and the round rest is dropped after
   * the last round because the circuit is over.
   */
  it('expands through buildTimer without a trailing rest', () => {
    const plan = circuitPlan({ rounds: '2', work: '30s', restBetween: '10s', restBetweenRounds: '60s' }, 3);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const built = buildTimer(plan.timer, plan.sets, 0);
    expect(built.segments.map((s) => `${s.kind}${s.seconds}`)).toEqual([
      'work30', 'rest10', 'work30', 'rest10', 'work30',
      'setRest60',
      'work30', 'rest10', 'work30', 'rest10', 'work30',
    ]);
  });
});

/**
 * What the shipped catalogue actually gets.
 *
 * Measured rather than asserted from memory, and kept as a test so an
 * authored circuit that stops being runnable is a failure rather than a
 * silent loss.
 */
describe('the circuits the catalogue ships', () => {
  const circuits = CATALOGUE.flatMap((program) =>
    (program.sessionTypes ?? []).flatMap((type) =>
      (type.blocks ?? []).flatMap((block) =>
        Object.entries(block.perPhase)
          .filter(([, entry]) => entry.circuit !== undefined)
          .map(([phase, entry]) => ({
            where: `${program.id}/${type.id}/${block.id}/${phase}`,
            circuit: entry.circuit!,
            // A menu's round is the pick; a plain list's is all of them.
            steps: entry.selection?.pick ?? entry.exercises.length,
          })),
      ),
    ),
  );

  it('has seventeen of them', () => {
    expect(circuits).toHaveLength(17);
  });

  it('gives a clock to the nine that carry a readable work time', () => {
    const runnable = circuits.filter((c) => circuitPlan(c.circuit, c.steps).ok);
    expect(runnable).toHaveLength(9);
  });

  // Seven are rep-based and one is ambiguous by construction. Every one of
  // them gets a sentence rather than a guessed duration.
  it('gives the other eight a reason instead', () => {
    const refused = circuits
      .map((c) => ({ ...c, plan: circuitPlan(c.circuit, c.steps) }))
      .filter((c) => !c.plan.ok);
    expect(refused).toHaveLength(8);
    for (const row of refused) {
      expect(row.plan.ok).toBe(false);
      if (row.plan.ok) continue;
      expect(row.plan.because.length, row.where).toBeGreaterThan(20);
    }
  });

  it('never builds a circuit longer than an hour from authored prose', () => {
    for (const { where, circuit, steps } of circuits) {
      const plan = circuitPlan(circuit, steps);
      if (!plan.ok) continue;
      const built = buildTimer(plan.timer, plan.sets);
      expect(built.totalSeconds, where).toBeLessThan(3600);
    }
  });
});
