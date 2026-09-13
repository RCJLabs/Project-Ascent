import { describe, expect, it } from 'vitest';
import type { SessionType } from '@/content/types';
import { newSession, type Session } from '@/db/sessions';
import { effortOfDay, effortOfRpe, RPE_TIERS } from './effort';

/**
 * How hard a logged day was (PLAN.md M144).
 *
 * The month grid drew every completed day as the same tick. These hold the
 * rule that decides the shade: the climber's own rating first, the plan
 * only where nobody rated one, and nothing at all where neither is known.
 */

const day = (patch: Partial<Session>): Session =>
  newSession('2026-09-09', 0, { completed: true, ...patch });

const type = (patch: Partial<SessionType> = {}): SessionType =>
  ({ id: 'perf', name: 'Performance', icon: '🔥', intensity: 'max', ...patch }) as SessionType;

describe('an RPE, as one of the four intensities', () => {
  it('reads the top of the scale as limit work', () => {
    expect(effortOfRpe(10)).toBe('max');
    expect(effortOfRpe(9)).toBe('max');
  });

  it('reads the working range as hard', () => {
    expect(effortOfRpe(8)).toBe('hard');
    expect(effortOfRpe(7)).toBe('hard');
  });

  it('reads the middle as moderate and the bottom as easy', () => {
    expect(effortOfRpe(6)).toBe('moderate');
    expect(effortOfRpe(5)).toBe('moderate');
    expect(effortOfRpe(4)).toBe('easy');
    expect(effortOfRpe(1)).toBe('easy');
  });

  // Each boundary from both sides, because a tier is exactly its edges.
  it('puts each boundary on the harder side of the line', () => {
    for (const [floor, intensity] of RPE_TIERS) {
      expect(effortOfRpe(floor), `${floor}`).toBe(intensity);
      if (floor > 1) expect(effortOfRpe(floor - 1), `${floor - 1}`).not.toBe(intensity);
    }
  });

  /**
   * `Session.rpe` is whatever was in the database, so the guard is not
   * decoration — rebuild, never cast. NaN and a negative fall out of the
   * tiers on their own; an infinity clears every floor and would read as
   * limit work, which is the case the finite check is actually for.
   */
  it('says nothing about a number that is not an RPE', () => {
    expect(effortOfRpe(undefined)).toBeNull();
    expect(effortOfRpe(Number.NaN)).toBeNull();
    expect(effortOfRpe(0)).toBeNull();
    expect(effortOfRpe(-4)).toBeNull();
    expect(effortOfRpe(Number.POSITIVE_INFINITY)).toBeNull();
    expect(effortOfRpe(Number.NEGATIVE_INFINITY)).toBeNull();
  });
});

describe('a day, from the sessions in it', () => {
  it('takes the climber s own rating', () => {
    expect(effortOfDay([day({ rpe: 9 })])).toBe('max');
  });

  // A hard morning and an easy evening is a hard day.
  it('takes the hardest session when a day holds several', () => {
    expect(effortOfDay([day({ rpe: 3 }), day({ rpe: 8 })])).toBe('hard');
    expect(effortOfDay([day({ rpe: 8 }), day({ rpe: 3 })])).toBe('hard');
  });

  it('ignores a session that was never finished', () => {
    expect(effortOfDay([day({ rpe: 4 }), day({ rpe: 10, completed: false })])).toBe('easy');
  });

  /**
   * The plan is a weaker statement than the rating — it is what was asked
   * for, not what was done — so it only speaks when nothing was rated.
   */
  it('falls back to what the day was planned as', () => {
    expect(effortOfDay([day({})], type())).toBe('max');
    expect(effortOfDay([day({})], type({ intensity: 'moderate' }))).toBe('moderate');
  });

  it('prefers the rating over the plan when both are there', () => {
    expect(effortOfDay([day({ rpe: 5 })], type({ intensity: 'max' }))).toBe('moderate');
  });

  // A rest day planned is not an effort logged, however the climber filled
  // the day in.
  it('reads nothing from a planned rest day', () => {
    expect(effortOfDay([day({})], type({ isRest: true }))).toBeNull();
  });

  it('says nothing when neither the climber nor the plan said', () => {
    expect(effortOfDay([day({})])).toBeNull();
    expect(effortOfDay([])).toBeNull();
  });
});
