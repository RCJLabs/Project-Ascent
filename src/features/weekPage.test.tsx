// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { getDrill } from '@/content/drills';
import { loadPrograms } from '@/content/programs';
import { IRON_GRIP } from '@/content/programs/catalogue';
import { newSession, putSession } from '@/db/sessions';
import { TEST_REASON_LABEL } from '@/engine/assessments';
import { addDays, dayOfWeek, shortLabel, startOfWeek, today } from '@/engine/dates';
import { DELOAD_STEP } from '@/engine/plan';
import type { WeekPlan } from '@/engine/scheduler';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { HomePage } from '@/features/home/HomePage';
import { ReviewPage } from '@/features/review/ReviewPage';
import { WeekPage } from '@/features/week/WeekPage';

/**
 * The week, as a screen (PLAN.md M135).
 *
 * The program model is week-shaped and the app had a day, a month and a
 * block. These hold what the page shows of a week — the facts, the seven
 * days, the count — and the moves, which lived on the month until now and
 * were confined to a week the whole time.
 */

const TODAY = today();
const DOW = dayOfWeek(TODAY);
const SUNDAY = startOfWeek(TODAY);
const TEXT = () => document.body.textContent ?? '';
/** A block whose week `week` is the one containing today. */
const startedFor = (week: number): string => addDays(SUNDAY, -(week - 1) * 7);

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

async function running(plan: WeekPlan, week = 1, programId = 'iron_grip'): Promise<void> {
  await hydrate();
  useProfile.setState({
    activeProgramId: programId,
    startDates: { [programId]: startedFor(week) },
    plans: { [programId]: plan },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
  } as never);
}

const week = (start?: string) => renderAt(start ? `/week/${start}` : '/week', <WeekPage params={start ? { start } : {}} />);

const FP = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!.name;
const PERF = IRON_GRIP.sessionTypes.find((t) => t.id === 'perf')!.name;

