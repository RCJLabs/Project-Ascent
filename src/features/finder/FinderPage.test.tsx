// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { putMetricEntry } from '@/db/metrics';
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
