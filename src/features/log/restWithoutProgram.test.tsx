// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { listSessions, putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { isRestSession, startedAsRest } from '@/engine/rest';
import { NO_HABITS, REST_ITEMS } from '@/engine/restHabits';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { HomePage } from '@/features/home/HomePage';
import { LogPage } from './LogPage';

/**
 * The rest day a climber could not log (PLAN.md M191).
 *
 * ## What was measured
 *
 * With twelve sessions and **no program**, the coach board carried *"No rest
 * days logged, ever"* with a button reading **Log a rest day** pointing at
 * `/today` — and `/today` offered *Search* and *Log a session*, and never
 * used the word "rest" anywhere on the page. The app was nagging a climber
 * to do something it gave them no way to do, which is M132's finding in the
 * domain next door.
 *
 * ## Why, and it is not the two definitions the note recorded
 *
 * The logger gated its rest editor on `type?.isRest` — the **plan** — while
 * every count reads `isRestSession(session)` — the **record**. With no
 * program there is no plan, so the record could never be written. The two
 * predicates are genuinely different questions and both are worth having;
 * what was wrong is that the logger asked a third one.
 */

const DAY = today();

async function twelveSessionsNoProgram(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (let d = 30; d >= 2; d -= 2) {
    const date = addDays(DAY, -d);
    await putSession({
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: 7,
      durationMin: 90,
      warmup: true,
      drillDone: false,
      climbs: [
        { id: `c${d}`, grade: 'V4', scale: 'V', count: 4, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session);
  }
  await hydrate();
  useProfile.setState({
    activeProgramId: null,
    startDates: {},
    injuries: [],
    dismissedTips: {},
    dismissedCards: ['safety', 'setup', 'programs'],
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('a rest day with no program behind it', () => {
  it('is offered at all', async () => {
    await twelveSessionsNoProgram();
    renderAt('/', <HomePage />);
    await screen.findByRole('heading', { level: 1 });
    expect(
      screen.getByRole('button', { name: /rest day/i }),
      'a climber with no program still has no way to log one',
    ).toBeTruthy();
  });

  /**
   * And starting it writes a record the rest of the app recognises. The
   * checklist is what makes it one — `restChecklist` present and no climbs
   * is the app's definition, and it is the same field the editor reads.
   *
   * The write is awaited rather than the logger: on Home the chip also
   * navigates, and this test renders Home alone. The editor is the test
   * below, given a record rather than a click.
   */
  it('writes a session the counts recognise', async () => {
    await twelveSessionsNoProgram();
    renderAt('/', <HomePage />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: /rest day/i }));

    let written: Session | undefined;
    await waitFor(async () => {
      written = (await listSessions()).find((s) => s.date === DAY);
      expect(written, 'nothing was written').toBeTruthy();
    });
    expect(isRestSession(written!), 'the record does not count as a rest day').toBe(true);
    expect(startedAsRest(written!)).toBe(true);
    expect(written!.climbs).toEqual([]);
    expect(written!.sessionTypeId, 'a type was invented for a climber with no program')
      .toBeUndefined();
    // Not `toEqual(NO_HABITS)`: that compares the record against the same
    // constant that wrote it, so a checklist of four `true`s would satisfy
    // it. The battery found exactly that.
    expect(
      Object.values(written!.restChecklist!),
      'the day was logged with its habits already ticked',
    ).toEqual([false, false, false, false]);
    expect(
      written!.planned,
      'a rest day nobody planned was recorded as a planned session',
    ).toBe(false);
  });

  /**
   * And the logger gives that record the editor with the checklist in it,
   * with no program anywhere — which is the half that `type?.isRest` could
   * never reach.
   */
  it('opens the editor that has the checklist in it', async () => {
    await twelveSessionsNoProgram();
    await putSession({
      id: `${DAY}#0`,
      date: DAY,
      planned: false,
      completed: false,
      rewarded: false,
      mode: 'indoor',
      warmup: false,
      drillDone: false,
      climbs: [],
      restChecklist: NO_HABITS,
      createdAt: `${DAY}T10:00:00.000Z`,
      updatedAt: `${DAY}T10:00:00.000Z`,
    } as Session);
    await hydrate();
    useProfile.setState({ activeProgramId: null, startDates: {}, dismissedCards: ['safety', 'setup', 'programs'] });

    renderAt(`/log/${DAY}`, <LogPage params={{ date: DAY }} />);
    for (const label of ['Hydration', 'Mobility', 'Walking / Zone 1', 'Sleep 8+ hrs']) {
      expect(await screen.findByText(label), `${label} is missing from the rest editor`).toBeTruthy();
    }
  });
});

describe('and only when nothing else offers one', () => {
  /**
   * A program with a rest type already puts it on the chip row, or on the
   * big button when today is one. A second generic chip beside the
   * program's own is two ways to do one thing — caught by
   * `restDayDrill.test.tsx` rather than by this file, because the first
   * draft checked only the big button.
   */
  it('stays out of the way of a program that has its own', async () => {
    await twelveSessionsNoProgram();
    useProfile.setState({ activeProgramId: 'iron_grip', startDates: { iron_grip: addDays(DAY, -7) } });
    renderAt('/', <HomePage />);
    await screen.findByRole('heading', { level: 1 });
    const chips = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(
      chips.filter((t) => /rest/i.test(t)).length,
      `two ways to log one thing: ${chips.filter((t) => /rest/i.test(t)).join(' / ')}`,
    ).toBe(1);
  });
});

describe('what an unticked checklist is', () => {
  /**
   * Checked against `REST_ITEMS`, which owns the list, rather than against
   * `NO_HABITS` itself — a constant compared with itself agrees however it
   * is built, and the battery proved it by dropping a key and by ticking
   * every box.
   */
  it('has every habit, and none of them done', () => {
    expect(Object.keys(NO_HABITS).sort()).toEqual(REST_ITEMS.map((item) => item.key).sort());
    expect(Object.values(NO_HABITS)).toEqual(REST_ITEMS.map(() => false));
  });
});

describe('the two questions, kept apart', () => {
  const restDay = { restChecklist: NO_HABITS, climbs: [] };

  it('agree on a plain rest day', () => {
    expect(startedAsRest(restDay)).toBe(true);
    expect(isRestSession(restDay)).toBe(true);
  });

  /**
   * And part company on the one that matters: a rest day someone climbed on
   * stops counting as rest, and must not have the editor swapped out from
   * under them while they are typing into it.
   */
  it('part company once a climb lands on it', () => {
    const climbed = {
      restChecklist: NO_HABITS,
      climbs: [{ id: 'c', grade: 'V2', scale: 'V' as const, count: 1, result: 'send' as const }],
    };
    expect(startedAsRest(climbed), 'the editor would flip mid-edit').toBe(true);
    expect(isRestSession(climbed), 'a day with climbs on it counted as rest').toBe(false);
  });

  it('agree that an ordinary session is not one', () => {
    const training = { climbs: [], restChecklist: undefined };
    expect(startedAsRest(training)).toBe(false);
    expect(isRestSession(training)).toBe(false);
  });

  /**
   * The logger asks the record, not the plan. A source check because the
   * alternative — a program-less fixture that renders the training editor —
   * is what every test above already covers from the other side.
   */
  it('is what the logger reads', () => {
    const logger = readFileSync('src/features/log/LogPage.tsx', 'utf8');
    expect(logger).toMatch(/const isRest = type\?\.isRest === true \|\| startedAsRest\(session\)/);
  });
});
