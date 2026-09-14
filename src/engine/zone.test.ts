import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { buildLoadIndex, loadStateAt, zonesFor } from '@/engine/derive';

/**
 * `zonesFor` is the optimisation, so it has to agree with the thing it
 * replaced (PLAN.md M155).
 *
 * There were two optimisations and this pinned the newer against the older:
 * `zoneAt` was written for `deriveXp`, `zonesFor` replaced it by batching,
 * and `zoneAt` then had no caller but this file. Deleting it leaves one
 * reference implementation and one fast path, which is a stronger check
 * than two fast paths agreeing with each other.
 */
describe('zonesFor matches loadStateAt', () => {
  const make = (n: number, rpe: (i: number) => number, spacing: number): Session[] => {
    const out: Session[] = [];
    const d = new Date('2026-01-01T00:00:00');
    for (let i = 0; i < n; i += 1) {
      const key = d.toISOString().slice(0, 10);
      out.push({
        id: `${key}#0`, date: key, planned: false, completed: true, rewarded: true,
        mode: 'indoor', rpe: rpe(i), durationMin: 60 + (i % 90), climbs: [],
        deload: i % 11 === 0,
        createdAt: `${key}T00:00:00.000Z`, updatedAt: `${key}T00:00:00.000Z`,
      } as Session);
      d.setDate(d.getDate() + spacing);
    }
    return out;
  };

  it('agrees across every shape, in one pass', () => {
    for (const [n, rpe, spacing] of [
      [0, () => 5, 2], [3, () => 5, 2], [40, (i: number) => 5 + (i % 5), 1],
      [60, (i: number) => (i > 40 ? 10 : 3), 2], [80, () => 8, 3],
      [30, (i: number) => (i % 7 === 0 ? 0 : 6), 1], [200, (i: number) => 4 + (i % 6), 2],
    ] as const) {
      const sessions = make(n, rpe, spacing);
      const index = buildLoadIndex(sessions);
      const dates = [...new Set(sessions.map((s) => s.date))].sort();
      expect(zonesFor(index, dates)).toEqual(dates.map((d) => loadStateAt(index, d).zone));
    }
  });

  it('crosses a year and a leap day correctly', () => {
    const sessions = make(400, () => 6, 1);
    const index = buildLoadIndex(sessions);
    const dates = [...new Set(sessions.map((s) => s.date))].sort();
    expect(zonesFor(index, dates)).toEqual(dates.map((d) => loadStateAt(index, d).zone));
  });
});
