// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { loadPrograms } from '@/content/programs';
import { shortLabel, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';

/**
 * A logged day says how hard it was (PLAN.md M144).
 *
 * Every completed day was the same ✅ — a two-hour limit session and a
 * twenty-minute flush drew identically — while the session carried an RPE
 * the whole time. The shade is the one channel a 40px cell has left, and
 * the accessible name carries the same fact in words.
 */

const TODAY = today();

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

async function calendar() {
  await hydrate();
  renderAt('/calendar', <CalendarPage />);
  // The grid, not the legend: the legend's logged row only appears once
  // something is logged, which is the point of M145.
  await screen.findByText('Mark days');
}

/** The cell for a date, found by the link it is. */
const cell = (date: string) =>
  document.querySelector(`a[href="#/log/${date}"]`) as HTMLElement | null;

describe('the shade of a logged day', () => {
  it('darkens with the effort the climber rated', async () => {
    await putSession(newSession(TODAY, 0, { completed: true, rpe: 10 }));
    await calendar();
    expect(cell(TODAY)?.className).toContain('bg-accent/50');
  });

  it('is lighter for an easy day than for a hard one', async () => {
    await putSession(newSession(TODAY, 0, { completed: true, rpe: 3 }));
    await calendar();
    expect(cell(TODAY)?.className).toContain('bg-accent/8');
  });

  /**
   * Exactly one background class, which is the rule this cell has carried
   * since M100: it emitted three at once and which you saw came down to
   * Tailwind's emit order rather than the order they were written.
   */
  it('emits one background class and no more', async () => {
    await putSession(newSession(TODAY, 0, { completed: true, rpe: 8 }));
    await calendar();
    const backgrounds = (cell(TODAY)?.className ?? '')
      .split(/\s+/)
      .filter((c) => c.startsWith('bg-'));
    expect(backgrounds).toHaveLength(1);
  });

  it('keeps the plain logged tint when nobody rated the day', async () => {
    await putSession(newSession(TODAY, 0, { completed: true }));
    await calendar();
    expect(cell(TODAY)?.className).toContain('bg-accent/15');
  });
});

describe('and says it in words, not only in colour', () => {
  it('names how hard the day was in the accessible name', async () => {
    await putSession(newSession(TODAY, 0, { completed: true, rpe: 9 }));
    await calendar();
    expect(cell(TODAY)?.getAttribute('aria-label')).toBe(`${shortLabel(TODAY)} — logged, limit day`);
  });

  it('still says it was logged when the effort is unknown', async () => {
    await putSession(newSession(TODAY, 0, { completed: true }));
    await calendar();
    expect(cell(TODAY)?.getAttribute('aria-label')).toBe(`${shortLabel(TODAY)} — logged`);
  });

  // A day with nothing on it is still a link to its log, and naming it
  // "logged" would be a lie the grid tells on every empty square.
  it('leaves an empty day unnamed', async () => {
    await calendar();
    expect(cell(TODAY)?.hasAttribute('aria-label')).toBe(false);
  });

  it('says what the shading means in the legend', async () => {
    await putSession(newSession(TODAY, 0, { completed: true, rpe: 7 }));
    await calendar();
    expect(screen.getByText(/the darker the day, the harder you rated it/)).toBeTruthy();
  });
});
