// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { deriveClimberState } from '@/engine/derive';
import { useObjectives } from '@/store/objectives';
import { hydrate, renderAt, reset } from '@/test/render';
import { brokenStreak } from '@/test/streak';
import { ObjectiveDetailPage } from './ObjectiveDetailPage';
import { ObjectivesPage } from './ObjectivesPage';

/**
 * What an objective says you have done (PLAN.md M257).
 *
 * `suggestedRequirements` puts a `streak-weeks` on every new objective, and
 * that is the one requirement kind whose `current` is a record rather than
 * a position. This page drew three numbers from it — the row's fraction,
 * the meter beside it, and the "Furthest away" card — and all three read a
 * streak the climber was no longer on.
 */

async function objective(requirements: { id: string; requirement: unknown }[]): Promise<void> {
  await useObjectives.getState().save({
    id: 'o1',
    name: 'A first V8',
    kind: 'boulder',
    status: 'training',
    requirements: requirements as never,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
});

describe('a requirement measured on a streak', () => {
  it('is a fixture whose record is ahead of its run', async () => {
    // Without that gap every assertion here passes on the old page too.
    const state = deriveClimberState(await brokenStreak());
    expect(state.longestStreakWeeks).toBeGreaterThan(state.streakWeeks);
  });

  it('counts from the streak being run, in the row and in the meter', async () => {
    await brokenStreak();
    await objective([{ id: 'r1', requirement: { kind: 'streak-weeks', weeks: 16 } }]);
    await hydrate();
    renderAt('/objectives/o1', <ObjectiveDetailPage params={{ id: 'o1' }} />);

    // Two elements carry the requirement's own words — the row and the
    // "Furthest away" card above it — so this takes the row.
    const detail = (await screen.findAllByText('Hit your weekly target 16 weeks running'))
      .map((el) => el.closest('li'))
      .find((li): li is HTMLLIElement => li !== null);
    expect(detail).toBeTruthy();
    const row = detail!;
    const shown = /(\d+) \/ 16/.exec(row.textContent ?? '');
    expect(shown, row.textContent ?? '').toBeTruthy();
    // One week back on, not the eight that are behind them.
    expect(Number(shown![1])).toBeLessThan(8);

    const meter = row.querySelector('[role="progressbar"]')!;
    expect(meter.getAttribute('aria-valuetext')).toBe(`${shown![1]} of 16`);
  });

  it('says the same number in the card that names what is furthest away', async () => {
    await brokenStreak();
    await objective([{ id: 'r1', requirement: { kind: 'streak-weeks', weeks: 16 } }]);
    await hydrate();
    renderAt('/objectives/o1', <ObjectiveDetailPage params={{ id: 'o1' }} />);

    const card = (await screen.findByText('Furthest away')).closest('section, div')!;
    expect(card.textContent).toMatch(/[1-7] of 16 so far\./);
  });

  it('keeps the headline percentage off the record', async () => {
    await brokenStreak();
    await objective([{ id: 'r1', requirement: { kind: 'streak-weeks', weeks: 16 } }]);
    await hydrate();
    renderAt('/objectives/o1', <ObjectiveDetailPage params={{ id: 'o1' }} />);

    // Eight of sixteen would have read 50%. One of sixteen is 6%.
    const line = await screen.findByText(/% of the way there/);
    const percent = Number(/(\d+)%/.exec(line.textContent ?? '')![1]);
    expect(percent).toBeLessThan(25);
  });
});

/**
 * What the readiness bar says it says (PLAN.md M258).
 *
 * `readiness` is the mean of each requirement's own fraction; `met` is how
 * many are finished. Five requirements each 80% done are a climber nearly
 * there whose met-count is nought — so a bar drawn from the first and read
 * out as the second tells a screen reader a different thing from the one it
 * draws, and the thing it tells them is always the more pessimistic.
 */
describe('the readiness bar', () => {
  it('reads out the percentage it is filled to', async () => {
    await brokenStreak();
    await objective([
      { id: 'r1', requirement: { kind: 'streak-weeks', weeks: 16 } },
      { id: 'r2', requirement: { kind: 'sessions', count: 60 } },
    ]);
    await hydrate();
    renderAt('/objectives/o1', <ObjectiveDetailPage params={{ id: 'o1' }} />);

    const bar = (await screen.findAllByRole('progressbar')).find(
      (el) => el.getAttribute('aria-label') === 'Readiness',
    )!;
    expect(bar).toBeTruthy();
    const now = bar.getAttribute('aria-valuenow')!;
    // Not "0 of 2 requirements met", which is what it used to say while
    // standing somewhere in the twenties.
    expect(bar.getAttribute('aria-valuetext')).toBe(`${now}%`);
    expect(Number(now)).toBeGreaterThan(0);
  });

  it('reads out its percentage on the list too', async () => {
    // Two pages draw this bar and both read `readiness`; only one of them
    // had a test, which is how the list kept the old text form through a
    // battery that killed the detail page's.
    await brokenStreak();
    await objective([
      { id: 'r1', requirement: { kind: 'streak-weeks', weeks: 16 } },
      { id: 'r2', requirement: { kind: 'sessions', count: 60 } },
    ]);
    await hydrate();
    renderAt('/objectives', <ObjectivesPage />);

    const bar = (await screen.findAllByRole('progressbar')).find(
      (el) => el.getAttribute('aria-label') === 'A first V8 readiness',
    )!;
    expect(bar, 'no readiness bar on the list').toBeTruthy();
    const now = bar.getAttribute('aria-valuenow')!;
    expect(bar.getAttribute('aria-valuetext')).toBe(`${now}%`);
    expect(Number(now)).toBeGreaterThan(0);
  });

  it('keeps the met-count where a reader still meets it', async () => {
    // Dropping the text form must not drop the fact: it is beside the
    // percentage and in the sentence under the bar, both of which a screen
    // reader walks through on its way past.
    await brokenStreak();
    await objective([
      { id: 'r1', requirement: { kind: 'streak-weeks', weeks: 16 } },
      { id: 'r2', requirement: { kind: 'sessions', count: 60 } },
    ]);
    await hydrate();
    renderAt('/objectives/o1', <ObjectiveDetailPage params={{ id: 'o1' }} />);

    await screen.findByText(/% of the way there/);
    expect(document.body.textContent).toContain('0 of 2 met');
  });
});
