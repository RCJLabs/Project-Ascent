import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { ACWR_BOUNDS } from './derive';
import { addDays } from './dates';
import { TREND_DAYS, describeTrend, loadTrend, trendCeiling } from './loadTrend';

const TO = '2026-09-10';

const session = (date: string, rpe = 7, minutes = 60, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe,
    durationMin: minutes,
    warmup: true,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

/** Steady training every other day, `days` back from `to`. */
function steady(days: number, to = TO, rpe = 7, minutes = 60): Session[] {
  const out: Session[] = [];
  for (let i = days; i >= 0; i -= 2) out.push(session(addDays(to, -i), rpe, minutes));
  return out;
}

describe('the window', () => {
  it('is ninety days by default, one point each', () => {
    const trend = loadTrend({ sessions: steady(200), to: TO });
    expect(trend.points).toHaveLength(TREND_DAYS);
    expect(trend.to).toBe(TO);
    expect(trend.from).toBe(addDays(TO, -(TREND_DAYS - 1)));
  });

  it('runs oldest to newest, one day apart', () => {
    const { points } = loadTrend({ sessions: steady(200), to: TO, days: 10 });
    points.forEach((p, i) => {
      if (i > 0) expect(p.date).toBe(addDays(points[i - 1]!.date, 1));
    });
  });

  it('takes the end day rather than reading the clock', () => {
    expect(loadTrend({ sessions: [], to: '2020-02-29', days: 5 }).to).toBe('2020-02-29');
  });

  it('uses history from before the window', () => {
    // The ratio on day one depends on the 28 days before it. Clipping the
    // input would make the chart start with a fake climb out of nothing.
    const long = loadTrend({ sessions: steady(200), to: TO, days: 30 });
    expect(long.points[0]!.acwr).not.toBeNull();
  });
});

describe('when the ratio does not exist', () => {
  it('is a gap, not a zero', () => {
    // Drawing a nought would say "you are detraining" about a period the
    // app knows nothing about.
    const trend = loadTrend({ sessions: [], to: TO, days: 30 });
    expect(trend.points.every((p) => p.unknown && p.acwr === null)).toBe(true);
    expect(trend.latest).toBeNull();
  });

  it('counts the days it could not compute', () => {
    const trend = loadTrend({ sessions: steady(10), to: TO, days: 30 });
    expect(trend.unknownDays).toBeGreaterThan(0);
    expect(trend.unknownDays).toBeLessThanOrEqual(30);
  });

  it('says so rather than inventing a summary', () => {
    expect(describeTrend(loadTrend({ sessions: [], to: TO }))).toMatch(/three weeks/i);
  });
});

describe('the numbers a caption needs', () => {
  it('reports the latest ratio', () => {
    const trend = loadTrend({ sessions: steady(200), to: TO });
    expect(trend.latest).toBeCloseTo(trend.points[trend.points.length - 1]!.acwr!, 10);
  });

  it('finds the peak and the trough', () => {
    const trend = loadTrend({ sessions: steady(200), to: TO });
    const values = trend.points.filter((p) => p.acwr !== null).map((p) => p.acwr!);
    expect(trend.peak).toBe(Math.max(...values));
    expect(trend.trough).toBe(Math.min(...values));
  });

  it('reads the week-ago point seven days back', () => {
    const trend = loadTrend({ sessions: steady(200), to: TO });
    expect(trend.weekAgo).toBe(trend.points[trend.points.length - 8]!.acwr);
  });

  it('has no peak when it has no points', () => {
    const trend = loadTrend({ sessions: [], to: TO, days: 10 });
    expect(trend.peak).toBeNull();
    expect(trend.trough).toBeNull();
  });
});

describe('a spike shows up as a spike', () => {
  it('rises when a steady climber suddenly triples their week', () => {
    const base = steady(120, addDays(TO, -8), 6, 60);
    const spike = [
      session(addDays(TO, -4), 10, 180),
      session(addDays(TO, -3), 10, 180),
      session(addDays(TO, -2), 10, 180),
      session(addDays(TO, -1), 10, 180),
    ];
    const trend = loadTrend({ sessions: [...base, ...spike], to: TO });
    expect(trend.latest!).toBeGreaterThan(ACWR_BOUNDS.cautionTo);
    expect(trend.points[trend.points.length - 1]!.zone).toBe('danger');
  });

  it('falls when training stops', () => {
    const trend = loadTrend({ sessions: steady(120, addDays(TO, -20)), to: TO });
    expect(trend.latest!).toBeLessThan(ACWR_BOUNDS.optimalFrom);
  });

  it('calls a steady climber optimal', () => {
    const trend = loadTrend({ sessions: steady(200), to: TO });
    expect(trend.points[trend.points.length - 1]!.zone).toBe('optimal');
  });
});

describe('the y axis', () => {
  it('always shows the danger threshold with room above it', () => {
    // A chart whose scale hides the line you are meant to stay under is
    // worse than no chart.
    const quiet = loadTrend({ sessions: steady(200, TO, 5, 40), to: TO });
    expect(trendCeiling(quiet)).toBeGreaterThan(ACWR_BOUNDS.cautionTo);
  });

  it('grows so a spike is not clipped flat', () => {
    const base = steady(120, addDays(TO, -8), 4, 40);
    const spike = [1, 2, 3, 4].map((d) => session(addDays(TO, -d), 10, 240));
    const trend = loadTrend({ sessions: [...base, ...spike], to: TO });
    expect(trendCeiling(trend)).toBeGreaterThan(trend.peak!);
  });

  it('has a ceiling even with nothing to show', () => {
    expect(trendCeiling(loadTrend({ sessions: [], to: TO }))).toBeGreaterThan(0);
  });
});

describe('the sentence under the chart', () => {
  it('says where the ratio is and where it came from', () => {
    const trend = loadTrend({ sessions: steady(200), to: TO });
    const text = describeTrend(trend);
    expect(text).toMatch(/Now \d\.\d\d/);
    expect(text).toMatch(/week ago|sweet spot|detraining|ramping/);
  });

  it('does not tell the climber what to do', () => {
    // The training-state card already gives advice, and two voices about
    // one number is worse than one.
    const trend = loadTrend({ sessions: steady(200), to: TO });
    expect(describeTrend(trend)).not.toMatch(/should|must|need to|back off|take a rest/i);
  });

  it('says "about where it was" for a flat week', () => {
    const trend = loadTrend({ sessions: steady(200), to: TO });
    if (Math.abs(trend.latest! - trend.weekAgo!) < 0.05) {
      expect(describeTrend(trend)).toMatch(/about where it was/);
    }
  });
});
