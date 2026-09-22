import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { code } from '@/test/source';

/**
 * The suite says the same thing on every day of the week (PLAN.md M179b).
 *
 * It did not. Six test files laid their fixtures on Mondays, Wednesdays and
 * Fridays inside a window ending on `today()` — a realistic three-a-week
 * pattern, and a different **number of sessions** depending on which weekday
 * today happens to be. An eighteen-day window holding eight sessions on a
 * Monday holds seven on a Tuesday, one short of the gate `domain:drills`
 * opens at, and three tests went red at midnight on code that had not
 * changed.
 *
 * The tests themselves were right: each carried a guard refusing to pass
 * vacuously — *"the fixture lost its domain gap"* — and those guards are what
 * fired. The fixtures were wrong.
 *
 * ## The two fixes, and which applies where
 *
 * An engine test can simply anchor to a constant, because every rule it
 * exercises takes its date as an argument. A **screen** test cannot: it goes
 * through the stores and `useTips`, which read the clock themselves. So those
 * seed at a fixed stride from today — every other day — which gives the same
 * density with no dependence on what day it is.
 *
 * This file holds the line rather than trusting it to be remembered, in the
 * same spirit as `perf.test.ts`'s check that clocks retry and byte counts do
 * not: a rule stated in six places is a rule until someone writes a seventh.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const SELF = 'src/deterministic.test.ts';

const TESTS = walk('src')
  // Not itself: the fixtures below are strings *about* the pattern, and a
  // sweep that reads its own self-check as a finding can never be green.
  .filter((p) => /\.test\.tsx?$/.test(p) && p !== SELF)
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

/**
 * A fixture that reads the weekday **and** anchors to now — the assertion
 * itself, named so the self-check below runs the same one.
 *
 * Comments come off first, for the reason `ui/wired.test.ts` gives for its
 * own predicate: the first run of this flagged the two files it had just
 * *fixed*, because the note explaining why they no longer call `today()`
 * says `today()`. A check that fails on its own explanation is the defect it
 * is looking for, one level up.
 */
export function weekdayDependent(files: readonly { path: string; source: string }[]): string[] {
  return files
    .filter((f) => {
      const stripped = code(f.source);
      return /getUTCDay\(\)|getDay\(\)/.test(stripped) && /\btoday\(\)/.test(stripped);
    })
    .map((f) => f.path)
    .sort();
}

describe('no fixture changes shape with the weekday', () => {
  it('finds the test files to check', () => {
    expect(TESTS.length).toBeGreaterThan(280);
    expect(TESTS.some((f) => f.path === 'src/engine/coldStart.test.ts')).toBe(true);
  });

  it('has none that read the weekday off a window ending today', () => {
    expect(weekdayDependent(TESTS)).toEqual([]);
  });

  /**
   * Reading the weekday is fine on its own — `loadModel.test.ts` and
   * `trip.test.ts` both do it against fixed dates, which is deterministic.
   * It is the pair that bites.
   */
  it('leaves a weekday read against a fixed date alone', () => {
    const fixed = TESTS.filter((f) => /getUTCDay\(\)/.test(f.source));
    expect(fixed.length, 'nothing reads a weekday, so this proves nothing').toBeGreaterThan(0);
    expect(weekdayDependent(fixed)).toEqual([]);
  });
});

describe('the check itself works', () => {
  const file = (path: string, source: string) => ({ path, source });

  it('would notice the pair that broke the suite', () => {
    const tree = [
      file('a.test.ts', 'const DAY = today();\nif (![1, 3, 5].includes(d.getUTCDay())) continue;'),
    ];
    expect(weekdayDependent(tree)).toEqual(['a.test.ts']);
  });

  it('allows either half on its own', () => {
    const tree = [
      file('b.test.ts', "const DAY = '2026-03-02';\nd.getUTCDay();"),
      file('c.test.ts', 'const DAY = today();\nconst then = addDays(DAY, -6);'),
    ];
    expect(weekdayDependent(tree)).toEqual([]);
  });
});