describe('the seven days', () => {
  it('lists every day with what it asks, and links each to its log', async () => {
    await running({ 1: 'fp', 3: 'perf', 5: 'fp' });
    week();
    await screen.findByText('Week 1 of 12');
    expect(screen.getAllByText(FP)).toHaveLength(2);
    expect(screen.getAllByText(PERF)).toHaveLength(1);
    expect(screen.getAllByText('Rest')).toHaveLength(4);
    const links = [...document.querySelectorAll('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((h) => h.startsWith('#/log/'));
    expect(links).toEqual(Array.from({ length: 7 }, (_, i) => `#/log/${addDays(SUNDAY, i)}`));
  });

  it('says how hard each day is and roughly how long', async () => {
    await running({ 1: 'fp' });
    week();
    await screen.findByText(FP);
    expect(TEXT()).toMatch(/Hard day · about \d+/);
  });

  it('marks the day that went by empty, today, and the day that was logged', async () => {
    // Every day planned, so the week has a past, a present and a future
    // whatever today is; yesterday is missed unless today is Sunday.
    await putSession(newSession(TODAY, 0, { completed: true }));
    await running({ 0: 'fp', 1: 'perf', 2: 'fp', 3: 'perf', 4: 'fp', 5: 'perf', 6: 'fp' });
    week();
    await screen.findByText('Done');
    // None on a Sunday, which is a real day this runs on.
    expect(screen.queryAllByText('Missed')).toHaveLength(DOW);
    expect(screen.queryByText('Today')).toBeNull();
    expect(TEXT()).toContain(`1 of 7 training days done${DOW < 6 ? `, ${6 - DOW} to come` : ''}`);
  });

  it('marks the limit day, and only that one', async () => {
    // As the calendar marks it (PLAN.md M131): one mark for the hardest
    // day, not four colours for four levels.
    await running({ 1: 'perf', 3: 'fp' } as WeekPlan, 2, 'peak_performance');
    week();
    const limit = await screen.findByText('Limit day');
    expect(limit.className).toContain('text-warn');
    expect(screen.getByText('Hard day').className).not.toContain('text-warn');
  });

  it('counts what a day loads of what is hurt, and says it in full to a reader', async () => {
    // M89's fixture: Ground Zero's structural day loads an elbow three ways.
    await running({ [DOW]: 'str' } as WeekPlan, 1, 'ground_zero');
    useProfile.setState({
      injuries: [{ id: 'i1', part: 'elbow', since: TODAY, severity: 'managing', status: 'active' }],
    } as never);
    week();
    await screen.findByText('Week 1 of 12');
    expect(screen.getByText('3')).toBeTruthy();
    expect(TEXT()).toContain('3 exercises load your elbow');
    expect(TEXT()).toContain('Counts what that day loads of your elbow');
  });

  it('marks every planned day of a week that has gone by empty', async () => {
    // Last week, so the assertion does not depend on which weekday this
    // runs on — on a Sunday, this week has no yesterday.
    await running({ 1: 'fp', 3: 'perf', 5: 'fp' }, 2);
    week(addDays(SUNDAY, -7));
    await screen.findByText('Week 1 of 12');
    expect(screen.getAllByText('Missed')).toHaveLength(3);
    expect(TEXT()).toContain('0 of 3 training days done');
  });

  it('calls today today while nothing has happened on it', async () => {
    await running({ [DOW]: 'fp' } as WeekPlan);
    week();
    expect(await screen.findByText('Today')).toBeTruthy();
  });
});

describe('the week’s facts', () => {
  it('says where the block is', async () => {
    await running({ 1: 'fp' }, 6);
    week();
    await screen.findByText('Week 6 of 12');
    expect(TEXT()).toContain('Iron Grip');
    expect(TEXT()).toContain('The Hammer (Max Hangs)');
  });

  it('says what this week asks that last week did not, in the program’s words', async () => {
    const fp = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!;
    const authored = fp.blocks!.find((b) => b.name === 'Finger Protocol')!.perPhase.anvil!.perWeek!.find(
      (w) => w.week === 2,
    )!.step;
    await running({ 1: 'fp' }, 2);
    week();
    await screen.findByText('What this week asks that last week did not');
    expect(TEXT()).toContain(authored);
  });

  it('says the deload and what it took off', async () => {
    await running({ 1: 'fp' }, 4);
    week();
    await screen.findByText('Week 4 of 12');
    expect(TEXT()).toContain(DELOAD_STEP);
  });

  it('says only that it is a deload when there was nothing to take off', async () => {
    // Peak Performance deloads on week 5; a week of only limit bouldering
    // has no set to give, and a sentence about a set coming off would be
    // the fault M128 was built to end.
    await running({ 2: 'perf' }, 5, 'peak_performance');
    week();
    await screen.findByText('Week 5 of 12');
    expect(TEXT()).toContain('Deload week.');
    expect(TEXT()).not.toContain(DELOAD_STEP);
  });

  it('links the test week to the battery', async () => {
    await running({ 1: 'fp' }, 1);
    week();
    const link = (await screen.findByText(TEST_REASON_LABEL.baseline)).closest('a');
    expect(link?.getAttribute('href')).toBe('#/assessments');
  });

  it('names the drill the week carries', async () => {
    await running({ 2: 'tech' }, 1, 'gravity_defied');
    week();
    await screen.findByText('Week 1 of 12');
    const link = screen.getByRole('link', { name: getDrill('vertical_deadpoint')!.name });
    expect(link.getAttribute('href')).toBe('#/drills/vertical_deadpoint');
  });
});

describe('outside the block', () => {
  it('is the log for the week when no program is running', async () => {
    await putSession(newSession(TODAY, 0, { completed: true }));
    await hydrate();
    week();
    await screen.findByText(/No program is running/);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByText('Rearrange')).toBeNull();
    expect(screen.getByText('Find my program →').closest('a')?.getAttribute('href')).toBe('#/find');
  });

  it('says the block has not started', async () => {
    await running({ 1: 'fp' }, 0);
    week();
    await screen.findByText(/has not started yet/);
    expect(screen.queryByText('Rearrange')).toBeNull();
  });

  it('says the block has run its course', async () => {
    await running({ 1: 'fp' }, 13);
    week();
    await screen.findByText(/has run its course/);
    expect(screen.getByText('See what the block moved →').closest('a')?.getAttribute('href')).toBe('#/finish');
  });
});

describe('the weeks either side', () => {
  it('walks to the next week and the last', async () => {
    await running({ 1: 'fp' }, 2);
    week();
    await screen.findByText('Week 2 of 12');
    fireEvent.click(screen.getByLabelText('Next week'));
    await waitFor(() => expect(window.location.hash).toBe(`#/week/${addDays(SUNDAY, 7)}`));
    fireEvent.click(screen.getByLabelText('Previous week'));
    await waitFor(() => expect(window.location.hash).toBe(`#/week/${addDays(SUNDAY, -7)}`));
  });

  it('shows the week it was asked for', async () => {
    await running({ 1: 'fp' }, 2);
    week(addDays(SUNDAY, 7));
    expect(await screen.findByText('Week 3 of 12')).toBeTruthy();
  });

  it('treats junk in the address as this week', async () => {
    await running({ 1: 'fp' }, 2);
    week('nope');
    expect(await screen.findByText('Week 2 of 12')).toBeTruthy();
  });

  it('leaves a finished week as it was', async () => {
    await running({ 1: 'fp' }, 3);
    week(addDays(SUNDAY, -7));
    await screen.findByText('Week 2 of 12');
    expect(screen.queryByText('Rearrange')).toBeNull();
    expect(TEXT()).toContain('A finished week stays as it was');
  });
});

describe('moving a session', () => {
  const TARGET = (DOW + 1) % 7;
  const targetDate = addDays(SUNDAY, TARGET);

  async function pickToday(): Promise<void> {
    await running({ [DOW]: 'fp' } as WeekPlan);
    week();
    fireEvent.click(await screen.findByText('Rearrange'));
    fireEvent.click(screen.getByLabelText(`Move ${FP} from ${shortLabel(TODAY)}`));
  }

  it('offers the other days of the week as landings', async () => {
    await pickToday();
    expect(screen.getByText(`Moving ${FP}`)).toBeTruthy();
    expect(screen.getAllByLabelText(/^Move to /)).toHaveLength(6);
  });

  it('asks before it moves, and moves this week only by default', async () => {
    await pickToday();
    fireEvent.click(screen.getByLabelText(`Move to ${shortLabel(targetDate)}`));
    expect(screen.getByText(`Move to ${shortLabel(targetDate)}?`)).toBeTruthy();
    expect(screen.getByText('Nothing in the program objects to this.')).toBeTruthy();
    fireEvent.click(screen.getByText('This week only'));
    const state = useProfile.getState();
    expect(state.weekOverrides.iron_grip?.[SUNDAY]).toEqual({ [TARGET]: 'fp' });
    expect(state.plans.iron_grip).toEqual({ [DOW]: 'fp' });
    // The row moved with it, and is a door to its new day once the
    // rearranging is over.
    await waitFor(() => expect(screen.getAllByText(FP)).toHaveLength(1));
    fireEvent.click(screen.getByText('Done'));
    const row = screen.getByText(FP).closest('a');
    expect(row?.getAttribute('href')).toBe(`#/log/${targetDate}`);
  });

  it('rewrites the plan when asked to move every week', async () => {
    await pickToday();
    fireEvent.click(screen.getByLabelText(`Move to ${shortLabel(targetDate)}`));
    fireEvent.click(screen.getByText('Every week'));
    const state = useProfile.getState();
    expect(state.plans.iron_grip).toEqual({ [TARGET]: 'fp' });
    expect(state.weekOverrides.iron_grip?.[SUNDAY]).toBeUndefined();
  });

  it('calls a landing on a planned day a swap', async () => {
    await running({ [DOW]: 'fp', [TARGET]: 'perf' } as WeekPlan);
    week();
    fireEvent.click(await screen.findByText('Rearrange'));
    fireEvent.click(screen.getByLabelText(`Move ${FP} from ${shortLabel(TODAY)}`));
    fireEvent.click(screen.getByLabelText(`Move to ${shortLabel(targetDate)}`));
    expect(screen.getByText(`Swap with ${shortLabel(targetDate)}?`)).toBeTruthy();
  });

  it('says what the move would break', async () => {
    // Iron Grip wants a clear day between finger sessions; landing the
    // second one next to the first breaks that.
    const next = (DOW + 2) % 7;
    await running({ [DOW]: 'fp', [next]: 'fp' } as WeekPlan);
    week();
    fireEvent.click(await screen.findByText('Rearrange'));
    fireEvent.click(screen.getByLabelText(`Move ${FP} from ${shortLabel(addDays(SUNDAY, next))}`));
    fireEvent.click(screen.getByLabelText(`Move to ${shortLabel(targetDate)}`));
    expect(screen.queryByText('Nothing in the program objects to this.')).toBeNull();
    expect(document.querySelectorAll('li svg.text-danger, li svg.text-warn').length).toBeGreaterThan(0);
  });

  it('does not land on a day already logged', async () => {
    // Not a disabled button: a control a screen reader hears and cannot
    // use is worse than none.
    await putSession(newSession(targetDate, 0, { completed: true }));
    await pickToday();
    expect(screen.queryByLabelText(`Move to ${shortLabel(targetDate)}`)).toBeNull();
    expect(screen.getAllByLabelText(/^Move to /)).toHaveLength(5);
  });

  it('does not pick up a day already logged', async () => {
    await putSession(newSession(TODAY, 0, { completed: true }));
    await running({ [DOW]: 'fp', [TARGET]: 'perf' } as WeekPlan);
    week();
    fireEvent.click(await screen.findByText('Rearrange'));
    expect(screen.queryByLabelText(`Move ${FP} from ${shortLabel(TODAY)}`)).toBeNull();
    expect(screen.getByLabelText(`Move ${PERF} from ${shortLabel(targetDate)}`)).toBeTruthy();
  });

  it('can be cancelled at every step', async () => {
    await pickToday();
    fireEvent.click(screen.getByLabelText('Cancel move'));
    expect(screen.queryByText(`Moving ${FP}`)).toBeNull();
    fireEvent.click(screen.getByLabelText(`Move ${FP} from ${shortLabel(TODAY)}`));
    fireEvent.click(screen.getByLabelText(`Move to ${shortLabel(targetDate)}`));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/Move to .*\?/)).toBeNull();
    expect(useProfile.getState().weekOverrides.iron_grip ?? {}).toEqual({});
    fireEvent.click(screen.getByLabelText('Cancel move'));
    fireEvent.click(screen.getByText('Done'));
    expect(screen.getByText('Rearrange')).toBeTruthy();
  });
});

