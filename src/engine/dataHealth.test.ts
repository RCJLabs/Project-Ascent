import { describe, expect, it } from 'vitest';
import { storagePressure } from './offline';
import {
  HEALTH_STORES,
  RECORD_NOUN,
  countOf,
  dataHealth,
  describeHealth,
  describeProblem,
  type DataHealthInput,
} from './dataHealth';

/**
 * The data-health rules (PLAN.md M80).
 *
 * Pure, so every one of these is a statement about what a climber is told
 * for a given database — not about a database.
 */

const input = (over: Partial<DataHealthInput> = {}): DataHealthInput => ({
  counts: { sessions: 412, projects: 7, metrics: 23, media: 4 },
  problems: [],
  orphans: { count: 0, bytes: 0 },
  stale: [],
  mediaBytes: 1_200_000,
  pressure: null,
  ...over,
});

const kinds = (over: Partial<DataHealthInput> = {}) => dataHealth(input(over)).findings.map((f) => f.kind);

describe('the inventory', () => {
  it('counts every store, including the ones with nothing in them', () => {
    const health = dataHealth(input());
    expect(health.rows.map((r) => r.store)).toEqual([...HEALTH_STORES]);
    expect(health.rows.find((r) => r.store === 'game')?.count).toBe(0);
  });

  it('totals what the app is actually holding', () => {
    expect(dataHealth(input()).total).toBe(412 + 7 + 23 + 4);
  });

  it('measures only what it can measure', () => {
    // Photos are blobs with a size. A session is an object graph, and
    // reporting a byte count for it would be inventing one.
    const rows = dataHealth(input()).rows;
    expect(rows.find((r) => r.store === 'media')?.bytes).toBe(1_200_000);
    expect(rows.find((r) => r.store === 'sessions')?.bytes).toBeUndefined();
  });

  it('marks the store a read had trouble with, not just the total', () => {
    const health = dataHealth(input({ problems: [{ store: 'projects', dropped: 2, repaired: 1 }] }));
    expect(health.rows.find((r) => r.store === 'projects')).toMatchObject({ dropped: 2, repaired: 1 });
    expect(health.rows.find((r) => r.store === 'sessions')).toMatchObject({ dropped: 0, repaired: 0 });
  });

  it('gives every store a word for a person', () => {
    for (const store of HEALTH_STORES) {
      expect(RECORD_NOUN[store], store).toBeDefined();
      expect(countOf(1, store)).not.toContain(store === 'media' ? 'media' : `1 ${store}`);
    }
  });

  it('says one and many differently', () => {
    expect(countOf(1, 'sessions')).toBe('1 session');
    expect(countOf(2, 'sessions')).toBe('2 sessions');
  });
});

describe('what is worth acting on', () => {
  it('finds nothing in a healthy database', () => {
    expect(kinds()).toEqual([]);
  });

  it('puts records it could not read first, above everything', () => {
    // The only one of these that means something the climber wrote is not
    // being shown at all.
    const found = kinds({
      problems: [{ store: 'sessions', dropped: 3, repaired: 1 }],
      orphans: { count: 2, bytes: 900 },
      stale: [{ id: 'a', date: '2026-01-01', ms: 36_000_000 }],
    });
    expect(found[0]).toBe('unreadable');
  });

  it('grades losing data above being untidy', () => {
    const health = dataHealth(input({ problems: [{ store: 'sessions', dropped: 3, repaired: 2 }] }));
    expect(health.findings.find((f) => f.kind === 'unreadable')?.tone).toBe('warn');
    expect(health.findings.find((f) => f.kind === 'repaired')?.tone).toBe('caution');
  });

  it('names the store, not just the count', () => {
    const detail = dataHealth(
      input({ problems: [{ store: 'projects', dropped: 2, repaired: 0 }] }),
    ).findings[0]!.detail;
    expect(detail).toContain('2 projects');
  });

  it('adds up a problem that spans stores', () => {
    const health = dataHealth(
      input({ problems: [{ store: 'sessions', dropped: 3, repaired: 0 }, { store: 'projects', dropped: 2, repaired: 0 }] }),
    );
    expect(health.findings[0]!.headline).toContain('5 records');
  });

  it('offers to tidy the orphans, and only the orphans', () => {
    const health = dataHealth(input({ orphans: { count: 2, bytes: 900 }, stale: [{ id: 'a', date: '2026-01-01', ms: 1 }] }));
    expect(health.findings.find((f) => f.kind === 'orphans')?.fixable).toBe(true);
    // A session left open is the climber's call — finish it or throw it
    // away — so a button that swept it would be deciding for them.
    expect(health.findings.find((f) => f.kind === 'stale')?.fixable).toBeUndefined();
  });

  it('counts every stale session, not the first one', () => {
    const stale = [1, 2, 3].map((n) => ({ id: `s${n}`, date: '2026-01-0' + n, ms: 36_000_000 }));
    expect(dataHealth(input({ stale })).findings[0]!.headline).toContain('3 sessions');
  });
});

