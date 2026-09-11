// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { Program } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { blockReport, type BlockReport } from '@/engine/blockReport';
import { BlockReportChart, BlockReportRest } from './BlockReportChart';

/**
 * M84's drawing decision: one axis, and only for what belongs on it.
 *
 * The comparison is held in `engine/blockReport.test.ts`. These hold the
 * picture — that right always means better, and that nothing ordinal or
 * pass/fail is ever drawn as a percentage.
 */

const START = '2026-01-04';

const program = (assessments: string[]): Program =>
  ({
    id: 'test_block', name: 'Test Block', kind: 'program', weeks: 12,
    phases: [{ name: 'Base', weekStart: 1 }, { name: 'Build', weekStart: 5 }],
    assessments, sessionTypes: [],
  }) as unknown as Program;

let seq = 0;
const entry = (metricId: string, date: string, value: number): MetricEntry =>
  ({ id: `e${seq++}`, metricId, date, value, createdAt: `${date}T10:00:00.000Z` }) as MetricEntry;

function build(assessments: string[], pairs: [string, number, number][]): BlockReport {
  const entries = pairs.flatMap(([id, a, b]) => [
    entry(id, '2026-01-05', a),
    entry(id, '2026-02-02', b),
  ]);
  return blockReport({ program: program(assessments), startDate: START, entries, today: '2026-03-01' })!;
}

const bars = (container: HTMLElement) => [...container.querySelectorAll('rect')];

describe('the shared axis', () => {
  it('draws nothing when no metric belongs on it', () => {
    const report = build(['flash_grade'], [['flash_grade', 4, 6]]);
    const { container } = render(<BlockReportChart report={report} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('puts an improvement to the right of the line and a fall to the left', () => {
    const report = build(
      ['dead_hang', 'max_pushups'],
      [
        ['dead_hang', 30, 45],
        ['max_pushups', 20, 15],
      ],
    );
    const { container } = render(<BlockReportChart report={report} />);
    const line = container.querySelector('line')!;
    const mid = Number(line.getAttribute('x1'));
    const [up, down] = bars(container);
    expect(Number(up!.getAttribute('x'))).toBeGreaterThanOrEqual(mid);
    expect(Number(down!.getAttribute('x'))).toBeLessThan(mid);
  });

  it('puts a fall to the right when falling is the improvement', () => {
    // `toe_touch` is higherIsBetter: false. The engine flips the sign, so
    // the drawing needs no special case — which is the thing to hold.
    const report = build(['toe_touch'], [['toe_touch', 10, 4]]);
    const { container } = render(<BlockReportChart report={report} />);
    const mid = Number(container.querySelector('line')!.getAttribute('x1'));
    expect(Number(bars(container)[0]!.getAttribute('x'))).toBeGreaterThanOrEqual(mid);
  });

  it('colours a fall differently from a rise', () => {
    const report = build(
      ['dead_hang', 'max_pushups'],
      [
        ['dead_hang', 30, 45],
        ['max_pushups', 20, 15],
      ],
    );
    const { container } = render(<BlockReportChart report={report} />);
    const classes = bars(container).map((r) => r.getAttribute('class'));
    expect(classes).toContain('fill-positive');
    expect(classes).toContain('fill-danger');
  });

  it('keeps one huge change from squashing the rest', () => {
    const report = build(
      ['dead_hang', 'max_pushups'],
      [
        ['dead_hang', 10, 100],
        ['max_pushups', 20, 22],
      ],
    );
    const { container } = render(<BlockReportChart report={report} />);
    const widths = bars(container).map((r) => Number(r.getAttribute('width')));
    // The small one is still visible rather than a hairline.
    expect(Math.min(...widths)).toBeGreaterThan(1.5);
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('+2 reps');
  });

  it('keeps a long label inside the gutter', () => {
    // SVG text does not clip, it overflows: "Weighted Pull-Ups 3RM" ran off
    // the left edge of the viewBox and rendered as "/eighted Pull-Ups 3RM".
    const report = build(['weighted_pullup_3rm'], [['weighted_pullup_3rm', 20, 30]]);
    const { container } = render(<BlockReportChart report={report} />);
    const label = [...container.querySelectorAll('text')].find((t) => t.textContent?.includes('eight'))!;
    expect(label.textContent!.length).toBeLessThanOrEqual(19);
    // The full name is still reachable.
    expect(container.querySelector('title')!.textContent).toContain('Weighted Pull-Ups 3RM');
  });

  it('leaves a short label alone', () => {
    const report = build(['dead_hang'], [['dead_hang', 30, 45]]);
    const { container } = render(<BlockReportChart report={report} />);
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toContain('Dead Hang');
  });

  it('names every bar for a reader who cannot see it', () => {
    const report = build(['dead_hang'], [['dead_hang', 30, 45]]);
    const { container } = render(<BlockReportChart report={report} />);
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toContain('Dead Hang +15 sec');
  });
});

describe('what the axis cannot carry', () => {
  it('lists a grade in grades', () => {
    const report = build(['flash_grade'], [['flash_grade', 4, 6]]);
    const { container } = render(<BlockReportRest report={report} />);
    expect(container.textContent).toContain('+2 grades');
    expect(container.textContent).not.toContain('%');
  });

  it('lists a pass/fail by what it is now', () => {
    const report = build(['wall_angel'], [['wall_angel', 0, 1]]);
    const { container } = render(<BlockReportRest report={report} />);
    expect(container.textContent).toContain('now passing');
  });

  it('lists a metric that was never taken rather than dropping it', () => {
    const report = build(['dead_hang', 'max_pushups'], [['dead_hang', 30, 45]]);
    const { container } = render(<BlockReportRest report={report} />);
    expect(container.textContent).toContain('Max Push-Ups');
    expect(container.textContent).toContain('not taken');
  });

  it('says baseline only when there is one reading', () => {
    const report = blockReport({
      program: program(['dead_hang']),
      startDate: START,
      entries: [entry('dead_hang', '2026-01-05', 30)],
      today: '2026-03-01',
    })!;
    const { container } = render(<BlockReportRest report={report} />);
    expect(container.textContent).toContain('baseline only');
  });

  it('draws nothing when every metric is on the axis', () => {
    const report = build(['dead_hang'], [['dead_hang', 30, 45]]);
    const { container } = render(<BlockReportRest report={report} />);
    expect(container.querySelector('ul')).toBeNull();
  });
});
