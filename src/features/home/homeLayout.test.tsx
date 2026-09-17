// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { newSession, putSession } from '@/db/sessions';
import { addDays, dayOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { HomePage } from './HomePage';

/**
 * What Home is, in order (PLAN.md M124, reordered by M239).
 *
 * From M117 to M123 Home was the logger: the editor rendered in place, and
 * the coach, the week and the block sat under a card that grew with the
 * session. M124 put the app's reading first and the day's card under it.
 *
 * **M239 turned the middle of that around, and M124 was half right.** The
 * reading did belong above the button; four cards of it did not. Measured on
 * a 430×932 phone, the whole of Home above the button was commentary and the
 * button itself sat at the bottom edge of the viewport. Now: the numbers,
 * the button, and *then* what the app has to say.
 *
 * The order is the feature, so it is asserted as an order — by document
 * position, not by whether the pieces exist.
 */

const PROGRAM = 'gravity_defied';
const TODAY = today();
const DOW = dayOfWeek(TODAY);

async function running(): Promise<void> {
  await reset();
  await hydrate();
  useProfile.setState({
    activeProgramId: PROGRAM,
    startDates: { [PROGRAM]: TODAY },
    plans: { [PROGRAM]: { [DOW]: 'tech' } },
    weekOverrides: {},
    adaptations: {},
  });
}

/** The same, with a log behind it: the numbers card draws nothing without one. */
async function trained(): Promise<void> {
  await reset();
  for (let d = 1; d <= 20; d += 2) {
    const date = addDays(TODAY, -d);
    await putSession({
      ...newSession(date, 0, { completed: true }),
      rpe: 7,
      durationMin: 75,
      climbs: [{ id: `c${d}`, grade: 'V4', scale: 'V', count: 3, result: 'send' }],
    } as never);
  }
  await hydrate();
  useProfile.setState({
    activeProgramId: PROGRAM,
    startDates: { [PROGRAM]: TODAY },
    plans: { [PROGRAM]: { [DOW]: 'tech' } },
    weekOverrides: {},
    adaptations: {},
  });
}

const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const logButton = () =>
  screen.findByRole('button', { name: /Start session|Log a session|Log rest day/ });

describe('the order of the front door', () => {
  /**
   * The milestone, as an order. The numbers are what the screen opens on,
   * the button is the second thing, and everything the app has to *say*
   * comes after both — because a climber opening the app at the gym is
   * there to log, not to read.
   */
  it('puts the numbers, then the button, then what the app has to say', async () => {
    await trained();
    renderAt('/', <HomePage />);
    const start = await logButton();
    // Awaited, not queried: both cards cross a lazy boundary.
    const numbers = await screen.findByText('Climbed so far');
    const coach = await screen.findByText("Coach's Corner");
    const task = screen.getByRole('heading', { name: 'Today\u2019s task', level: 2 });
    expect(before(numbers, start), 'the numbers are under the button').toBe(true);
    expect(before(start, coach), 'the coach is above the button').toBe(true);
    expect(before(start, task), 'the daily task is above the button').toBe(true);
    // The week is in the heading since M241, above everything.
    const heading = screen.getByRole('heading', { level: 1 });
    expect(before(heading, numbers), 'the date is under the numbers').toBe(true);
  });

  /**
   * And the one that was taken off it. The week note's own headline and the
   * line beneath it can be the same sentence — *"2 of 4 sessions"* over
   * *"2 of 4 sessions · 8 sends this week"* — with *Your week* under that
   * saying it a third time. It reads from Progress now.
   */
  it('does not carry the week note as well as the week', async () => {
    await trained();
    renderAt('/', <HomePage />);
    await logButton();
    expect(screen.queryAllByRole('link').filter((a) => a.getAttribute('href') === '#/review')).toEqual([]);
  });

  /**
   * A climber who has logged nothing has no numbers, and three zeroes under
   * a zero would be the app's first impression of them. The cards asking
   * them to log something are still there.
   */
  it('shows no numbers at all until there is something to count', async () => {
    await running();
    renderAt('/', <HomePage />);
    await logButton();
    expect(screen.queryByText('Climbed so far')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Before you train', level: 2 })).toBeTruthy();
  });

  it('keeps the first-run cards under the log buttons', async () => {
    // M123 put them under the session for the same reason M124 keeps them
    // under the buttons: they are the first week of the app's life, the
    // button is every day of it.
    await running();
    renderAt('/', <HomePage />);
    const start = await logButton();
    expect(before(start, screen.getByRole('heading', { name: 'Before you train', level: 2 }))).toBe(true);
  });

  it('carries the week nudges, so a finished block is visible without opening the log', async () => {
    await reset();
    await hydrate();
    useProfile.setState({
      activeProgramId: PROGRAM,
      startDates: { [PROGRAM]: '2025-01-06' },
      plans: { [PROGRAM]: { [DOW]: 'tech' } },
      weekOverrides: {},
      adaptations: {},
    });
    renderAt('/', <HomePage />);
    await logButton();
    const link = screen.getByText(/what the block moved/i).closest('a');
    expect(link?.getAttribute('href')).toBe('#/finish');
  });
});

describe('the two buttons', () => {
  it('offers the whole log and the quick view side by side', async () => {
    await running();
    renderAt('/', <HomePage />);
    await logButton();
    expect(screen.getByRole('button', { name: /Quick log/ })).toBeTruthy();
  });

  it('opens the log in the view the button names', async () => {
    await running();
    useSettings.setState({ logView: 'full' });
    renderAt('/', <HomePage />);
    fireEvent.click(await screen.findByRole('button', { name: /Quick log/ }));
    await waitFor(() => expect(window.location.hash).toBe(`#/log/${TODAY}`));
    expect(useSettings.getState().logView).toBe('quick');
  });
});

describe('once a session exists', () => {
  async function withSession(completed: boolean): Promise<void> {
    await reset();
    const program = getProgram(PROGRAM)!;
    await putSession({
      ...newSession(TODAY, 0, { completed }),
      programId: program.id,
      sessionTypeId: 'tech',
      climbs: [
        { id: 'c1', grade: 'V4', scale: 'V', count: 3, result: 'send' },
        { id: 'c2', grade: 'V6', scale: 'V', count: 2, result: 'attempt' },
      ],
    } as never);
    await hydrate();
    useProfile.setState({
      activeProgramId: program.id,
      startDates: { [program.id]: TODAY },
      plans: { [program.id]: { [DOW]: 'tech' } },
      weekOverrides: {},
      adaptations: {},
    });
  }

  it('says where it got to rather than rendering the editor', async () => {
    await withSession(false);
    renderAt('/', <HomePage />);
    await screen.findByText(/Session started · 5 climbs, 3 sent/);
    // The editor's own headings are not on the front door any more.
    expect(screen.queryByText('Effort', { selector: 'h2' })).toBeNull();
    expect(screen.queryByText(/Add another session today/)).toBeNull();
  });

  it('says so when the session is finished', async () => {
    await withSession(true);
    renderAt('/', <HomePage />);
    await screen.findByText(/Session logged/);
  });

  it('offers one way in, and it is the quick view', async () => {
    // Two buttons shipped in M124 — *Open the log* beside *Quick log* —
    // and the pair asked a question with no interesting answer. A session
    // you are coming back to is one you are adding climbs to.
    await withSession(false);
    renderAt('/', <HomePage />);
    await screen.findByText(/Session started/);
    const buttons = screen
      .getAllByRole('button')
      .filter((b) => /Quick log|Open the log|Continue session|Start session/.test(b.textContent ?? ''));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Quick log']);
  });

  it('says nothing about climbs before any are entered', async () => {
    await reset();
    await putSession({ ...newSession(TODAY, 0, { completed: false }), climbs: [] } as never);
    await hydrate();
    renderAt('/', <HomePage />);
    await screen.findByText(/no climbs entered yet/);
  });

  it('opens the log in the quick view', async () => {
    await withSession(false);
    useSettings.setState({ logView: 'full' });
    renderAt('/', <HomePage />);
    await screen.findByText(/Session started/);
    fireEvent.click(screen.getByRole('button', { name: /Quick log/ }));
    await waitFor(() => expect(window.location.hash).toBe(`#/log/${TODAY}`));
    expect(useSettings.getState().logView).toBe('quick');
  });

  it('counts a second session on the same day', async () => {
    await withSession(false);
    await putSession({ ...newSession(TODAY, 1, { completed: false }), climbs: [] } as never);
    await hydrate();
    renderAt('/', <HomePage />);
    await screen.findByText(/2 sessions today/);
  });
});
