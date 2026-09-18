// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession, type Session } from '@/db/sessions';
import { describeDeadline, nextUp, type Challenge } from '@/engine/challenges';
import { addDays, dayOfWeek, startOfWeek, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { BoardPage, BoardCard } from './BoardPage';

/**
 * The board, driven (PLAN.md M263).
 *
 * `/board` was rendered by one test — `mounts.test.tsx`, which checks it
 * does not crash. It is the densest page in the app for counts, targets and
 * deadlines, and nothing had ever read a word of it.
 */

let n = 0;
const log = (date: string, patch: Partial<Session> = {}): Session =>
  newSession(date, n++, { completed: true, rpe: 7, durationMin: 60, ...patch }) as Session;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  n = 0;
});

describe('how long is left', () => {
  /** A weekly, whose window is the calendar week it sits in. */
  const weekly = (to: string): Challenge =>
    ({ kind: 'weekly', from: startOfWeek(to), to } as Challenge);

  // 2026-09-13 is a Sunday, so the week it opens runs to Saturday the 19th.
  const SATURDAY = '2026-09-19';

  it('counts every day of the week, and only ever says day once', () => {
    // The sentence is the engine's now, so it can be read on all seven days
    // rather than on whichever one the suite runs (PLAN.md M263).
    const said = Array.from({ length: 7 }, (_, i) =>
      describeDeadline(weekly(SATURDAY), addDays(SATURDAY, -6 + i)),
    );
    expect(said).toEqual([
      '6 days left',
      '5 days left',
      '4 days left',
      '3 days left',
      '2 days left',
      '1 day left',
      'today',
    ]);
  });

  it('calls the last day today rather than nought days left', () => {
    expect(describeDeadline(weekly(SATURDAY), SATURDAY)).toBe('today');
    expect(describeDeadline(weekly(SATURDAY), addDays(SATURDAY, 3))).toBe('today');
  });

  it('says nothing at all about a bounty, which does not expire', () => {
    const bounty = { kind: 'bounty', from: SATURDAY, to: SATURDAY } as Challenge;
    expect(describeDeadline(bounty, SATURDAY)).toBeNull();
  });

  it('puts the engine’s sentence on the page, on a Friday', async () => {
    // The clock is held so the page cannot be right by accident: a row that
    // said “today” for everything would pass six days a week
    // (PLAN.md M263). Friday is the day the defect read “1 days left”.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date(2026, 8, 18, 12, 0, 0));
      expect(dayOfWeek(today())).toBe(5);

      await putSession(log(today()));
      await hydrate();
      renderAt('/board', <BoardPage />);
      await screen.findByText('Board');

      const said = document.body.textContent ?? '';
      // The daily ends tonight; the weeklies have tomorrow.
      expect(said).toContain('1 day left');
      expect(said).not.toContain('1 days left');
      expect(said).toContain('today');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('what to do next', () => {
  const done = (id: string, isDone: boolean): Challenge =>
    ({ id, title: id, done: isDone } as Challenge);

  it('is the daily while the daily is open', () => {
    const board = { daily: done('daily', false), weekly: [done('w1', false)], bounties: [] };
    expect(nextUp(board as never)?.id).toBe('daily');
  });

  it('is the first weekly once the daily is done', () => {
    const board = {
      daily: done('daily', true),
      weekly: [done('w1', true), done('w2', false)],
      bounties: [],
    };
    expect(nextUp(board as never)?.id).toBe('w2');
  });

  it('is the bounty when the daily and every weekly are done', () => {
    // The state the card got wrong: it read the daily and the weeklies and
    // stopped, so this said "Board clear" while a bounty was open — under a
    // line that counts the bounties.
    const board = {
      daily: done('daily', true),
      weekly: [done('w1', true), done('w2', true)],
      bounties: [done('b1', false)],
    };
    expect(nextUp(board as never)?.id).toBe('b1');
  });

  it('is nothing only when nothing at all is left', () => {
    const board = {
      daily: done('daily', true),
      weekly: [done('w1', true)],
      bounties: [done('b1', true)],
    };
    expect(nextUp(board as never)).toBeNull();
  });

  it('walks the same lists the card counts', () => {
    // The two halves are one board: if the count reads three lists and the
    // line reads two, they disagree on a screen a climber is looking at.
    const board = {
      daily: done('daily', true),
      weekly: [done('w1', true)],
      bounties: [done('b1', false), done('b2', false)],
    };
    const all = [board.daily, ...board.weekly, ...board.bounties];
    expect(all.filter((c) => !c.done).length).toBe(2);
    expect(nextUp(board as never)).not.toBeNull();
  });
});

describe('the card on the game page', () => {
  it('says what is left rather than calling the board clear', async () => {
    // One session today, so the daily is open and the card has to name it.
    await putSession(log(today(), { rpe: 7 }));
    await hydrate();
    renderAt('/game', <BoardCard />);
    await screen.findByText(/done|ready to claim/);
    const said = document.body.textContent ?? '';
    expect(said).not.toContain('Board clear');
    expect(said.length).toBeGreaterThan(10);
  });
});
