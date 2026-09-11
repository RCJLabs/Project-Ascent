// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { putMetricEntry } from '@/db/metrics';
import { newSession, putSession } from '@/db/sessions';
import { FinderPage } from './FinderPage';
import { hydrate, renderAt } from '@/test/render';

/**
 * The finder reads the climber's logged benchmarks (PLAN.md M35, M43).
 *
 * This is the class of defect no source rule reaches. `finder.ts` was tested
 * exhaustively and `FinderPage.tsx` was scanned for imports, and between the
 * two the page simply never passed `metrics` to `findProgram` — so five
 * programs' entry standards evaluated against nothing on every real run
 * while every test passed. A scan can prove `useMetrics` is imported. Only
 * mounting the page can prove the value arrives.
 */
describe('the finder page', () => {
  async function ask(): Promise<{ text: () => string }> {
    await hydrate();
    const view = renderAt('/find', <FinderPage />);
    const pick = async (label: string | RegExp) => {
      const button = await view.findByRole('button', { name: label });
      button.click();
    };
    await pick(/^Stronger fingers/);
    const grade = view.container.querySelector<HTMLSelectElement>('select');
    if (grade) {
      grade.value = 'V6';
      grade.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await pick(/^Find my program/);
    return { text: () => view.container.textContent ?? '' };
  }

  it('counts a benchmark the climber has actually logged', async () => {
    await putMetricEntry({ metricId: 'dead_hang', date: '2026-09-01', value: 75 });
    const result = await ask();
    expect(
      result.text(),
      'the page never handed the finder its metrics, so entry standards read as unmeasured',
    ).toMatch(/entry requirements/i);
  });
});

/**
 * The grades it starts from are the ones the log knows (PLAN.md M85).
 *
 * The form seeded from the first-run baseline, which is right the day it is
 * taken and stale a block later. Replacing the seed with the baseline value
 * again passed every other test here, because none of them logs a climb.
 */
describe('the grades the finder starts from', () => {
  it('offers the hardest grade in the log', async () => {
    await putSession({
      ...newSession('2026-08-01', 0),
      completed: true,
      rewarded: true,
      rpe: 7,
      durationMin: 90,
      climbs: [{ id: 'c1', grade: 'V6', scale: 'V', count: 1, result: 'send' }],
    });
    await hydrate();
    const view = renderAt('/find', <FinderPage />);
    const grade = await view.findByDisplayValue('V6');
    expect(grade).toBeTruthy();
  });

  // No "offers nothing with an empty log" counterpart: this file shares one
  // database across its tests by design, so the session logged above is
  // still there and the assertion would depend on the order they run in.
  // `engine/onboarding.test.ts` holds the empty case directly.
});
