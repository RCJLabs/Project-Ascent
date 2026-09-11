// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import type { Climb, Session } from '@/db/sessions';
import { BLOCKS, BLOCK_DAYS, ENOUGH_TRIES, conversionTrend } from '@/engine/conversion';
import { addDays } from '@/engine/dates';
import { displayGrade, type GradeScale } from '@/engine/grades';
import { ConversionGrid } from './ConversionGrid';

/**
 * M83's drawing decision: a gap is not a zero.
 *
 * The maths is held in `engine/conversion.test.ts`. These hold the picture,
 * and the one thing it must never do — draw "I did not climb that grade"
 * and "I tried it eight times and sent none" the same way.
 */

const TO = '2026-09-10';
const label = (scale: GradeScale, grade: string) =>
  displayGrade(scale, grade, { boulder: 'V', route: 'YDS' });

const climbs = (grade: string, sends: number, attempts: number): Climb[] => [
  ...(sends > 0 ? [{ id: `s${grade}${sends}`, grade, scale: 'V' as const, count: sends, result: 'send' as const }] : []),
  ...(attempts > 0 ? [{ id: `a${grade}${attempts}`, grade, scale: 'V' as const, count: attempts, result: 'attempt' as const }] : []),
];

const session = (date: string, rows: Climb[]): Session =>
  ({
    id: `${date}#a`, date, planned: false, completed: true, rewarded: true,
    mode: 'indoor', rpe: 6, durationMin: 60, climbs: rows,
    createdAt: `${date}T18:00:00.000Z`, updatedAt: `${date}T18:00:00.000Z`,
  }) as Session;

const inBlock = (i: number) => addDays(TO, -(BLOCKS - 1 - i) * BLOCK_DAYS - 3);

function draw(sessions: Session[]) {
  const trend = conversionTrend({ sessions, scale: 'V', to: TO });
  return render(<ConversionGrid trend={trend} label={label} />);
}

/** The filled bars, which are the ones with a reportable conversion. */
function bars(container: HTMLElement): SVGRectElement[] {
  return [...container.querySelectorAll('rect')].filter(
    (r) => !r.hasAttribute('opacity'),
  ) as SVGRectElement[];
}

describe('a gap is not a zero', () => {
  it('draws no bar for a block with too few tries', () => {
    const { container } = draw([session(inBlock(2), climbs('V5', 1, ENOUGH_TRIES - 2))]);
    expect(bars(container).length).toBe(0);
  });

  it('draws a bar for a block that sent nothing from enough tries', () => {
    // Zero is a reading. The blank above is not.
    const { container } = draw([session(inBlock(2), climbs('V5', 0, ENOUGH_TRIES))]);
    expect(bars(container).length).toBe(1);
  });

  it('still draws a track behind every block, so the row reads as a row', () => {
    const { container } = draw([session(inBlock(2), climbs('V5', 0, ENOUGH_TRIES))]);
    const tracks = [...container.querySelectorAll('rect')].filter((r) => r.hasAttribute('opacity'));
    expect(tracks.length).toBe(BLOCKS);
  });
});

describe('what the bars say', () => {
  it('draws a better conversion taller', () => {
    const { container } = draw([
      session(inBlock(1), climbs('V5', 2, 8)),
      session(inBlock(4), climbs('V5', 8, 2)),
    ]);
    const heights = bars(container).map((r) => Number(r.getAttribute('height')));
    expect(heights.length).toBe(2);
    expect(heights[0]!).toBeLessThan(heights[1]!);
  });

  it('grows the bar from the bottom of its row, not the top', () => {
    const { container } = draw([session(inBlock(4), climbs('V5', 3, 7))]);
    const bar = bars(container)[0]!;
    const track = [...container.querySelectorAll('rect')].find((r) => r.hasAttribute('opacity'))!;
    const barBottom = Number(bar.getAttribute('y')) + Number(bar.getAttribute('height'));
    const rowBottom = Number(track.getAttribute('y')) + Number(track.getAttribute('height'));
    expect(barBottom).toBeCloseTo(rowBottom, 6);
  });

  it('captions every cell with the count it came from', () => {
    const { container } = draw([session(inBlock(4), climbs('V5', 3, 7))]);
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent);
    expect(titles.some((t) => t?.includes('3 from 10'))).toBe(true);
  });

  it('says why a thin block is blank rather than leaving it unexplained', () => {
    // A grade with one good block and one thin one: the thin cell is inside
    // a drawn row, so it needs the caption. A grade that is thin in *every*
    // block gets no row at all — see below.
    const { container } = draw([
      session(inBlock(4), climbs('V5', 3, 7)),
      session(inBlock(2), climbs('V5', 1, 2)),
    ]);
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent);
    expect(titles.some((t) => t?.includes(`under ${ENOUGH_TRIES} tries`))).toBe(true);
    expect(titles.some((t) => t?.includes('not climbed'))).toBe(true);
  });

  it('gives no row to a grade that never reached the threshold', () => {
    // Six empty cells are not a finding. The sentence names it instead.
    const { container } = draw([
      session(inBlock(4), climbs('V5', 3, 7)),
      session(inBlock(4), climbs('V7', 0, 3)),
    ]);
    expect(container.textContent).toContain('V5');
    expect(container.textContent).not.toContain('V7');
  });

  it('labels grades the way the climber reads them', () => {
    const trend = conversionTrend({ sessions: [session(inBlock(4), climbs('V5', 3, 7))], scale: 'V', to: TO });
    const font = (scale: GradeScale, grade: string) =>
      displayGrade(scale, grade, { boulder: 'Font', route: 'YDS' });
    const { container } = render(<ConversionGrid trend={trend} label={font} />);
    expect(container.textContent).not.toContain('V5');
  });

  it('names every reported block for a reader who cannot see it', () => {
    const { container } = draw([session(inBlock(4), climbs('V5', 3, 7))]);
    const aria = container.querySelector('svg')!.getAttribute('aria-label')!;
    expect(aria).toContain('3 from 10');
  });
});

describe('the grid explains its own blanks', () => {
  const SRC = readFileSync('src/ui/charts/ConversionGrid.tsx', 'utf8');

  it('takes the threshold from the engine rather than repeating the number', () => {
    expect(SRC).toContain('ENOUGH_TRIES');
    expect(SRC).not.toMatch(/fewer than 6 tries/);
  });

  it('says in the caption what a blank block means', () => {
    const { container } = draw([session(inBlock(4), climbs('V5', 3, 7))]);
    expect(container.textContent).toContain('too few to read');
  });
});
