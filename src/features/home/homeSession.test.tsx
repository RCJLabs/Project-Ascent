// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { dayOfWeek, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { openedViewFor } from '@/lib/openedView';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { HomePage } from './HomePage';

/**
 * Home's card for today, and the two buttons on it (PLAN.md M117, M124).
 *
 * The button logic is M117's and has not changed: what it says, and which
 * session type it creates, for each kind of day. What changed in M124 is
 * where it leaves you — the editor is at `/log/<date>` again, so the
 * button starts the session *and* opens it, and Home goes back to showing
 * a line about where the session got to.
 *
 * Driven from the outside: the label, the record in the store, and the
 * address the app ends up at.
 */

const PROGRAM = 'gravity_defied';
const TODAY = today();
const DOW = dayOfWeek(TODAY);
const gd = () => getProgram(PROGRAM)!;
const typeName = (id: string) => gd().sessionTypes.find((t) => t.id === id)!.name;

async function running(plan: Record<number, string>): Promise<void> {
  await reset();
  await hydrate();
  useProfile.setState({
    activeProgramId: PROGRAM,
    startDates: { [PROGRAM]: startOfWeek(TODAY) },
    plans: { [PROGRAM]: plan },
    weekOverrides: {},
    adaptations: {},
  });
}

const button = () => screen.findByRole('button', { name: /Start session|Log a session|Log rest day/ });

describe('the one big button', () => {
  it('starts the planned session on a training day, and opens it', async () => {
    await running({ [DOW]: 'tech' });
    renderAt('/', <HomePage />);
    const start = await button();
    expect(start.textContent).toBe('Start session');
    expect(screen.getByText(typeName('tech'))).toBeTruthy();
    // Twice since M135: the day's card and the week's card both say it.
    expect(screen.getAllByText(/Week 1 of/).length).toBeGreaterThan(0);
    fireEvent.click(start);
    // The hash settles last: `start()` writes the session and the
    // navigation is what follows it, so waiting on the store alone races
    // the thing being asserted.
    await waitFor(() => expect(window.location.hash).toBe(`#/log/${TODAY}`));
    expect(useSessions.getState().byDate[TODAY]?.[0]?.sessionTypeId).toBe('tech');
    // The card is gone, and the app is at the log rather than showing it
    // on the front door.
    await screen.findByText(/Session started/);
    expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
  });

  it('opens the whole log, or the quick view, as the button says', async () => {
    // The M120 fold, chosen before arriving rather than after — and since
    // M297 chosen for *this session*, which is what the button names.
    // The stored preference is the fold's own business.
    await running({ [DOW]: 'tech' });
    useSettings.setState({ logView: 'full' });
    renderAt('/', <HomePage />);
    fireEvent.click(await screen.findByRole('button', { name: /Quick log/ }));
    await waitFor(() => expect(window.location.hash).toBe(`#/log/${TODAY}`));
    expect(openedViewFor(TODAY)).toBe('quick');
    expect(useSettings.getState().logView, 'Quick log rewrote the preference').toBe('full');

    await running({ [DOW]: 'tech' });
    useSettings.setState({ logView: 'quick' });
    renderAt('/', <HomePage />);
    fireEvent.click(await button());
    await waitFor(() => expect(openedViewFor(TODAY)).toBe('full'));
    expect(useSettings.getState().logView).toBe('quick');
  });

  it('logs the rest on a day the plan marks as rest', async () => {
    await running({ [DOW]: 'rest' });
    renderAt('/', <HomePage />);
    const rest = await button();
    expect(rest.textContent).toBe('Log rest day');
    // The rest type is the button; it is not also a chip.
    const chips = screen.getByText('Or a different session').parentElement!;
    expect(chips.textContent).not.toContain(typeName('rest'));
    expect(chips.textContent).toContain(typeName('tech'));
    fireEvent.click(rest);
    await waitFor(() => expect(useSessions.getState().byDate[TODAY]?.[0]?.sessionTypeId).toBe('rest'));
  });

  it('logs the rest on a day the plan leaves empty, too', async () => {
    // Nothing placed today. The card calls that a rest day, so the button
    // has to agree: it starts the program's rest type, and the chips offer
    // the training days instead.
    await running({});
    renderAt('/', <HomePage />);
    const rest = await button();
    expect(rest.textContent).toBe('Log rest day');
    const chips = screen.getByText('Or a different session').parentElement!;
    expect(chips.textContent).not.toContain(typeName('rest'));
    expect(chips.textContent).toContain(typeName('tech'));
    fireEvent.click(rest);
    await waitFor(() => expect(useSessions.getState().byDate[TODAY]?.[0]?.sessionTypeId).toBe('rest'));
  });

  it('starts the session a chip names, not the planned one', async () => {
    await running({ [DOW]: 'tech' });
    renderAt('/', <HomePage />);
    await button();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(typeName('perf')) }));
    await waitFor(() => expect(window.location.hash).toBe(`#/log/${TODAY}`));
    expect(useSessions.getState().byDate[TODAY]?.[0]?.sessionTypeId).toBe('perf');
  });

  it('offers a plain session once the block has run out', async () => {
    // `over` sets `isRest`; without the check the empty-day rule above
    // would log a rest day from a block that ended weeks ago.
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
    const log = await button();
    expect(log.textContent).toBe('Log a session');
    expect(screen.getByText(/has run its course/)).toBeTruthy();
  });

  it('follows a week rearranged while the page is open', async () => {
    // `usePlannedDay` memoises on the overrides; the logger's own copy of
    // this derivation left them out, and a day moved on the calendar did
    // not reach an already-open log.
    await running({ [DOW]: 'tech' });
    renderAt('/', <HomePage />);
    await button();
    expect(screen.getByText(typeName('tech'))).toBeTruthy();
    useProfile.setState({ weekOverrides: { [PROGRAM]: { [startOfWeek(TODAY)]: { [DOW]: 'perf' } } } });
    await screen.findByText(typeName('perf'));
    expect(screen.queryByText(typeName('tech'))).toBeNull();
  });
});
