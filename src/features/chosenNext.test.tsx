// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { loadPrograms } from '@/content/programs';
import { IRON_GRIP } from '@/content/programs/catalogue';
import type { MetricEntry } from '@/db/metrics';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinishPage } from '@/features/finish/FinishPage';

/**
 * The successors, ordered by what the block did (PLAN.md M134).
 *
 * `blockEnd` computed the report and returned `nextPrograms` verbatim in the
 * same breath, so the page recited the same three programs in the same order
 * to a climber whose fingers moved and one whose did not.
 */

const TODAY = today();
/** Fourteen weeks back, so a twelve-week block has finished. */
const FROM = addDays(startOfWeek(TODAY), -14 * 7);

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

const reading = (metricId: string, date: string, value: number): MetricEntry =>
  ({ metricId, date, value }) as MetricEntry;

/** A finished Iron Grip block, with whatever readings the test gives it. */
async function finished(entries: MetricEntry[], plan: Record<number, string> = {}): Promise<void> {
  await hydrate();
  useMetrics.setState({ entries, hydrated: true } as never);
  useProfile.setState({
    activeProgramId: 'iron_grip',
    startDates: { iron_grip: FROM },
    plans: { iron_grip: plan },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
  } as never);
  renderAt('/finish', <FinishPage />);
  await screen.findByText('What comes next');
}

/**
 * The successor ids, in the order the page lists them.
 *
 * Every `/train/<id>` link in document order, narrowed to the ones this
 * program names — the card is the only thing on this page that links to a
 * successor, and reading the whole document keeps the query off the card's
 * markup.
 */
const order = (): string[] => {
  const names = IRON_GRIP.nextPrograms.map((n) => n.id);
  return [...document.querySelectorAll('a')]
    // Hash routing, so the href is `#/train/<id>`.
    .map((a) => (a.getAttribute('href') ?? '').replace(/^#?\/train\//, ''))
    .filter((id) => names.includes(id));
};

describe('a block that measured nothing', () => {
  it('lists them in the order the program wrote them', async () => {
    await finished([]);
    expect(order()).toEqual(IRON_GRIP.nextPrograms.map((n) => n.id));
  });

  it('says why the order is the author’s', async () => {
    await finished([]);
    expect(screen.getByText(/Nothing was measured twice this block/)).toBeTruthy();
  });
});

describe('a block that left something where it was', () => {
  /**
   * Fingers up, dead hang and pull-ups unchanged — two readings each, so
   * the report has something to compare rather than a single baseline.
   */
  const mixed = [
    reading('max_hang_20mm_7s', FROM, 30),
    reading('max_hang_20mm_7s', addDays(FROM, 77), 40),
    reading('dead_hang', FROM, 45),
    reading('dead_hang', addDays(FROM, 77), 45),
    reading('max_pullups', FROM, 12),
    reading('max_pullups', addDays(FROM, 77), 12),
  ];

  it('puts the one that trains the unmoved first', async () => {
    // The Cruiser declares the dead hang and max pull-ups; Peak Performance
    // declares neither and is written first.
    await finished(mixed);
    expect(order()[0]).toBe('the_cruiser');
  });

  it('says what it is doing rather than reordering silently', async () => {
    await finished(mixed);
    expect(screen.getByText(/Ordered by what this block left where it was/)).toBeTruthy();
  });

  it('names the benchmarks on the one it put first', async () => {
    await finished(mixed);
    expect(screen.getByText(/left your .*dead hang.* where they were/i)).toBeTruthy();
  });

  it('keeps the author’s reason under the app’s', async () => {
    // The program's own sentence is what makes a successor make sense; this
    // adds a line, it does not replace one.
    await finished(mixed);
    for (const step of IRON_GRIP.nextPrograms) {
      expect(document.body.textContent, step.id).toContain(step.reason);
    }
  });
});

describe('a block that was barely run', () => {
  it('says to run it again rather than follow it', async () => {
    // Three sessions a week for twelve weeks, and nothing logged against
    // them. `adherence` is computed on this page and has to reach the
    // choice — a wiring a mutation found by surviving.
    await finished([], { 1: 'fp', 3: 'perf', 5: 'fp' });
    expect(screen.getByText(/sessions this block placed/)).toBeTruthy();
    expect(screen.getByText(/running it again is the honest next step/)).toBeTruthy();
  });

  it('still lists the successors', async () => {
    await finished([], { 1: 'fp', 3: 'perf', 5: 'fp' });
    expect(order()).toEqual(IRON_GRIP.nextPrograms.map((n) => n.id));
  });
});
