import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import { PEAK_PERFORMANCE } from '@/content/programs/catalogue';
import type { MetricEntry } from '@/db/metrics';
import { blockCard } from '@/ui/shareCard';
import { buildBlockFile, parseBlockFile } from './blockFile';
import { blockReport, describeBlock } from './blockReport';
import { chooseNext } from './nextBlock';

/**
 * The band's edge (PLAN.md M370): exactly the band's width is light
 * progress, or a light decline — the coach's words for one plate and one
 * rep, which M367 had held. Its own count everywhere the counts go; trained,
 * where the order of what comes next is concerned.
 */

const IG = getProgram('iron_grip')!;
const at = (metricId: string, day: number, value: number) =>
  ({ id: `${metricId}@${day}`, metricId, date: `2026-03-${String(day).padStart(2, '0')}`, value }) as unknown as MetricEntry;
const report = blockReport({
  program: IG,
  startDate: '2026-03-01',
  today: '2026-06-30',
  entries: [
    at('max_hang_20mm_7s', 2, 40), at('max_hang_20mm_7s', 29, 45), // light progress
    at('weighted_pullup_3rm', 2, 30), at('weighted_pullup_3rm', 29, 25), // a light decline
    at('dead_hang', 2, 60), at('dead_hang', 29, 70), // improved
  ],
})!;

describe('the coach’s file', () => {
  const file = buildBlockFile({ report, outcome: 'completed', weeksRun: 12, sessions: null, planned: null, summary: describeBlock(report) });

  it('carries the light counts and which results were light, and reads them back', () => {
    const back = parseBlockFile(JSON.stringify(file));
    expect([back.better, back.lightBetter, back.worse, back.lightWorse]).toEqual([1, 1, 0, 1]);
    expect(back.results.find((r) => r.metricId === 'max_hang_20mm_7s')).toMatchObject({ moved: 'better', light: true });
    expect(back.results.find((r) => r.metricId === 'dead_hang')!.light).toBeUndefined();
  });

  it('reads a file from before with none', () => {
    const old = JSON.parse(JSON.stringify(file));
    delete old.block.lightBetter;
    delete old.block.lightWorse;
    for (const r of old.block.results) delete r.light;
    const back = parseBlockFile(JSON.stringify(old));
    expect([back.lightBetter, back.lightWorse]).toEqual([0, 0]);
    expect(back.results.every((r) => r.light === undefined)).toBe(true);
  });
});

describe('the share card', () => {
  it('says the light counts under the four', () => {
    const card = blockCard({ report, outcome: 'completed', weeksRun: 12 });
    expect(card.stats.map((s) => [s.label, s.value])).toEqual([
      ['Improved', '1'],
      ['Held', '0'],
      ['Down', '0'],
      ['Untested', String(report.untested)],
    ]);
    expect(card.footnote).toBe('3 of 9 retested · 1 light progress · 1 light decline');
  });
});

describe('what comes next', () => {
  it('counts light progress as trained, and a light decline as not', () => {
    const peak = chooseNext({ candidates: [{ program: PEAK_PERFORMANCE, reason: '' }], report }).choices[0]!;
    // Peak Performance tests the max hang and the weighted pull-up.
    expect(peak.addresses.map((m) => m.id)).toEqual(['weighted_pullup_3rm']);
    expect(peak.because).toContain('It also trains max hang 20mm 7s, which did move.');
    expect(peak.because).toContain('Your weighted pull-ups 3RM went the other way this block');
  });
});
