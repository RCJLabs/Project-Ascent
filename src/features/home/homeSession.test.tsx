// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { dayOfWeek, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { HomePage } from './HomePage';

/**
 * Home is the session (PLAN.md M117).
 *
 * The front door used to summarise the day and link to the logger; now it
 * is the logger, and the one big button on it has to do the right thing
 * for each kind of day. These drive it from the outside: what the button
 * says, and what exists in the store after it is pressed.
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
    startDates: { [PROGRAM]: TODAY },
    plans: { [PROGRAM]: plan },
    weekOverrides: {},
    adaptations: {},
  });
}

const button = () => screen.findByRole('button', { name: /Start session|Log a session|Log rest day/ });

describe('the one big button', () => {
  it('starts the planned session on a training day', async () => {
    await running({ [DOW]: 'tech' });
    renderAt('/', <HomePage />);
    const start = await button();
    expect(start.textContent).toBe('Start session');
    expect(screen.getByText(typeName('tech'))).toBeTruthy();
    expect(screen.getByText(/Week 1 of/)).toBeTruthy();
    fireEvent.click(start);
    await waitFor(() => expect(useSessions.getState().byDate[TODAY]?.[0]?.sessionTypeId).toBe('tech'));
    // The card is gone and the editor is up.
    await screen.findByText('Effort', { selector: 'h2' });
    expect(screen.queryByRole('button', { name: 'Start session' })).toBeNull();
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
    await screen.findByText('Recovery checklist', { selector: 'h2' });
    expect(useSessions.getState().byDate[TODAY]?.[0]?.sessionTypeId).toBe('rest');
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
    await screen.findByText('Recovery checklist', { selector: 'h2' });
    expect(useSessions.getState().byDate[TODAY]?.[0]?.sessionTypeId).toBe('rest');
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
