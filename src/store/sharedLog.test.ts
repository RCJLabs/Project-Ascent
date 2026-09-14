import { execSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { allSessions, useSessions } from './sessions';
import { clearClimberStateCache, deriveClimberState } from '@/engine/derive';
import { newSession, type Session } from '@/db/sessions';

/**
 * One flattening and one derivation, shared (PLAN.md M157).
 *
 * These are the two caches the milestone rests on, checked as units. The
 * claim they exist to support — that a *page* pays for one derivation rather
 * than one per consumer — is in `features/oneDerivation.test.tsx`, because it
 * is a claim about React and only rendering can settle it.
 */

const done = (date: string): Session => ({ ...newSession(date, 0), completed: true, rpe: 6, durationMin: 60 });

const log = (...dates: string[]): Record<string, Session[]> =>
  Object.fromEntries(dates.map((d) => [d, [done(d)]]));

/**
 * Grep output minus the two places the pattern is right: the store, where
 * `allSessions` is defined, and tests, which show it on purpose.
 */
function offenders(grepOutput: string): string[] {
  return grepOutput
    .trim()
    .split('\n')
    .filter((line) => line !== '')
    .filter((line) => !line.startsWith('src/store/sessions.ts:'))
    .filter((line) => !/\.test\.tsx?:/.test(line));
}

describe('nothing flattens the log for itself', () => {
  /**
   * A scan rather than a list, for the reason M153 rewrote the prescription
   * guard and M152 wrote the reachability one: a list is a thing you have to
   * remember to extend, and it fails exactly when a new caller appears.
   *
   * `Object.values(byDate).flat()` is the pattern, and it is correct — it
   * just builds a fresh array, which silently costs a cache miss everywhere
   * downstream. Forty-three call sites had it. One does now, inside
   * `allSessions`, which is the only place it is right.
   */
  it('outside the one place that is allowed to', () => {
    const hits = offenders(
      execSync(
        "grep -rn 'Object\\.values(byDate)\\.flat()' src --include=*.ts --include=*.tsx || true",
        { encoding: 'utf8' },
      ),
    );
    expect(hits, `flatten the log through allSessions():\n${hits.join('\n')}`).toEqual([]);
  });

  /**
   * The filtering is a function so this can feed it a known offender and a
   * known exemption. A scan whose only case is the real tree passes just as
   * well when it is looking at nothing — the battery showed that by making
   * it discard every line and watching it agree.
   */
  it('and the filtering itself keeps an offender and drops the exempt', () => {
    const sample = [
      'src/features/some/NewPage.tsx:12:  const all = Object.values(byDate).flat();',
      'src/store/sessions.ts:67:  const value = Object.values(byDate).flat();',
      'src/store/sharedLog.test.ts:99:  Object.values(byDate).flat();',
    ].join('\n');
    expect(offenders(sample)).toEqual([
      'src/features/some/NewPage.tsx:12:  const all = Object.values(byDate).flat();',
    ]);
    expect(offenders('')).toEqual([]);
  });
});

describe('the whole log, as one array', () => {
  it('hands back the same array while the store holds the same object', () => {
    const byDate = log('2025-01-01', '2025-01-03');
    expect(allSessions(byDate)).toBe(allSessions(byDate));
  });

  it('rebuilds when the store replaces it, which is how a write lands', () => {
    const before = log('2025-01-01');
    const first = allSessions(before);
    const after = { ...before, '2025-01-02': [done('2025-01-02')] };
    const second = allSessions(after);
    expect(second).not.toBe(first);
    expect(second).toHaveLength(2);
  });

  it('holds one entry, so the older log is not kept alive', () => {
    const a = log('2025-01-01');
    const b = log('2025-02-01');
    const firstA = allSessions(a);
    allSessions(b);
    // Asking for `a` again after `b` recomputes rather than returning the
    // first array: a map would have kept both, and a decade of sessions is
    // not a thing to hold twice.
    expect(allSessions(a)).not.toBe(firstA);
  });

  it('reads the store the hook reads', () => {
    const byDate = log('2025-03-01');
    useSessions.setState({ byDate, hydrated: true });
    expect(allSessions(useSessions.getState().byDate)).toHaveLength(1);
  });
});

describe('the derivation, cached on what it was given', () => {
  it('returns the same result for the same array and options', () => {
    clearClimberStateCache();
    const sessions = allSessions(log('2025-01-01', '2025-01-04'));
    expect(deriveClimberState(sessions, { today: '2025-01-05' })).toBe(
      deriveClimberState(sessions, { today: '2025-01-05' }),
    );
  });

  it('recomputes for a different array holding the same sessions', () => {
    clearClimberStateCache();
    const byDate = log('2025-01-01');
    const first = deriveClimberState(Object.values(byDate).flat(), { today: '2025-01-05' });
    const second = deriveClimberState(Object.values(byDate).flat(), { today: '2025-01-05' });
    // Not a flaw — it is the reason the flattening had to move into the
    // store. A caller that builds its own array gets nothing from the cache,
    // and before M157 every caller built its own.
    expect(second).not.toBe(first);
    expect(second.completedSessions).toBe(first.completedSessions);
  });

  it('recomputes when an option changes', () => {
    clearClimberStateCache();
    const sessions = allSessions(log('2025-01-01'));
    const three = deriveClimberState(sessions, { today: '2025-01-05', weeklyTarget: 3 });
    const five = deriveClimberState(sessions, { today: '2025-01-05', weeklyTarget: 5 });
    expect(five).not.toBe(three);
  });

  /**
   * The one that caching could have broken quietly.
   *
   * `today` defaults to the real date, so a key holding `options.today`
   * would read `undefined` both sides of midnight and hand back yesterday's
   * answer to an app left open overnight — the streak and the 30-day count
   * both move at midnight with nothing logged. The key holds the *resolved*
   * date instead.
   */
  it('does not serve yesterday to an app left open overnight', () => {
    clearClimberStateCache();
    const sessions = allSessions(log('2025-01-01'));
    const yesterday = deriveClimberState(sessions, { today: '2025-02-09' });
    const today = deriveClimberState(sessions, { today: '2025-02-10' });
    expect(today).not.toBe(yesterday);

    // And an omitted `today` keys on the same resolved value a passed one
    // does, so the two spellings share an entry rather than fighting over it.
    clearClimberStateCache();
    const implicit = deriveClimberState(sessions);
    const explicit = deriveClimberState(sessions, {});
    expect(explicit).toBe(implicit);
  });

  /**
   * The same thing with the clock actually moving, which is the only version
   * that fails for the right reason.
   *
   * With `today` omitted both sides of midnight, a key holding
   * `options.today` holds `undefined` twice and matches itself — so the two
   * assertions above pass on the broken key as happily as on the fixed one.
   * The battery proved that: it swapped `resolved.today` for `options.today`
   * and every midnight test agreed. Only rolling the clock separates them.
   */
  it('re-derives when the day rolls over with nothing logged', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2025-06-10T23:59:00'));
      clearClimberStateCache();
      const sessions = allSessions(log('2025-06-01'));
      const lastNight = deriveClimberState(sessions);
      expect(deriveClimberState(sessions)).toBe(lastNight);

      vi.setSystemTime(new Date('2025-06-11T00:01:00'));
      expect(deriveClimberState(sessions)).not.toBe(lastNight);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recomputes after the cache is cleared, which benchmarks rely on', () => {
    const sessions = allSessions(log('2025-01-01'));
    clearClimberStateCache();
    const first = deriveClimberState(sessions, { today: '2025-01-05' });
    clearClimberStateCache();
    // Same inputs, so only a cache that really emptied gives a new object.
    expect(deriveClimberState(sessions, { today: '2025-01-05' })).not.toBe(first);
  });

  it('answers the same whether it computed or remembered', () => {
    clearClimberStateCache();
    const sessions = allSessions(log('2025-01-01', '2025-01-03', '2025-01-06'));
    const computed = deriveClimberState(sessions, { today: '2025-01-07' });
    const remembered = deriveClimberState(sessions, { today: '2025-01-07' });
    expect(remembered.completedSessions).toBe(3);
    expect(remembered).toEqual(computed);
  });
});
