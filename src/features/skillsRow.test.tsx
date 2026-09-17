// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession, type Session } from '@/db/sessions';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { hydrate, renderAt, reset } from '@/test/render';
import { SkillsPage } from '@/features/skills/SkillsPage';

/**
 * A skill row, driven (PLAN.md M257).
 *
 * The page had been rendered by exactly two tests — one that checks it
 * mounts and one that reads its layout classes — and neither looked at a
 * row. The row printed its fraction from the longest streak ever run and
 * the line beneath it from the streak in progress, so *16 / 30* sat above
 * *29 more weeks in a row*.
 */

const TODAY = today();
const THIS_WEEK = startOfWeek(TODAY);

let counter = 0;
function log(date: string): Session {
  return newSession(date, counter++, { completed: true, rpe: 7, durationMin: 60 });
}

/** Eight weeks of three sessions, two months off, then this week back. */
async function brokenStreak(): Promise<Session[]> {
  const written: Session[] = [];
  const put = async (date: string) => {
    const session = log(date);
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

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
});

/** The row for a node, by its name, as the whole card of text. */
function row(name: string): string {
  const label = screen.getByText(name);
  return label.closest('div.bg-sunken')?.textContent ?? '';
}

async function openGrit(): Promise<void> {
  renderAt('/skills', <SkillsPage />);
  const heading = await screen.findByText('Mental Grit');
  const button = heading.closest('button');
  if (button) fireEvent.click(button);
}

describe('a rung measured on a streak', () => {
  it('is a fixture whose record is ahead of its run', async () => {
    // The probe has to be able to find the thing (PLAN.md M195): with the
    // two numbers equal there is nothing here to get wrong, and every
    // assertion below would pass on a page that never had the bug.
    const state = deriveClimberState(await brokenStreak());
    expect(state.longestStreakWeeks).toBeGreaterThan(state.streakWeeks);
    await hydrate();
    await openGrit();
    // And the row the tests read is the one that spans both numbers.
    expect(row('Unbroken')).toContain('/ 30');
  });

  it('counts from the streak being run, not the one behind it', async () => {
    await brokenStreak();
    await hydrate();
    await openGrit();
    const text = row('Unbroken');
    // The gap says how many weeks are left; the fraction has to be the
    // rest of that same thirty.
    const fraction = /(\d+) \/ 30/.exec(text);
    const gap = /(\d+) more weeks in a row/.exec(text);
    expect(fraction, text).toBeTruthy();
    expect(gap, text).toBeTruthy();
    expect(Number(fraction![1]) + Number(gap![1])).toBe(30);
  });

  it('keeps the record where the record belongs — the rungs it unlocked', async () => {
    await brokenStreak();
    await hydrate();
    await openGrit();
    // Eight weeks running is 'Two Months', and a broken streak does not
    // take it back. It is unlocked, so it draws no fraction at all.
    expect(row('Two Months')).not.toMatch(/\d+ \/ \d+/);
    expect(row('Unbroken')).toMatch(/\d+ \/ 30/);
  });

  it('says the same number to a reader who cannot see the bar', async () => {
    await brokenStreak();
    await hydrate();
    await openGrit();
    const bar = screen
      .getByText('Unbroken')
      .closest('div.bg-sunken')
      ?.querySelector('[role="progressbar"]');
    expect(bar).toBeTruthy();
    const fraction = /(\d+) \/ 30/.exec(row('Unbroken'))!;
    expect(bar!.getAttribute('aria-valuetext')).toBe(`${fraction[1]} of 30`);
  });
});

describe('a rung nobody has started', () => {
  it('draws an empty bar rather than a sliver of accent', async () => {
    await hydrate();
    await openGrit();
    const bar = screen
      .getByText('First Day Out')
      .closest('div.bg-sunken')
      ?.querySelector('[role="progressbar"]');
    // The old bar floored the fill at 2%, which is progress the log does
    // not have on the page whose claim is that nothing here is granted.
    expect(bar?.getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('the bar itself', () => {
  it('is the primitive, not a fourth copy of its class string', () => {
    const source = readFileSync('src/features/skills/SkillsPage.tsx', 'utf8');
    expect(source).not.toMatch(/style=\{\{ width:/);
    expect(source).toContain('<Meter');
  });
});