describe('one of a thing reads as one of a thing', () => {
  /**
   * Every headline, at one and at two.
   *
   * "1 photo belong to something that is gone" shipped for exactly one
   * browser run — the same fault as M70's "Day of the trip (of the trip)".
   * A count and its verb are written in the same string and nothing made
   * them agree.
   */
  const headline = (over: Partial<DataHealthInput>) => dataHealth(input(over)).findings[0]!.headline;

  it('agrees with itself about the orphans', () => {
    expect(headline({ orphans: { count: 1, bytes: 9 } })).toBe('1 photo belongs to something that is gone');
    expect(headline({ orphans: { count: 2, bytes: 9 } })).toBe('2 photos belong to something that is gone');
  });

  it('agrees with itself about the sessions', () => {
    const stale = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, date: '2026-01-01', ms: 1 }));
    expect(headline({ stale: stale(1) })).toBe('1 session was left open');
    expect(headline({ stale: stale(2) })).toBe('2 sessions were left open');
  });

  it('never writes a singular count against a plural verb', () => {
    // The blunt version of the rule, run over every finding the page can
    // produce: a headline opening "1 " may not be followed by a plural verb.
    const singulars = [
      headline({ orphans: { count: 1, bytes: 9 } }),
      headline({ stale: [{ id: 'a', date: '2026-01-01', ms: 1 }] }),
      headline({ problems: [{ store: 'sessions', dropped: 1, repaired: 0 }] }),
      headline({ problems: [{ store: 'sessions', dropped: 0, repaired: 1 }] }),
    ];
    for (const said of singulars) {
      if (!said.startsWith('1 ')) continue;
      expect(said, said).not.toMatch(/\b(belong|were|are|have)\b/);
    }
  });

  it('says the headline for one dropped record in the singular too', () => {
    expect(headline({ problems: [{ store: 'sessions', dropped: 1, repaired: 0 }] })).toBe(
      '1 record could not be read',
    );
    expect(headline({ problems: [{ store: 'sessions', dropped: 0, repaired: 1 }] })).toBe(
      '1 record was read without part of its contents',
    );
  });
});

describe('storage', () => {
  const read = (over: Parameters<typeof storagePressure>[0]) => storagePressure(over);

  it('says nothing when the browser has promised and has room', () => {
    expect(kinds({ pressure: read({ usage: 10, quota: 1000, persisted: true }) })).toEqual([]);
  });

  it('says nothing when the browser will not say', () => {
    // 'unknown' is not a finding: an app that cannot read the quota has not
    // discovered a problem, it has discovered a browser.
    expect(kinds({ pressure: read({ persisted: true }) })).toEqual([]);
  });

  it('warns when the data can be evicted', () => {
    const health = dataHealth(input({ pressure: read({ usage: 10, quota: 1000, persisted: false }) }));
    expect(health.findings.map((f) => f.kind)).toEqual(['storage']);
    expect(health.findings[0]!.tone).toBe('warn');
  });

  it('takes its words from the storage model rather than writing its own', () => {
    const pressure = read({ usage: 10, quota: 1000, persisted: false });
    const health = dataHealth(input({ pressure }));
    expect(health.findings[0]!.headline).toBe(pressure.headline);
    expect(health.findings[0]!.detail).toBe(pressure.detail);
  });
});

describe('the headline', () => {
  it('says everything is fine, rather than saying nothing', () => {
    // The whole point of the page: silence and health look identical.
    expect(describeHealth(dataHealth(input()))).toMatch(/all readable.*Nothing needs attention/);
  });

  it('counts what is worth looking at', () => {
    const health = dataHealth(input({ orphans: { count: 2, bytes: 900 } }));
    expect(describeHealth(health)).toMatch(/1 thing worth knowing about/);
  });

  it('is more urgent when something is being lost', () => {
    const health = dataHealth(input({ problems: [{ store: 'sessions', dropped: 1, repaired: 0 }] }));
    expect(describeHealth(health)).toMatch(/looking at now/);
  });

  it('reports the total in every case', () => {
    expect(describeHealth(dataHealth(input()))).toContain('446');
  });
});

describe('the sentence Settings and the page share', () => {
  it('says what was dropped and what was repaired', () => {
    const said = describeProblem({ store: 'sessions', dropped: 2, repaired: 1 });
    expect(said).toContain('2 sessions could not be read');
    expect(said).toContain('1 session was missing part of its contents');
  });

  it('agrees with itself about singular and plural', () => {
    expect(describeProblem({ store: 'projects', dropped: 1, repaired: 0 })).toContain('1 project could not be read and was left out');
  });

  it('always says what to do about it', () => {
    for (const problem of [
      { store: 'sessions', dropped: 1, repaired: 0 },
      { store: 'sessions', dropped: 0, repaired: 1 },
    ]) {
      expect(describeProblem(problem)).toMatch(/Importing a newer one replaces them/);
    }
  });
});
