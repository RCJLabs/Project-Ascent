// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms, getProgram } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { addDays, dayOfWeek, shortLabel, startOfWeek, today } from '@/engine/dates';
import { blockWindow, plannedDay } from '@/engine/plan';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { HomePage } from '@/features/home/HomePage';

/**
 * Pressing Start on a Thursday (PLAN.md M259).
 *
 * Reported from a phone: a twelve-week block begun on Thursday the 17th
 * drew planned sessions onto the 13th, the 15th and the 16th, and the month
 * gutter graded that week *0/4*. Three of those four sessions were on days
 * the climber had not started, and the calendar said they had missed them.
 */

const TODAY = today();
const THIS_SUNDAY = startOfWeek(TODAY);
/** This week's Thursday, whatever day the suite runs on. */
const THURSDAY = addDays(THIS_SUNDAY, 4);
const NEXT_SUNDAY = addDays(THIS_SUNDAY, 7);
const PROGRAM = 'peak_performance';

/** Sunday, Tuesday, Wednesday and Friday — the days that were reported. */
const PLAN = { 0: 'perf', 2: 'proj', 3: 'tech', 5: 'fp' } as Record<number, string>;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

async function started(on: string): Promise<void> {
  await hydrate();
  useProfile.setState({
    activeProgramId: PROGRAM,
    startDates: { [PROGRAM]: on },
    plans: { [PROGRAM]: PLAN },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
  });
}

describe('the block window', () => {
  it('is a fixture that starts mid-week', () => {
    // Without that the whole file passes on a rule that snaps backwards.
    expect(dayOfWeek(THURSDAY)).toBe(4);
  });

  it('begins on the Sunday after Start, not the one before it', async () => {
    await loadPrograms();
    const program = getProgram(PROGRAM)!;
    expect(blockWindow(program, THURSDAY).from).toBe(NEXT_SUNDAY);
    // And it is still twelve whole weeks, which is the point of going
    // forward rather than back.
    expect(blockWindow(program, THURSDAY).to).toBe(addDays(NEXT_SUNDAY, program.weeks * 7 - 1));
  });

  it('plans nothing on the days between Start and that Sunday', async () => {
    await loadPrograms();
    const program = getProgram(PROGRAM)!;
    for (let i = 0; i < 7; i += 1) {
      const date = addDays(THIS_SUNDAY, i);
      const day = plannedDay(program, THURSDAY, PLAN, date);
      expect(day.week, date).toBeNull();
      expect(day.sessionType, date).toBeUndefined();
      expect(day.startsOn, date).toBe(NEXT_SUNDAY);
    }
  });

  it('tells a day before the block from a day after it', async () => {
    await loadPrograms();
    const program = getProgram(PROGRAM)!;
    const before = plannedDay(program, THURSDAY, PLAN, THIS_SUNDAY);
    const after = plannedDay(program, THURSDAY, PLAN, addDays(NEXT_SUNDAY, program.weeks * 7));
    // Both have a null week and both read as rest; only one of them is a
    // block that has run its course.
    expect(before.week).toBeNull();
    expect(after.week).toBeNull();
    expect(before.over).toBeUndefined();
    expect(after.over).toBe(true);
    expect(after.startsOn).toBeUndefined();
  });

  it('starts the same day when Start is pressed on a Sunday', async () => {
    await loadPrograms();
    const program = getProgram(PROGRAM)!;
    expect(blockWindow(program, THIS_SUNDAY).from).toBe(THIS_SUNDAY);
    expect(plannedDay(program, THIS_SUNDAY, PLAN, THIS_SUNDAY).week).toBe(1);
  });
});

describe('the month a climber opens after starting', () => {
  /** The gutter cell for a week, by the Sunday it starts on. */
  const gutter = (start: string) =>
    [...document.querySelectorAll(`a[href="#/week/${start}"]`)].find((a) =>
      (a.getAttribute('aria-label') ?? '').startsWith('Week of '),
    ) ?? null;

  async function calendar() {
    renderAt('/calendar', <CalendarPage />);
    await screen.findByText('Mark days');
  }

  it('grades no week the climber was not in', async () => {
    await started(THURSDAY);
    await calendar();
    // This was "0/4": four planned sessions, three of them before the
    // climber had a program at all.
    expect(gutter(THIS_SUNDAY)).toBeNull();
  });

  it('still counts a session climbed before the block, as off-plan', async () => {
    await putSession(newSession(THURSDAY, 0, { completed: true, rpe: 7, durationMin: 60 }));
    await started(THURSDAY);
    await calendar();
    expect(gutter(THIS_SUNDAY)?.textContent).toContain('+1');
    expect(gutter(THIS_SUNDAY)?.textContent).not.toContain('/');
  });

  it('plans the first whole week in full', async () => {
    await started(THURSDAY);
    await calendar();
    // Four sessions, all of them ahead, so the gutter reads what it asks
    // for rather than what was done.
    expect(gutter(NEXT_SUNDAY)?.textContent?.trim()).toBe('4');
  });
});

describe('the front door in the gap', () => {
  it('says when the block starts rather than calling the day a rest day', async () => {
    await started(THURSDAY);
    renderAt('/', <HomePage />);
    const said = await screen.findByText(new RegExp(`starts ${shortLabel(NEXT_SUNDAY)}`));
    expect(said.textContent).toContain('Peak Performance');
    expect(document.body.textContent).not.toContain('Recovery is training');
  });

  it('says it on a day already logged, where the card is gone', async () => {
    // The climber who pressed Start on Thursday and trained that evening:
    // `PreSessionCard` is replaced once a session exists, and that is the
    // one person who most wants to know where the session went.
    await putSession(newSession(THURSDAY, 0, { completed: true, rpe: 7, durationMin: 60 }));
    await started(THURSDAY);
    renderAt('/', <HomePage />);
    await screen.findByText(/Session logged/);
    const said = await screen.findByText(new RegExp(`starts ${shortLabel(NEXT_SUNDAY)}`));
    expect(said.textContent).toContain('logged outside the block');
  });

  it('offers a session rather than a rest day the program never asked for', async () => {
    await started(THURSDAY);
    renderAt('/', <HomePage />);
    const button = await screen.findByRole('button', {
      name: /Start session|Log a session|Log rest day/,
    });
    expect(button.textContent).toBe('Log a session');
  });
});
