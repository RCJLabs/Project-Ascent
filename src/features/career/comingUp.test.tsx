// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { counterLadder } from '@/engine/career';
import { hydrate, renderAt, reset } from '@/test/render';
import { CareerPage } from './CareerPage';

/**
 * "Coming up", driven (PLAN.md M258).
 *
 * `/career` had no test file of its own. Its meters read a `fraction` that
 * is the share of the gap between the last milestone and the next — the
 * ladder runs 1 · 2.5 · 5 per decade, so 300 sessions is a fifth of the way
 * from 250 to 500 — and told a screen reader "300 of 500", a journey that
 * started at zero.
 */

const TODAY = today();

async function sessions(n: number): Promise<Session[]> {
  const written: Session[] = [];
  for (let i = 0; i < n; i++) {
    const s = newSession(addDays(TODAY, -Math.floor(i * 2.4)), i, {
      completed: true,
      rpe: 7,
      durationMin: 90,
    });
    written.push(s);
    await putSession(s);
  }
  return written;
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
});

/**
 * Every "Coming up" row, as its label, its bar and the column beside it.
 *
 * Found from the bars outward rather than from the card in: "Coming up" is
 * a `Card` title and the element it sits in is not the one holding the
 * list. The bars are the rows — they are the only four on this page.
 */
function rows() {
  return [...document.querySelectorAll('[role="progressbar"]')].map((bar) => {
    const li = bar.closest('li')!;
    const spans = li.querySelectorAll('span');
    return {
      label: spans[0]?.textContent ?? '',
      column: spans[1]?.textContent ?? '',
      valuenow: Number(bar.getAttribute('aria-valuenow')),
      valuetext: bar.getAttribute('aria-valuetext') ?? '',
    };
  });
}

describe('the bar and what it says it says', () => {
  it('is a fixture whose rungs are a long way apart', async () => {
    // The probe has to be able to find the thing (PLAN.md M195). With 300
    // sessions the next rung is 500 and the last was 250, so an absolute
    // reading and a gap reading are forty points apart; on a log sitting
    // just past a rung they would agree and nothing here would bite.
    const ladder = counterLadder(10, 300);
    expect(ladder.at(-1)).toBe(500);
    expect(ladder.at(-2)).toBe(250);
  });

  it('never tells a reader a different number from the one it draws', async () => {
    await sessions(300);
    await hydrate();
    renderAt('/career', <CareerPage />);
    await screen.findByText('Coming up');

    const all = rows();
    expect(all.length).toBeGreaterThan(2);
    for (const row of all) {
      // The whole rule: the column a climber reads and the sentence the
      // meter reads out are one string, so they cannot drift.
      expect(row.valuetext, row.label).toBe(row.column);
    }
  });

  it('draws the share of the gap, not the share of the whole', async () => {
    await sessions(300);
    await hydrate();
    renderAt('/career', <CareerPage />);
    await screen.findByText('Coming up');

    const row = rows().find((r) => r.label === '500 sessions');
    expect(row, rows().map((r) => r.label).join(', ')).toBeTruthy();
    // 300 sessions is a fifth of the way from 250 to 500, and three fifths
    // of the way from nowhere. The bar has always drawn the first.
    expect(row!.valuenow).toBeLessThan(30);
    expect(row!.column).toBe('200 to go');
    expect(row!.valuetext).not.toMatch(/300|of 500/);
  });

  it('counts an anniversary in days', async () => {
    await sessions(300);
    await hydrate();
    renderAt('/career', <CareerPage />);
    await screen.findByText('Coming up');

    const years = rows().find((r) => /years? in$/.test(r.label));
    expect(years, rows().map((r) => r.label).join(', ')).toBeTruthy();
    expect(years!.column).toMatch(/^\d+ days? to go$/);
    expect(years!.valuetext).toBe(years!.column);
  });
});

/**
 * The anniversary that is tomorrow.
 *
 * Every other row counts in whole units a climber accumulates; this one
 * counts down in days, and one of those days is *one*. Reaching it needs a
 * first logged day whose next anniversary is tomorrow, which is a fixture
 * the calendar has to be asked for rather than assumed — `addYears` moves
 * `setFullYear`, and a 29 February does not survive the round trip.
 */
function anniversaryTomorrow(): string | null {
  // From the clock now, not from module load (PLAN.md M261). The page reads
  // `today()` when it renders, so a run that crosses midnight between the
  // two is looking for an anniversary a day off the one this seeded.
  const wanted = addDays(today(), 1);
  for (const years of [1, 2, 3, 4]) {
    const back = new Date(`${wanted}T00:00:00`);
    back.setFullYear(back.getFullYear() - years);
    const key = back.toISOString().slice(0, 10);
    const forward = new Date(`${key}T00:00:00`);
    forward.setFullYear(forward.getFullYear() + years);
    if (forward.toISOString().slice(0, 10) === wanted) return key;
  }
  return null;
}

describe('one day to go', () => {
  it('says day rather than days', async () => {
    const first = anniversaryTomorrow();
    // Four candidates, and a leap day can spoil at most one of them.
    expect(first).not.toBeNull();

    await putSession(newSession(first!, 0, { completed: true, rpe: 7, durationMin: 60 }));
    await putSession(newSession(today(), 1, { completed: true, rpe: 7, durationMin: 60 }));
    await hydrate();
    renderAt('/career', <CareerPage />);
    await screen.findByText('Coming up');

    const years = rows().find((r) => /years? in$/.test(r.label));
    expect(years, rows().map((r) => `${r.label}=${r.column}`).join(', ')).toBeTruthy();
    expect(years!.column).toBe('1 day to go');
    expect(years!.valuetext).toBe('1 day to go');
  });
});

describe('the count in the subtitle', () => {
  it('says one milestone, not one milestones', async () => {
    // Ten sessions and no sends is exactly one — and that climber is the
    // one most likely to be reading this line.
    await sessions(11);
    await hydrate();
    renderAt('/career', <CareerPage />);
    const heading = await screen.findByText(/milestone/);
    expect(heading.textContent).toMatch(/^1 milestone since /);
  });

  it('still pluralises the rest of the time', async () => {
    await sessions(300);
    await hydrate();
    renderAt('/career', <CareerPage />);
    const heading = await screen.findByText(/milestones since/);
    expect(heading.textContent).toMatch(/^\d\d+ milestones since /);
  });
});
