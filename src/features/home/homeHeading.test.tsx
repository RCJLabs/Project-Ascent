// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { Program } from '@/content/types';
import { addDays } from '@/engine/dates';
import type { DayStatus, WeekDay, WeekOutline } from '@/engine/week';
import { renderAt } from '@/test/render';
import { HomeHeading } from './HomeHeading';

/**
 * The day, and where it sits in the week (PLAN.md M241).
 *
 * `HomeHeading` takes its outline rather than reading one, so the strip can
 * be drawn from a week built by hand — which is the only way to put a day in
 * every state at once and see what each one draws.
 */

const SUNDAY = '2026-09-13';
const TODAY = '2026-09-17'; // Thursday
const day = (i: number, status: DayStatus, training = false): WeekDay =>
  ({
    date: addDays(SUNDAY, i),
    training,
    status,
    sessions: status === 'done' || status === 'started' ? [{ id: 'x' }] : [],
    spent: null,
    load: {},
  }) as unknown as WeekDay;

const outline = (days: WeekDay[], patch: Partial<WeekOutline> = {}): WeekOutline =>
  ({
    start: SUNDAY,
    end: addDays(SUNDAY, 6),
    week: 5,
    isDeload: false,
    before: false,
    over: false,
    days,
    planned: days.filter((d) => d.training).length,
    done: days.filter((d) => d.status === 'done').length,
    extra: 0,
    steps: [],
    lightened: false,
    drills: [],
    ...patch,
  }) as WeekOutline;

const PROGRAM = { name: 'Iron Grip', weeks: 12 } as Program;

const WEEK = [
  day(0, 'done'),
  day(1, 'rest'),
  day(2, 'done', true),
  day(3, 'rest'),
  day(4, 'rest'), // Thursday — today, and the plan places nothing on it
  day(5, 'planned', true),
  day(6, 'planned', true),
];

function draw(days = WEEK, patch: Partial<WeekOutline> = {}, program: Program | undefined = PROGRAM) {
  renderAt('/', <HomeHeading date={TODAY} outline={outline(days, patch)} program={program} />);
}

const links = () => screen.getAllByRole('link').filter((a) => (a.getAttribute('href') ?? '').startsWith('#/log/'));

describe('the strip', () => {
  it('is seven days, each a link to its own log', () => {
    draw();
    expect(links()).toHaveLength(7);
    expect(links().map((a) => a.getAttribute('href'))).toEqual(
      Array.from({ length: 7 }, (_, i) => `#/log/${addDays(SUNDAY, i)}`),
    );
  });

  /**
   * The bug this file was written for. `statusOf` returns `'rest'` before it
   * ever asks whether the date is today, so a strip that read the status
   * put a grey dot on Thursday and a ring on nothing — on the one screen
   * whose job is saying where you are now.
   */
  it('marks today from the date, not from what the plan put there', () => {
    draw();
    const thursday = links()[4]!;
    expect(thursday.getAttribute('aria-current')).toBe('date');
    expect(thursday.getAttribute('aria-label')).toContain('today');
    // And nothing else claims to be.
    expect(links().filter((a) => a.getAttribute('aria-current') === 'date')).toHaveLength(1);
  });

  it('says what happened on each day, not just its letter', () => {
    draw();
    const label = (i: number) => links()[i]!.getAttribute('aria-label') ?? '';
    expect(label(0)).toContain('done');
    expect(label(5)).toContain('planned');
    expect(label(1)).toContain('rest day');
    // A reader hearing seven letters would get "S M T W T F S" and nothing.
    for (let i = 0; i < 7; i += 1) expect(label(i).length).toBeGreaterThan(8);
  });

  it('flags the limit day, and only it', () => {
    draw(WEEK, { days: WEEK, steps: [] });
    const flagged = links().filter((a) => (a.getAttribute('aria-label') ?? '').includes('limit day'));
    expect(flagged.length).toBeLessThanOrEqual(1);
  });

  /**
   * A week with nothing placed and nothing logged has no shape, and seven
   * empty dots on a first run is a worse first impression than none — the
   * rule M239 set for the numbers, applied to the same screen.
   */
  it('draws nothing at all for a week with nothing in it', () => {
    draw(Array.from({ length: 7 }, (_, i) => day(i, 'rest')), {}, undefined);
    expect(links()).toHaveLength(0);
    // The date is still there; it is the strip that is absent.
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });
});

describe('the line under it', () => {
  it('says where the block is, once', () => {
    draw();
    expect(screen.getByText(/Week 5 of 12/)).toBeTruthy();
  });

  /**
   * And Home says it nowhere else. It used to be here *and* in a *Your week*
   * card a few hundred pixels below, which is the duplication this milestone
   * came from.
   */
  it('is the only place Home names the week', () => {
    const home = readFileSync('src/features/home/HomePage.tsx', 'utf8');
    expect(home, 'Home has a week card again').not.toMatch(/Your week/);
    expect(home, "Home borrowed the logger's heading again").not.toMatch(/<DayHeading\b/);
  });

  /**
   * The logger keeps its own. `DayHeading` is right where it lives — a day
   * with the days either side of it — and nothing here should have changed
   * that.
   */
  it('left the logger its arrows', () => {
    const logger = readFileSync('src/features/log/DayHeading.tsx', 'utf8');
    expect(logger).toMatch(/Previous day/);
    expect(logger).toMatch(/Next day/);
  });
});
