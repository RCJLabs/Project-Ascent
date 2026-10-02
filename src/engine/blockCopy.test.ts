import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import { PEAK_PERFORMANCE } from '@/content/programs/catalogue';
import type { MetricEntry } from '@/db/metrics';
import type { Session } from '@/db/sessions';
import { blockAdherence, describeAdherence } from './adherence';
import { blockDay, blockEnd, describeBlockEnd, type Below } from './blockEnd';
import { blockReport, describeBlock } from './blockReport';
import { addDays } from './dates';
import type { BlockRecord } from './blocks';

/**
 * The block review's copy (PLAN.md M368): M365a's seventh finding, swept.
 *
 * Each of these was found once, in one sentence, and fixed there. These hold
 * the rule over every shape of the sentence rather than the one that was
 * seen, so the next edit that brings one back is the one that fails.
 */

const IG = getProgram('iron_grip')!;
const START = '2026-03-01';
const LAST = addDays(START, IG.weeks * 7 - 1);
const ISO = /\b\d{4}-\d{2}-\d{2}\b/;
const entry = (metricId: string, day: number, value: number) => ({ id: `${metricId}@${day}`, metricId, date: addDays(START, day), value }) as unknown as MetricEntry;
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean);

describe('describeBlock', () => {
  // Every shape: improvements, holds, falls, gaps, one and many.
  const shapes: MetricEntry[][] = [
    [entry('dead_hang', 1, 60), entry('dead_hang', 80, 70)],
    [entry('dead_hang', 1, 60), entry('dead_hang', 80, 61), entry('max_pullups', 1, 10), entry('max_pullups', 80, 6)],
    [entry('dead_hang', 1, 60), entry('dead_hang', 80, 40), entry('max_hang_20mm_7s', 1, 40)],
    [entry('max_hang_20mm_7s', 1, 40)],
    [entry('max_hang_20mm_7s', 1, 40), entry('dead_hang', 1, 60)],
    [],
  ];

  it('starts every sentence in capitals, however the counts come out', () => {
    for (const entries of shapes) {
      for (const today of [addDays(START, 82), addDays(LAST, 20)]) {
        const said = describeBlock(blockReport({ program: IG, startDate: START, entries, today })!);
        for (const s of sentences(said)) expect(s.charAt(0), said).toMatch(/[A-Z]/);
      }
    }
  });
});

describe('describeBlockEnd', () => {
  const ALL: Below = { sessions: true, numbers: true, next: true };
  const row = (patch: Partial<BlockRecord>): BlockRecord => ({
    id: `iron_grip#${START}`, programId: 'iron_grip', name: 'Iron Grip', startDate: START, weeks: 12, endedAt: null, ...patch,
  });

  it('writes its days as the header does, in every state', () => {
    const ends = [
      blockEnd({ program: IG, startDate: START, entries: [], today: addDays(START, 20) }),
      blockEnd({ program: IG, startDate: START, entries: [], today: addDays(LAST, 30) }),
      blockEnd({ program: IG, startDate: START, entries: [], today: addDays(LAST, 30), record: row({ reconstructed: true, endedAt: LAST }) }),
      blockEnd({ program: IG, startDate: START, entries: [], today: addDays(START, 60), record: row({ endedAt: addDays(START, 41), reason: 'stopped' }) }),
    ];
    for (const end of ends) expect(describeBlockEnd(end, ALL), describeBlockEnd(end, ALL)).not.toMatch(ISO);
    expect(describeBlockEnd(ends[0]!, ALL)).toContain(`runs to ${blockDay(LAST)}.`);
    expect(describeBlockEnd(ends[2]!, ALL)).toContain(`started ${blockDay(START)},`);
  });
});

describe('a session type named in a count', () => {
  // Iron Grip's "Climbing Session" is one of five types whose names end in
  // "Session" — the ones the old shape turned into a plural noun.
  const missedAll = blockAdherence({
    program: IG, startDate: START, plan: { 1: 'fp', 3: 'perf', 5: 'fp' } as never, sessions: [] as Session[], today: addDays(START, 20),
  })!;

  it('labels its count rather than being the thing counted', () => {
    const said = describeAdherence(missedAll)!;
    for (const t of missedAll.types.filter((x) => x.planned > x.done)) {
      expect(said, said).toContain(`${t.name} (${t.done} of ${t.planned})`);
      expect(said).not.toContain(`of ${t.planned} ${t.name}`);
    }
    expect(said).not.toMatch(/Session sessions|Session and|Session\./);
  });

  it('counts the rest after the two it names', () => {
    const four = blockAdherence({
      program: PEAK_PERFORMANCE, startDate: START, plan: { 1: 'perf', 2: 'tech', 3: 'fp', 4: 'proj' } as never, sessions: [], today: addDays(START, 6),
    })!;
    expect(describeAdherence(four)).toMatch(/^Short of the plan: [^.]+\(0 of 1\), [^.]+\(0 of 1\) and 2 other types\. That is 0 of 4 sessions the plan placed\.$/);
  });
});
