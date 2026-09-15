import { describe, expect, it } from 'vitest';
import { buildAge } from './offline';

/**
 * How old the copy in front of you is (PLAN.md M206).
 *
 * The app knew one thing about itself — `APP_VERSION`, which has read
 * `0.1.0` since the first commit — so *"a new version is ready"* had no
 * scale on it. This is the half that moves on its own.
 */

const AT = '2026-09-01T12:00:00.000Z';
const at = (days: number): number => Date.parse(AT) + days * 86_400_000;

describe('the age of a build', () => {
  it('says nothing without a build behind it', () => {
    // A runtime with no define in place. Silence rather than a guess, which
    // is the bargain `version.ts` already makes about the version itself.
    expect(buildAge(null, at(3))).toBeNull();
  });

  it('says nothing about a stamp it cannot read', () => {
    expect(buildAge('not a date', at(3))).toBeNull();
  });

  it.each([
    [0, 'built today'],
    [0.9, 'built today'],
    [1, 'built yesterday'],
    [2, 'built 2 days ago'],
    [13, 'built 13 days ago'],
    [14, 'built 2 weeks ago'],
    [30, 'built 4 weeks ago'],
    [60, 'built 2 months ago'],
    [200, 'built 7 months ago'],
  ])('reads %s days as "%s"', (days, said) => {
    expect(buildAge(AT, at(days))).toBe(said);
  });

  it('reads a clock behind the build as today', () => {
    // A device whose clock is slow is not a build from the future, and
    // saying so would be the app reporting on the wrong thing.
    expect(buildAge(AT, at(-5))).toBe('built today');
  });

  it('changes as the days pass, which the version never did', () => {
    // The whole point: two copies of this app are distinguishable now.
    const said = [1, 5, 20, 90].map((d) => buildAge(AT, at(d)));
    expect(new Set(said).size).toBe(said.length);
  });
});
