// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { checkInHistory } from '@/engine/checkIns';
import type { Session } from '@/db/sessions';
import type { CheckIn } from '@/engine/readiness';
import { CheckInStrip } from './CheckInStrip';

/**
 * M82's drawing decision: a mark per answer, placed by date.
 *
 * The engine maths is held in `engine/checkIns.test.ts`. These hold the one
 * thing the picture is for — that a run of bad days looks like a run.
 */

const TO = '2026-09-10';
const fine: CheckIn = { fingers: 'good', sleep: 'good' };
const bad: CheckIn = { fingers: 'sore', sleep: 'none' };

const session = (date: string, checkIn: CheckIn): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 6,
    durationMin: 60,
    climbs: [],
    checkIn,
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
  }) as Session;

function marks(dates: string[]): number[] {
  const history = checkInHistory({ sessions: dates.map((d) => session(d, fine)), to: TO });
  const { container } = render(<CheckInStrip history={history} />);
  const row = [...container.querySelectorAll('circle')].slice(0, dates.length);
  return row.map((c) => Number(c.getAttribute('cx')));
}

describe('where the marks land', () => {
  it('spaces them by date, not by how many there are', () => {
    // The whole reason to draw this rather than count it: three answers in
    // one week and three across three months must not look the same.
    const tight = marks(['2026-09-08', '2026-09-09', '2026-09-10']);
    const spread = marks(['2026-06-14', '2026-07-28', '2026-09-10']);
    const width = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(width(tight)).toBeLessThan(width(spread) / 4);
  });

  it('puts the oldest day at the left edge and today at the right', () => {
    const xs = marks(['2026-06-13', '2026-09-10']);
    expect(xs[0]).toBeCloseTo(42, 0);
    expect(xs[1]).toBeCloseTo(314, 0);
  });

  it('draws one mark per question, so the two answers stay apart', () => {
    const history = checkInHistory({ sessions: [session('2026-09-09', bad)], to: TO });
    const { container } = render(<CheckInStrip history={history} />);
    expect(container.querySelectorAll('circle').length).toBe(2);
  });

  it('draws a fine answer more quietly than a flagged one, in each row', () => {
    // Checked per row rather than across both: a minimum taken over the
    // whole strip stayed quiet when only the fingers tone was raised, and
    // the mutation that did exactly that survived.
    const history = checkInHistory({
      sessions: [session('2026-09-09', fine), session('2026-09-08', bad)],
      to: TO,
    });
    const { container } = render(<CheckInStrip history={history} />);
    const rows = [...container.querySelectorAll('svg > g')];
    expect(rows.length).toBe(2);
    for (const [i, row] of rows.entries()) {
      const marks = [...row.querySelectorAll('circle')];
      expect(marks.length, `row ${i}`).toBe(2);
      // Oldest first, so the flagged day is drawn before the fine one.
      const [flagged, clear] = marks.map((c) => Number(c.getAttribute('opacity')));
      expect(clear!, `row ${i} fine`).toBeLessThan(0.5);
      expect(flagged!, `row ${i} flagged`).toBeGreaterThan(0.8);
    }
  });

  it('names every answer for a reader who cannot see it', () => {
    const history = checkInHistory({ sessions: [session('2026-09-09', bad)], to: TO });
    const { container } = render(<CheckInStrip history={history} />);
    const label = container.querySelector('svg')!.getAttribute('aria-label')!;
    expect(label).toContain('1 check-in');
    expect(label).toContain('fingers sore');
    expect(label).toContain('slept barely');
  });
});

describe('the strip is a picture, not a control', () => {
  const SRC = readFileSync('src/ui/charts/CheckInStrip.tsx', 'utf8');

  it('has nothing to tap, because a mark can sit a pixel from its neighbour', () => {
    // The consistency grid made this call first, at 4.5px cells: WCAG 2.5.8
    // asks 24px of any target, and marks placed by date can be closer still.
    expect(SRC).not.toMatch(/onClick|<button|<Link/);
  });

  it('says what its three tones mean', () => {
    // The runs read in a browser and the severity did not: three colours
    // and nothing naming them.
    const history = checkInHistory({ sessions: [session('2026-09-09', bad)], to: TO });
    const { container } = render(<CheckInStrip history={history} />);
    const legend = container.querySelector('ul')?.textContent ?? '';
    expect(legend).toContain('fine');
    expect(legend).toContain('tender');
    expect(legend).toContain('barely slept');
  });

  it('takes the answer words from the engine rather than repeating them', () => {
    expect(SRC).toContain('FINGER_LABEL');
    expect(SRC).toContain('SLEEP_LABEL');
    expect(SRC).not.toMatch(/'Barely slept'|'Fingers sore'/);
  });
});
