// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { newSession, putSession } from '@/db/sessions';
import { dayOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { HomePage } from './HomePage';

/**
 * What Home is, in order (PLAN.md M124).
 *
 * From M117 to M123 Home was the logger: the editor rendered in place, and
 * the coach, the week and the block sat under a card that grew with the
 * session. Now the app's reading comes first, the day's card and its two
 * buttons come under it, and the editor is a page again.
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

const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const logButton = () =>
  screen.findByRole('button', { name: /Start session|Log a session|Log rest day/ });

describe('the order of the front door', () => {
  it('puts the coach, the week and the block above the log buttons', async () => {
    await running();
    renderAt('/', <HomePage />);
    const start = await logButton();
    const coach = screen.getByText("Coach's Corner");
    const review = screen.getByText(/Nothing logged this week|logged this week/);
    const program = screen.getByRole('heading', { name: 'Your week', level: 2 });
    expect(before(coach, start), 'the coach is under the buttons').toBe(true);
    expect(before(review, start), 'the review is under the buttons').toBe(true);
    expect(before(program, start), 'the program is under the buttons').toBe(true);
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