describe('the doors', () => {
  it('is the card on Home, with where the week stands', async () => {
    await putSession(newSession(TODAY, 0, { completed: true }));
    await running({ [DOW]: 'fp', [(DOW + 1) % 7]: 'perf' } as WeekPlan, 6);
    renderAt('/', <HomePage />);
    const heading = await screen.findByRole('heading', { name: 'Your week', level: 2 });
    const card = heading.closest('section')!;
    expect(card.textContent).toContain('Week 6 of 12');
    expect(card.textContent).toContain('1 of 2 training days done');
    expect(card.querySelector('a[href="#/week"]')).toBeTruthy();
    expect(card.querySelector('a[href="#/calendar"]')).toBeTruthy();
  });

  it('names the limit day still to come on Home', async () => {
    // Today, so the day is still to come whatever weekday this runs on.
    await running({ [DOW]: 'perf' } as WeekPlan, 2, 'peak_performance');
    renderAt('/', <HomePage />);
    await screen.findByRole('heading', { name: 'Your week', level: 2 });
    const name = new Date(2026, 0, 4 + DOW).toLocaleDateString(undefined, { weekday: 'long' });
    expect(TEXT()).toContain(`Limit day ${name}`);
  });

  it('stops naming the limit day once it has been logged', async () => {
    await putSession(newSession(TODAY, 0, { completed: true }));
    await running({ [DOW]: 'perf' } as WeekPlan, 2, 'peak_performance');
    renderAt('/', <HomePage />);
    await screen.findByRole('heading', { name: 'Your week', level: 2 });
    expect(TEXT()).not.toContain('Limit day');
  });

  it('is a link on the calendar, which no longer moves sessions itself', async () => {
    await running({ 1: 'fp' });
    renderAt('/calendar', <CalendarPage />);
    await screen.findByText('Mark days');
    expect(screen.queryByText('Rearrange')).toBeNull();
    expect(screen.getByText('Week').closest('a')?.getAttribute('href')).toBe(`#/week/${TODAY}`);
    // Another month opens the week that month begins in.
    fireEvent.click(screen.getByLabelText('Next month'));
    const now = new Date(`${TODAY}T00:00`);
    const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const key = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
    expect(screen.getByText('Week').closest('a')?.getAttribute('href')).toBe(`#/week/${key}`);
  });

  it('is a link under the review’s week ahead', async () => {
    await running({ 1: 'fp' });
    renderAt('/review', <ReviewPage />);
    const link = await screen.findByText('Open the week →');
    expect(link.closest('a')?.getAttribute('href')).toBe(`#/week/${addDays(SUNDAY, 7)}`);
  });
});
