// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putSession, type Session } from '@/db/sessions';
import { LEVELS_PER_DEGREE, RANKS } from '@/engine/economy';
import { hydrate, renderAt, reset } from '@/test/render';
import { GamePage } from './GamePage';

/**
 * On the screen, not only in the arithmetic (PLAN.md M176).
 *
 * The defect was visible: `LevelBar` rendered *"top rank reached"* and
 * `RanksCard` filtered its upcoming rungs out of `RANKS`, so past level 100
 * the card was a list of what was already behind you. An engine that counts
 * degrees correctly changes neither of those on its own.
 */

const TOP = RANKS.at(-1)!;

/**
 * A climber past the top of the ladder.
 *
 * Five sessions of two thousand sends rather than a decade of real ones:
 * level 100 is a million XP, and seeding thirteen hundred sessions through
 * `fake-indexeddb` to prove a label would be a minute of test time for a
 * number the engine tests already pin.
 */
async function pastTheTop(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (let i = 1; i <= 5; i += 1) {
    const date = `2026-0${i}-01`;
    await putSession({
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: 7,
      durationMin: 60,
      warmup: true,
      drillDone: false,
      climbs: [
        { id: `c${i}`, grade: 'V10', scale: 'V', count: 2000, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session);
  }
  await hydrate();
}

/** And one who is still walking the authored names. */
async function partWay(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await putSession({
    id: '2026-01-01#0',
    date: '2026-01-01',
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 60,
    warmup: true,
    drillDone: false,
    climbs: [{ id: 'c1', grade: 'V4', scale: 'V', count: 30, result: 'send', style: 'redpoint' }],
    createdAt: '2026-01-01T18:00:00.000Z',
    updatedAt: '2026-01-01T18:00:00.000Z',
  } as Session);
  await hydrate();
}

const body = () => document.body.textContent ?? '';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('a climber past the last title', () => {
  it('is called by it, with the degree', async () => {
    await pastTheTop();
    renderAt('/game', <GamePage />);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(new RegExp(`^${TOP.title} \\d+$`));
  });

  /** The sentence this milestone deletes. */
  it('is never told the ladder is finished', async () => {
    await pastTheTop();
    renderAt('/game', <GamePage />);
    await screen.findByRole('heading', { level: 1 });
    expect(body()).not.toMatch(/top rank reached/i);
  });

  it('is shown the rung ahead, which is the next degree', async () => {
    await pastTheTop();
    renderAt('/game', <GamePage />);
    await screen.findByRole('heading', { level: 1 });
    expect(body(), 'the strip has no next rung').toMatch(
      new RegExp(`${TOP.title} \\d+ at \\d+`),
    );
  });

  /**
   * And the ladder card lists rungs *ahead*, rather than only what is behind.
   *
   * The first version of this asserted the card's footer sentence and nothing
   * else — so putting the upcoming list back to a filter over `RANKS`, which
   * returns nothing past the top, survived the battery. The footer is about
   * the rungs; the rungs are what has to be there.
   */
  it('lists the rungs ahead on the ranks card', async () => {
    await pastTheTop();
    renderAt('/game', <GamePage />);
    const card = (await screen.findByText('Ranks')).closest('section') ?? document.body;
    const rows = [...card.querySelectorAll('li')].map((li) => li.textContent ?? '');
    const ahead = rows.filter((row) => /GOAT \d+/.test(row));
    expect(ahead.length, `no rungs ahead — rows were ${JSON.stringify(rows)}`).toBeGreaterThanOrEqual(3);
    // Each carries the level it arrives at, and they climb.
    const levels = ahead.map((row) => Number(/^(\d+)/.exec(row.trim())?.[1] ?? NaN));
    expect(levels.every(Number.isFinite), JSON.stringify(ahead)).toBe(true);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]!).toBeGreaterThan(levels[i - 1]!);
    }
    expect(body()).toMatch(new RegExp(`All ${RANKS.length} ranks behind you`));
    expect(body()).toMatch(new RegExp(`a degree every ${LEVELS_PER_DEGREE} levels`));
  });
});

describe('a climber still on the authored names', () => {
  it('is called by the name alone, with no degree on it', async () => {
    await partWay();
    renderAt('/game', <GamePage />);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(RANKS.map((r) => r.title)).toContain(heading.textContent);
  });

  it('is counted toward the top, not past it', async () => {
    await partWay();
    renderAt('/game', <GamePage />);
    await screen.findByText('Ranks');
    expect(body()).toMatch(new RegExp(`${RANKS.length} ranks to ${TOP.title} at level ${TOP.level}`));
  });
});
