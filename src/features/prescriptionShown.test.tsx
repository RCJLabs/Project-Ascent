// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { newSession, putSession } from '@/db/sessions';
import { dayOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { LogPage } from '@/features/log/LogPage';
import { ProgramDetailPage } from '@/features/train/ProgramDetailPage';

/**
 * What a block asks of you, not just what is in it (PLAN.md M90).
 *
 * `prescriptionFor` hands the logger the whole prescription — the selection
 * rule, the pick advice, the circuit format — and the logger rendered only
 * the exercise list. Across the catalogue that is twenty-nine prescriptions
 * showing a menu as a checklist; The Cruiser's technique block put six cues
 * on screen where the program asks for one, so a climber doing the screen
 * was doing six times the session.
 */

const DATE = today();

async function logging(programId: string, typeId: string): Promise<void> {
  await reset();
  const program = getProgram(programId)!;
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: program.id,
    sessionTypeId: typeId,
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: DATE },
    plans: { [program.id]: { [dayOfWeek(DATE)]: typeId } },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
  });
  renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
}

describe('a menu, in the logger', () => {
  it('says how many of the list to do', async () => {
    await logging('the_cruiser', 'vol');
    expect(screen.getByText('Pick 1 of 6')).toBeTruthy();
  });

  // Six cues are on screen either way. The difference between a menu and a
  // checklist is one line of text.
  it('still shows the whole menu to choose from', async () => {
    await logging('the_cruiser', 'vol');
    for (const cue of ['Quiet Feet', 'Straight Arms', 'Flagging']) {
      expect(screen.getByText(cue)).toBeTruthy();
    }
  });

  it('passes on how to choose', async () => {
    await logging('the_cruiser', 'vol');
    expect(screen.getByText('Rotate the focus across sessions.')).toBeTruthy();
  });

  // A line saying nothing makes the ones that mean something ordinary.
  it('says nothing about a block that is simply its list', async () => {
    await logging('iron_grip', 'fp');
    expect(screen.queryByText(/^Pick \d+ of/)).toBeNull();
  });
});

describe('a block whose dose never moves', () => {
  function programPage(): void {
    renderAt('/train/the_cruiser', <ProgramDetailPage params={{ id: 'the_cruiser' }} />);
  }

  it('says so, instead of leaving it to read as an oversight', () => {
    programPage();
    expect(screen.getAllByText(/Unchanged by design/).length).toBeGreaterThan(0);
  });

  it('gives the reason the dose is flat', () => {
    programPage();
    expect(screen.getByText(/intensity is not something a sets-and-reps field can carry/)).toBeTruthy();
  });

  /**
   * The pick advice is the thing that *does* move across the phases of
   * these blocks, and the page dropped it — so the explanation for the flat
   * dose pointed at a field the page was throwing away.
   */
  it('shows the pick advice that changes when the dose does not', () => {
    programPage();
    expect(screen.getByText('Rotate the focus across sessions.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Weeks 9-12/ }));
    expect(screen.getByText('Keep the session short and genuinely easy.')).toBeTruthy();
    expect(screen.queryByText('Rotate the focus across sessions.')).toBeNull();
  });
});
