import { describe, expect, it } from 'vitest';
import { buildCardSvg, yearCard } from './shareCard';
import type { YearReview } from '@/engine/yearReview';

/**
 * The year, on a card (PLAN.md M68).
 *
 * Seven things could already be shared. The one page a climber would
 * actually show someone — a year of training — could not be.
 */

const review = (over: Partial<YearReview> = {}): YearReview =>
  ({
    year: 2026,
    complete: true,
    from: '2026-01-01',
    to: '2026-12-31',
    totals: {
      sessions: 142,
      hours: 213.4,
      feet: 48_210,
      sends: 388,
      outdoorDays: 22,
      restDays: 40,
      drills: 60,
      boulderSends: 300,
      routeSends: 88,
    },
    previous: null,
    months: [],
    busiest: { month: '2026-07', sessions: 18, feet: 6000 },
    hardestBoulder: { scale: 'V', grade: 'V7', date: '2026-07-02' },
    hardestRoute: null,
    firsts: [],
    bestWeek: null,
    longestGap: null,
    ...over,
  }) as YearReview;

describe('the year card', () => {
  it('leads with the year and the sessions in it', () => {
    const card = yearCard(review());
    expect(card.eyebrow).toBe('2026');
    expect(card.headline).toBe('142 sessions');
  });

  // "412 sessions" in September is a different sentence from the same words
  // in January, and a card that leaves that out overstates.
  it('says when the year is not finished yet', () => {
    expect(yearCard(review({ complete: false })).eyebrow).toBe('2026 so far');
  });

  it('carries the hardest thing climbed', () => {
    expect(yearCard(review()).subhead).toBe('Hardest: V7');
    const routeOnly = yearCard(review({ hardestBoulder: null, hardestRoute: { scale: 'YDS', grade: '5.12a', date: '2026-03-01' } as never }));
    expect(routeOnly.subhead).toBe('Hardest: 5.12a');
  });

  it('says nothing about a grade when nothing was sent', () => {
    expect(yearCard(review({ hardestBoulder: null, hardestRoute: null })).subhead).toBeUndefined();
  });

  it('names the busiest month rather than printing a key', () => {
    expect(yearCard(review()).footnote).toBe('Busiest month: July');
    expect(yearCard(review({ busiest: null })).footnote).toBeUndefined();
  });

  it('handles a single session without reading like a robot', () => {
    const one = yearCard(review({ totals: { ...review().totals, sessions: 1 } }));
    expect(one.headline).toBe('1 session');
  });

  it('draws to an SVG with the numbers in it', () => {
    const svg = buildCardSvg(yearCard(review()));
    expect(svg.startsWith('<svg')).toBe(true);
    for (const text of ['2026', '142 sessions', '48,210', 'July']) {
      expect(svg, text).toContain(text);
    }
  });
});
