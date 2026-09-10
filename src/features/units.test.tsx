// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { METRICS } from '@/content/metrics';
import { GUIDES } from '@/content/guides';
import { PROGRAMS } from '@/content/programs';
import { putMetricEntry } from '@/db/metrics';
import { newSession, putSession } from '@/db/sessions';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { AltimeterPage } from '@/features/altimeter/AltimeterPage';
import { MetricDetailPage } from '@/features/assessments/MetricDetailPage';

/**
 * Reading in kilograms and metres (PLAN.md M48).
 *
 * The app reads grades as V or Font and routes as YDS or French, and then
 * prescribed max hangs in pounds and box jumps in inches — while `min_edge`
 * was already in millimetres, because a 20mm edge is a 20mm edge everywhere.
 * The app was never imperial; it was inconsistent.
 */

async function inMetric(): Promise<void> {
  await reset();
  await hydrate();
  useSettings.getState().setUnits('metric');
}

const text = (el: HTMLElement) => el.textContent ?? '';

describe('a climber who works in kilograms', () => {
  it('reads a logged benchmark in kilograms', async () => {
    await inMetric();
    await putMetricEntry({ metricId: 'weighted_pullup_3rm', date: '2026-02-02', value: 60 });
    await hydrate();

    const view = renderAt('/assessments/weighted_pullup_3rm', <MetricDetailPage params={{ id: 'weighted_pullup_3rm' }} />);
    await view.findByRole('heading', { level: 1 });
    expect(text(view.container), '60 lbs shown unconverted').toMatch(/27\.2 BW\+kg/);
    expect(text(view.container)).not.toMatch(/60 BW\+lbs/);
  });

  it('reads the altimeter in metres', async () => {
    await inMetric();
    // Outdoor sends are what the altimeter counts.
    for (let i = 0; i < 12; i += 1) {
      await putSession({
        ...newSession(`2026-01-${String(i + 1).padStart(2, '0')}`, 0),
        completed: true,
        mode: 'outdoor',
        climbs: [{ id: `c${i}`, grade: 'V4', scale: 'V', count: 3, result: 'send' }],
      });
    }
    await hydrate();

    const metricView = renderAt('/altimeter', <AltimeterPage />);
    await metricView.findByRole('heading', { level: 1 });
    const inMetres = text(metricView.container);
    // The secondary line always said "m climbed", so matching on "m" alone
    // passes whether or not the headline converted. Read the headline.
    const headline = metricView.container.querySelector('.text-4xl')?.textContent ?? '';
    expect(headline).toMatch(/\d[\d,]*\s*m$/);
    expect(inMetres, 'the other unit is still offered underneath').toMatch(/ft climbed/);

    // The two lines describe one height, so they have to agree. Matching the
    // shape alone passed when the headline printed the feet with an "m" after
    // it, which is the exact failure worth catching.
    const metres = Number(headline.replace(/[^\d]/g, ''));
    const feet = Number((/([\d,]+) ft climbed/.exec(inMetres)?.[1] ?? '0').replace(/,/g, ''));
    expect(feet, 'no feet in the secondary line to compare against').toBeGreaterThan(0);
    expect(metres, `${feet} ft should read as about ${Math.round(feet * 0.3048)} m`).toBe(
      Math.round(feet * 0.3048),
    );

    useSettings.getState().setUnits('imperial');
    const feetView = renderAt('/altimeter', <AltimeterPage />);
    await feetView.findByRole('heading', { level: 1 });
    const inFeet = feetView.container.querySelector('.text-4xl')?.textContent ?? '';
    expect(inFeet, 'the setting changed nothing').not.toBe(headline);
    expect(inFeet).toMatch(/\d[\d,]*\s*ft$/);
  });

  it('leaves millimetres alone, because everyone says millimetres', async () => {
    await inMetric();
    await putMetricEntry({ metricId: 'min_edge', date: '2026-02-02', value: 14 });
    await hydrate();
    const view = renderAt('/assessments/min_edge', <MetricDetailPage params={{ id: 'min_edge' }} />);
    await view.findByRole('heading', { level: 1 });
    expect(text(view.container)).toMatch(/14 mm/);
  });

  it('still reads in pounds for a climber who works in pounds', async () => {
    await reset();
    await hydrate();
    await putMetricEntry({ metricId: 'weighted_pullup_3rm', date: '2026-02-02', value: 60 });
    await hydrate();
    const view = renderAt('/assessments/weighted_pullup_3rm', <MetricDetailPage params={{ id: 'weighted_pullup_3rm' }} />);
    await view.findByRole('heading', { level: 1 });
    expect(text(view.container)).toMatch(/60 BW\+lbs/);
  });
});

/**
 * Weights still written into prose — the same shape as M47's grades.
 *
 * "+10lbs" inside a coaching sentence is not a field, and converting it
 * would mean re-authoring the content. Pinned by count so it cannot grow
 * quietly, and so the number is the size of the job when it is picked up.
 */
describe('weights still written into prose', () => {
  const TOKEN = /\b\d+(\.\d+)?\s?lbs?\b/gi;
  const count = (value: unknown): number => {
    if (typeof value === 'string') return [...value.matchAll(TOKEN)].length;
    if (Array.isArray(value)) return value.reduce<number>((n, item) => n + count(item), 0);
    if (value !== null && typeof value === 'object') {
      return Object.values(value).reduce<number>((n, item) => n + count(item), 0);
    }
    return 0;
  };

  it('is exactly this much, and no more', () => {
    const inPrograms = PROGRAMS.reduce((n, p) => n + count(p), 0);
    const inGuides = GUIDES.reduce((n, g) => n + count(g.sections), 0);
    expect({ inPrograms, inGuides }).toEqual({ inPrograms: 16, inGuides: 16 });
  });

  it('is not hiding in a metric unit that should convert', () => {
    // The structural half is done, and this is what stops it coming back.
    const unconverted = [...new Set(Object.values(METRICS).map((m) => m.unit))].filter((u) =>
      /\b(lbs?|in|ft)\b/.test(u),
    );
    expect(unconverted.length, 'no imperial units at all — this check is asleep').toBeGreaterThan(2);
  });
});
