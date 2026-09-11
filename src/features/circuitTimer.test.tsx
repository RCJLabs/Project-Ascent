// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { getSession, newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { LogPage } from '@/features/log/LogPage';

/**
 * The clock reaches the circuits (PLAN.md M99).
 *
 * Base Camp's Engine Room declares `circuit: { rounds: '2', work: '40-60s',
 * restBetween: '20s' }` over a nine-exercise menu you pick five from. Until
 * now the logger printed "Pick 5 of 9 · 40-60s each · 2 rounds" and counted
 * none of it, because `timer.ts` expanded a `Protocol` and only a `Protocol`.
 */

const DATE = today();
const START = addDays(DATE, -7);
const BLOCK = 'Core Circuit';

async function engineRoom(exercises: { name: string }[] = []): Promise<void> {
  await reset();
  const program = getProgram('base_camp')!;
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: program.id,
    sessionTypeId: 'eng',
    ...(exercises.length ? { exercises } : {}),
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: START },
    plans: { [program.id]: {} },
    weekOverrides: {},
    adaptations: {},
  });
  renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
}

/** Three of the nine on Base Camp's core menu. */
const PICKED = [{ name: 'Plank' }, { name: 'Knee Raise' }, { name: 'Dead Bugs' }];

describe('running an authored circuit', () => {
  it('renders the block, and the prescription line it always had', async () => {
    await engineRoom();
    expect(screen.getByText(BLOCK)).toBeTruthy();
    expect(screen.getByText(/2 rounds/)).toBeTruthy();
  });

  // Twelve of the seventeen circuits are menus, so which of the nine you are
  // doing is the climber's choice. The tick is the pick.
  it('asks for the pick before it will run anything', async () => {
    await engineRoom();
    expect(screen.queryByText('Run the circuit')).toBeNull();
    expect(screen.getByText(/Tick the exercises you are doing/)).toBeTruthy();
  });

  it('offers the clock once exercises are ticked', async () => {
    await engineRoom(PICKED);
    expect(screen.getByText('Run the circuit')).toBeTruthy();
    expect(screen.queryByText(/Tick the exercises you are doing/)).toBeNull();
  });

  it('opens a timer over exactly what was ticked', async () => {
    await engineRoom(PICKED);
    fireEvent.click(screen.getByText('Run the circuit'));
    expect(screen.getByRole('dialog', { name: `${BLOCK} timer` })).toBeTruthy();
    expect(screen.getByText('3 exercises')).toBeTruthy();
  });

  // Rounds, not sets: the word follows what is being timed.
  it('counts in rounds and names the exercise it is on', async () => {
    await engineRoom(PICKED);
    fireEvent.click(screen.getByText('Run the circuit'));
    // Before the clock starts it sits on the prepare segment; skipping
    // forward lands on the first work phase.
    fireEvent.click(screen.getByLabelText('Skip segment'));
    // Scoped to the sheet: the menu behind it names Plank too.
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByText('Round 1 of 2')).toBeTruthy();
    expect(sheet.getByText('Plank')).toBeTruthy();
    expect(sheet.queryByText(/rep 1 of/)).toBeNull();
  });

  it('says what is next during the rest, which is what a climber standing up needs', async () => {
    await engineRoom(PICKED);
    fireEvent.click(screen.getByText('Run the circuit'));
    fireEvent.click(screen.getByLabelText('Skip segment'));
    fireEvent.click(screen.getByLabelText('Skip segment'));
    expect(within(screen.getByRole('dialog')).getByText('Next: Knee Raise')).toBeTruthy();
  });

  /**
   * Finishing a circuit ticks nothing new.
   *
   * The exercises it ran are the ones already ticked — that is how it knew
   * which of the nine to count — so a completion that added a row would
   * invent an exercise called "Core Circuit" that nobody did.
   */
  it('adds nothing to the log when it finishes', async () => {
    await engineRoom(PICKED);
    fireEvent.click(screen.getByText('Run the circuit'));
    fireEvent.click(screen.getByLabelText('Start'));
    // prepare + (3 work + 2 rest) x 2 rounds, with no rest between rounds.
    for (let i = 0; i < 12; i += 1) {
      const skip = screen.queryByLabelText('Skip segment') as HTMLButtonElement | null;
      if (!skip || skip.disabled) break;
      fireEvent.click(skip);
    }
    expect(screen.getByText('Done')).toBeTruthy();
    await waitFor(async () =>
      expect((await getSession(`${DATE}#0`))?.exercises?.map((e) => e.name)).toEqual([
        'Plank',
        'Knee Raise',
        'Dead Bugs',
      ]),
    );
  });

  it('closes without leaving the sheet behind', async () => {
    await engineRoom(PICKED);
    fireEvent.click(screen.getByText('Run the circuit'));
    fireEvent.click(screen.getByLabelText('Close timer'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a circuit the clock cannot read', () => {
  /** Ground Zero's core pillar: three rounds, a round rest, and no work time. */
  async function groundZero(): Promise<void> {
    await reset();
    const program = getProgram('ground_zero')!;
    await putSession({
      ...newSession(DATE, 0, { completed: false }),
      programId: program.id,
      sessionTypeId: 'mob',
      exercises: [{ name: 'Dead Bug' }],
    } as never);
    await hydrate();
    useProfile.setState({
      activeProgramId: program.id,
      startDates: { [program.id]: START },
      plans: { [program.id]: {} },
      weekOverrides: {},
      adaptations: {},
    });
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
  }

  // A guessed duration would be the `heightFromLabel` mistake: it is better
  // to say the clock does not know than to invent a number the program
  // never gave.
  it('says why rather than inventing a duration', async () => {
    await groundZero();
    expect(screen.getByText(/counted in reps rather than timed/)).toBeTruthy();
    expect(screen.queryByText('Run the circuit')).toBeNull();
  });
});
