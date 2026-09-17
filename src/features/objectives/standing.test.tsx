// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession, type Session } from '@/db/sessions';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { useObjectives } from '@/store/objectives';
import { hydrate, renderAt, reset } from '@/test/render';
import { ObjectiveDetailPage } from './ObjectiveDetailPage';

/**
 * What an objective says you have done (PLAN.md M257).
 *
 * `suggestedRequirements` puts a `streak-weeks` on every new objective, and
 * that is the one requirement kind whose `current` is a record rather than
 * a position. This page drew three numbers from it — the row's fraction,
 * the meter beside it, and the "Furthest away" card — and all three read a
 * streak the climber was no longer on.
 */

const TODAY = today();
const THIS_WEEK = startOfWeek(TODAY);

let counter = 0;

/** Eight weeks of three sessions, two months off, then this week back. */
async function brokenStreak(): Promise<Session[]> {
  const written: Session[] = [];
  const put = async (date: string) => {
    const session = newSession(date, counter++, { completed: true, rpe: 7, durationMin: 60 });
    written.push(session);
    await putSession(session);
  };
  for (let w = 20; w >= 13; w--) {
    for (const d of [0, 2, 4]) await put(addDays(THIS_WEEK, -7 * w + d));
  }
  for (const d of [0, 2, 4]) {
    const date = addDays(THIS_WEEK, d);
    if (date <= TODAY) await put(date);
  }
  return written;
}

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
