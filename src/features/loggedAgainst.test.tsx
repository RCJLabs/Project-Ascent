// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { loadPrograms, getProgram } from '@/content/programs';
import { IRON_GRIP } from '@/content/programs/catalogue';
import { newSession, putSession } from '@/db/sessions';
import { addDays, dayOfWeek, startOfWeek, today } from '@/engine/dates';
import { planFromLayout } from '@/engine/scheduler';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from '@/features/log/LogPage';
import { FinishPage } from '@/features/finish/FinishPage';

/**
 * What was logged, against what was asked — and read back (PLAN.md M130).
 *
 * Two halves of one gap. The entry carries no block and no phase, so the app
 * could ask whether a climber did a thing with that name and not whether
 * they did what the day asked; and `exerciseSeries` has built the whole run
 * of readings for one line since M98 with nothing but `lastLogged` reading
 * it, so a climber on a hangboard block could see last time and never the
 * block.
 *
 * Neither half stores anything new. The first is derived from the day's own
 * prescription, which M127 to M129 made week-accurate; the second is the
 * series that was already there.
 */

const DATE = today();
const TEXT = () => document.body.textContent ?? '';

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

/** Iron Grip, week 2 of The Anvil, with the repeaters already logged. */
async function loggedSets(sets: number | undefined): Promise<void> {
  const program = getProgram('iron_grip')!;
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: program.id,
    sessionTypeId: 'fp',
    exercises: sets === undefined ? [] : [{ name: '7/3 Repeaters', sets }],
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: addDays(startOfWeek(DATE), -7) },
    plans: { [program.id]: { [dayOfWeek(DATE)]: 'fp' } },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
  });
  renderAt('/', <DayBody date={DATE} />);
  await screen.findByText("Today's prescription");
}

describe('what you logged against what was asked', () => {
  it('says nothing when the day was done as written', async () => {
    // The Anvil asks 3-5. Four is four.
    await loggedSets(4);
    expect(TEXT()).not.toMatch(/against the .* asked/);
  });

  it('says so when it fell short', async () => {
    await loggedSets(2);
    expect(screen.getByText(/2 sets, against the 3-5 asked\./)).toBeTruthy();
  });

  it('says so when it went past', async () => {
    await loggedSets(7);
    expect(screen.getByText(/7 sets, against the 3-5 asked\./)).toBeTruthy();
  });

  it('says nothing at all before a number is typed', async () => {
    await loggedSets(undefined);
    expect(TEXT()).not.toMatch(/against the .* asked/);
  });

  it('counts one set as a set', async () => {
    await loggedSets(1);
    expect(screen.getByText(/1 set, against the 3-5 asked\./)).toBeTruthy();
  });
});

describe('the climb name comes before the button it applies to', () => {
  it('is above Add, not below it', async () => {
    // The natural gesture is grade, outcome, Add — and with the field below
    // the button every climb was filed unnamed.
    await loggedSets(4);
    const name = screen.getByLabelText('Climb name');
    const add = screen
      .getAllByRole('button')
      .find((b) => (b.textContent ?? '').trim() === 'Add')!;
    expect(add, 'no Add button in the climbs card').toBeTruthy();
    expect(name.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('one line, across the block', () => {
  const PLAN = planFromLayout(IRON_GRIP.recommendedLayout!);
  const START = addDays(startOfWeek(DATE), -14);
  /** The dates the two readings were logged on, in order. */
  const READINGS = [addDays(START, 1), addDays(START, 8)];

  /** Two completed sessions in the running block, same line, moving load. */
  async function withReadings(): Promise<void> {
    for (const [i, load] of [12, 15].entries()) {
      await putSession({
        ...newSession(READINGS[i]!, 0, { completed: true }),
        programId: 'iron_grip',
        sessionTypeId: 'fp',
        exercises: [{ name: 'Max Hangs', sets: 5, load }],
      } as never);
    }
    await hydrate();
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: START },
      plans: { iron_grip: PLAN },
    });
    renderAt('/finish', <FinishPage />);
    await screen.findByText('What you were lifting');
  }

  /** The open chart for one line, by its caption. */
  function chartFor(name: string): HTMLElement {
    const figure = [...document.querySelectorAll('figure')].find(
      (f) => f.querySelector('figcaption')?.textContent === name,
    );
    expect(figure, `no chart for ${name}`).toBeTruthy();
    return figure as HTMLElement;
  }

  it('lists the line with its movement, as it always did', async () => {
    await withReadings();
    expect(screen.getByText('Max Hangs')).toBeTruthy();
    expect(TEXT()).toMatch(/load .* → .*/);
  });

  it('keeps the chart shut until the line is opened', async () => {
    await withReadings();
    expect(document.querySelector('svg[role="img"]')).toBeNull();
    expect(screen.getByRole('button', { name: /Max Hangs/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('charts the readings when it is', async () => {
    await withReadings();
    fireEvent.click(screen.getByRole('button', { name: /Max Hangs/ }));
    expect(screen.getByRole('button', { name: /Max Hangs/ }).getAttribute('aria-expanded')).toBe('true');
    // The chart's own caption, not merely "an svg": the block report card
    // above has one, so counting svgs passes with no history at all.
    const captions = [...document.querySelectorAll('figcaption')].map((c) => c.textContent);
    expect(captions).toContain('Max Hangs, load');
    // And the readings are the sessions' own, dated: the chart's table
    // formats the date it is handed, so a chart fed anything but the real
    // one still draws a line and still says "Invalid Date" to a screen
    // reader. Digits rather than a formatted string, because the row is
    // whatever the runner's locale makes of it.
    const digits = (cell: Element) => (cell.textContent?.match(/\d+/g) ?? []).map(Number);
    const rows = [...chartFor('Max Hangs, load').querySelectorAll('tbody th')];
    expect(rows).toHaveLength(2);
    for (const [i, date] of READINGS.entries()) {
      expect(digits(rows[i]!), `row ${i} is not the date that reading was logged on`).toContain(
        Number(date.slice(8, 10)),
      );
    }
  });

  it('charts the block, not everything ever logged', async () => {
    // A reading from before the block starts belongs to the block before
    // it. `exerciseMovement` windows its list and the chart has to agree,
    // or the line says "two readings" over three dots.
    await putSession({
      ...newSession('2025-06-02', 0, { completed: true }),
      programId: 'iron_grip',
      sessionTypeId: 'fp',
      exercises: [{ name: 'Max Hangs', sets: 5, load: 5 }],
    } as never);
    await withReadings();
    fireEvent.click(screen.getByRole('button', { name: /Max Hangs/ }));
    expect(chartFor('Max Hangs, load').querySelectorAll('circle')).toHaveLength(2);
  });

  it('shuts again on a second tap, so one line is open at a time', async () => {
    await withReadings();
    const row = screen.getByRole('button', { name: /Max Hangs/ });
    fireEvent.click(row);
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });
});
