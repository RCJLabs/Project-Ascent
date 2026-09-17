// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { newSession, putSession } from '@/db/sessions';
import { addDays, dayOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { PageGrid } from '@/ui/PageGrid';
import { HomePage } from './HomePage';

/**
 * Home, side by side (PLAN.md M240).
 *
 * M239 put the numbers and the button first and left both running the full
 * width of a 1024px content column, while the cards under them split into
 * two — so the top of the page was sparse, the bottom was dense, and the
 * altimeter's two labels sat at opposite ends of a bar a metre apart.
 *
 * jsdom has no layout and no media queries, so what is asserted here is the
 * **grouping**, which is the part that has to be right for any breakpoint to
 * work: which cards are in the column with the button, and which are in the
 * rail. The widths themselves were checked in a browser at 430, 1024 and
 * 1280.
 */

const PROGRAM = 'gravity_defied';
const TODAY = today();
const DOW = dayOfWeek(TODAY);

async function trained(): Promise<void> {
  await reset();
  for (let d = 1; d <= 20; d += 2) {
    const date = addDays(TODAY, -d);
    await putSession({
      ...newSession(date, 0, { completed: true }),
      rpe: 7,
      durationMin: 75,
      climbs: [{ id: `c${d}`, grade: 'V4', scale: 'V', count: 3, result: 'send' }],
    } as never);
  }
  await hydrate();
  useProfile.setState({
    activeProgramId: PROGRAM,
    startDates: { [PROGRAM]: TODAY },
    plans: { [PROGRAM]: { [DOW]: 'tech' } },
    weekOverrides: {},
    adaptations: {},
  });
}

const columns = (): HTMLElement[] => {
  const grid = document.querySelector('[class*="grid-cols-[1.55fr_1fr]"]');
  expect(grid, 'Home has no two-column split at all').toBeTruthy();
  return [...(grid as HTMLElement).children] as HTMLElement[];
};

describe('the two columns', () => {
  it('keeps the numbers with the button, and the reading in the rail', async () => {
    await trained();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Start session|Log a session|Log rest day/ });
    await screen.findByText('Climbed so far');
    await screen.findByText("Coach's Corner");
    // Awaited, not assumed. Both rail cards cross a lazy boundary, and
    // reading the DOM the moment the coach lands caught the daily task
    // mid-flight on CI while passing five times out of five here.
    // `DailyTaskCard` never returns null — `polish.test.ts` holds that —
    // so this settles rather than hangs.
    await screen.findByText('Today\u2019s task');

    const [main, rail] = columns();
    expect(columns()).toHaveLength(2);
    expect(main!.textContent, 'the numbers left the button').toContain('Climbed so far');
    expect(main!.textContent).toMatch(/Start session|Log a session|Log rest day/);
    expect(rail!.textContent, 'the coach is not in the rail').toContain("Coach's Corner");
    expect(rail!.textContent).toContain('Today\u2019s task');
    // And the halves do not overlap, which is what makes it two columns
    // rather than one list with a class on it.
    expect(main!.textContent).not.toContain("Coach's Corner");
    expect(rail!.textContent).not.toContain('Climbed so far');
  });

  /**
   * Every grid inside the rail is a single column. Nesting the default
   * `PageGrid` there splits a 380px rail into two ~180px columns: the safety
   * note came out one word per line, which a browser found and jsdom cannot.
   */
  it('nests no splitting grid inside a column', () => {
    const home = readFileSync('src/features/home/HomePage.tsx', 'utf8');
    const grids = home.match(/<PageGrid[^>]*>/g) ?? [];
    expect(grids.length, 'Home stopped using PageGrid').toBeGreaterThan(0);
    for (const tag of grids) {
      expect(tag, `${tag} would split again inside the rail`).toMatch(/\bsingle\b/);
    }
  });
});

describe('a grid told to stay one column', () => {
  it('drops the split rather than layering a second rule over it', () => {
    const { container, rerender } = render(
      <PageGrid single>
        <div>a</div>
      </PageGrid>,
    );
    const cls = () => container.firstElementChild!.className;
    expect(cls(), 'a single grid still carries the split').not.toContain('lg:grid-cols-2');
    expect(cls()).toContain('grid-cols-1');

    // The default is unchanged — this prop is opt-in, not a new behaviour.
    rerender(
      <PageGrid>
        <div>a</div>
      </PageGrid>,
    );
    expect(cls()).toContain('lg:grid-cols-2');
  });

  /**
   * A prop, not a class. Both land in the same attribute and which wins is
   * decided by the stylesheet's order, not by the order they are written —
   * the trap `SelectableCard`'s `padded` prop is documented for.
   */
  it('cannot be undone by a className that fights it', () => {
    const { container } = render(
      <PageGrid single className="lg:grid-cols-2">
        <div>a</div>
      </PageGrid>,
    );
    // The caller asked for both; the grid only ever declares one, so there is
    // nothing for the stylesheet to arbitrate.
    const declared = (container.firstElementChild!.className.match(/lg:grid-cols-2/g) ?? []).length;
    expect(declared, 'the grid declared a split of its own as well').toBe(1);
  });
});
