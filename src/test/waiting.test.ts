import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SLEEPS_ON_PURPOSE, unexplainedSleeps } from './waiting';

/**
 * No test waits by guessing how long a machine takes (PLAN.md M304).
 *
 * The rule and the reason are in `waiting.ts`. This is the sweep, and the
 * decision it uses is a pure function for the same reason `assertions.ts`
 * is: a guard that can only be exercised by the thing it guards cannot be
 * shown to work, because a broken one and a clean suite look identical.
 */

function testFiles(dir = 'src'): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...testFiles(path));
      continue;
    }
    if (!/\.test\.tsx?$/.test(entry)) continue;
    out.push({ path, source: readFileSync(path, 'utf8') });
  }
  return out;
}

const FILES = testFiles();

describe('a wait that is a bet on a clock', () => {
  it('reads enough of the suite to be worth trusting', () => {
    // A sweep that walked nothing would pass every assertion below.
    expect(FILES.length).toBeGreaterThan(400);
    expect(FILES.map((f) => f.path)).toContain('src/test/waiting.test.ts');
  });

  it('is not in any test that has no reason to be', () => {
    const { unexplained } = unexplainedSleeps(FILES);
    expect(
      unexplained,
      'a sleep is a guess about the machine; wait for the thing instead, or say why the duration is the subject in SLEEPS_ON_PURPOSE',
    ).toEqual([]);
  });

  /** Exact rather than a floor, for the reason `wired.test.ts` gives. */
  it('has no reason left over for a file that stopped sleeping', () => {
    const { stale } = unexplainedSleeps(FILES);
    expect(stale, 'these no longer sleep, so the exemption is stale').toEqual([]);
  });

  it('gives every exemption a reason worth reading', () => {
    for (const [path, why] of Object.entries(SLEEPS_ON_PURPOSE)) {
      expect(why.length, `${path} has no reason`).toBeGreaterThan(30);
    }
  });

  /**
   * The finding itself, so the rule cannot be quietly relaxed back to it:
   * a sleep and then a read is the shape that failed, and `waitFor` asking
   * again until it is true is the shape that does not.
   */
  it('finds the shape it is looking for, and leaves a real wait alone', () => {
    const bet = { path: 'a.test.ts', source: 'await new Promise((r) => setTimeout(r, 60));' };
    const wait = { path: 'b.test.ts', source: 'await waitFor(() => expect(x).toBe(1));' };
    expect(unexplainedSleeps([bet]).unexplained).toEqual(['a.test.ts']);
    expect(unexplainedSleeps([wait]).unexplained).toEqual([]);
    // Whatever the binding is called, and whatever the number is.
    const named = { path: 'c.test.ts', source: 'new Promise((resolve) => setTimeout(resolve, 0))' };
    expect(unexplainedSleeps([named]).unexplained).toEqual(['c.test.ts']);
  });
});
