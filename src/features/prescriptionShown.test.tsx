// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { newSession, putSession } from '@/db/sessions';
import { addDays, dayOfWeek, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from '@/features/log/LogPage';
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
  renderAt('/', <DayBody date={DATE} />);
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

/**
 * A dose that moves inside the phase (PLAN.md M127).
 *
 * The logger asked `prescriptionFor` for a phase and never a week, so four
 * weeks of The Anvil showed one identical card. It passes the day's week
 * now, and Iron Grip's finger protocol is the block whose own phase goal
 * asks for weekly progression.
 */
describe('what this week asks that last week did not', () => {
  /** The dose renders joined — '5 sets · 10s · 85-90%…' — so it is read
   *  off the container rather than looked up as its own element. */
  const doses = () => document.body.textContent ?? '';

  async function inWeek(week: number): Promise<void> {
    await reset();
    const program = getProgram('iron_grip')!;
    const start = addDays(startOfWeek(DATE), -(week - 1) * 7);
    await hydrate();
    useProfile.setState({
      activeProgramId: program.id,
      startDates: { [program.id]: start },
      plans: { [program.id]: { [dayOfWeek(DATE)]: 'fp' } },
      weekOverrides: {},
      adaptations: {},
      injuries: [],
    });
    renderAt('/', <DayBody date={DATE} />);
    fireEvent.click(await screen.findByRole('button', { name: /Start session|Log a session|Log rest day/ }));
    await screen.findByText("Today's prescription");
  }

  it('says nothing on the first week of a phase, because there is nothing to say', async () => {
    await inWeek(1);
    expect(screen.queryByText(/volume ramp/i)).toBeNull();
    expect(doses()).toMatch(/3-5 sets/);
  });

  it('shows the step on a week that has one', async () => {
    await inWeek(3);
    expect(screen.getByText(/The top of the volume ramp/)).toBeTruthy();
  });

  it('shows the dose that week moved to, not the phase it opened at', async () => {
    await inWeek(3);
    // Five sets, where week 1 prescribes 3-5.
    expect(doses()).toMatch(/(^|[^-])5 sets/);
    expect(doses()).not.toMatch(/3-5 sets/);
  });

  it('lightens a deload week rather than only labelling it', async () => {
    // Iron Grip deloads on week 4. The finger protocol wrote its own; every
    // other block of the session is lightened by the rule (PLAN.md M128).
    await inWeek(4);
    expect(screen.getByText(/Deload\. Three sets on the same edge/)).toBeTruthy();
    // Said once for the session, however many blocks the rule touched.
    expect(screen.getAllByText(/A set comes off where there is one to give/)).toHaveLength(1);
    // Pull is 3 sets every other week of The Anvil.
    expect(doses()).toMatch(/2 sets · 8-10/);
  });

  it('carries a step that moves no number at all', async () => {
    // Half of what a program says about progression is a rule about the
    // climber, and the app must be able to pass it on without inventing a
    // figure to hang it from.
    await inWeek(2);
    expect(screen.getByText(/Add one increment if every set held to the last rep/)).toBeTruthy();
    expect(doses()).toMatch(/3-5 sets/);
  });
});

describe('the ladder on the program page', () => {
  function ironGrip(): void {
    renderAt('/train/iron_grip', <ProgramDetailPage params={{ id: 'iron_grip' }} />);
    fireEvent.click(screen.getByRole('button', { name: /What's in it/ }));
  }

  it('shows how the dose moves inside the phase', () => {
    ironGrip();
    // Several blocks carry one now: the finger protocol authored its weeks,
    // and every other block of the session has a derived deload row.
    expect(screen.getAllByText('How it moves').length).toBeGreaterThan(0);
    expect(screen.getByText(/The top of the volume ramp/)).toBeTruthy();
  });

  it('does not stutter the word beside a step that already says it', () => {
    // "Deload Deload. Three sets on the same edge" — the marker and the
    // sentence saying the same thing, found in the browser.
    ironGrip();
    expect(screen.queryByText(/DeloadDeload|Deload Deload/)).toBeNull();
  });

  it('shows a deload week the block never wrote down', () => {
    // Iron Grip deloads on weeks 4 and 8 and its Pull block says nothing
    // about either; before M128 the only sign of one on this page was a
    // marker in the drill list.
    ironGrip();
    expect(screen.getAllByText(/A set comes off where there is one to give/).length).toBeGreaterThan(0);
  });

  it('numbers the weeks the way a climber counts them', () => {
    // The author writes "week 3 of this phase"; the climber reads "week 3"
    // in The Anvil and "week 7" in The Hammer, and the page is for them.
    ironGrip();
    expect(screen.getByText('Wk 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Weeks 5-8/ }));
    expect(screen.getByText('Wk 7')).toBeTruthy();
    expect(screen.queryByText('Wk 3')).toBeNull();
  });

  it('says nothing in a phase that runs one dose the whole way', () => {
    // Ground Zero deloads on week 8 only, so its first phase has no week
    // that moves and nothing to say about one.
    renderAt('/train/ground_zero', <ProgramDetailPage params={{ id: 'ground_zero' }} />);
    fireEvent.click(screen.getByRole('button', { name: /What's in it/ }));
    expect(screen.queryByText('How it moves')).toBeNull();
  });
});

describe('a block whose dose never moves', () => {
  function programPage(): void {
    renderAt('/train/the_cruiser', <ProgramDetailPage params={{ id: 'the_cruiser' }} />);
    // The week-by-week is behind What's in it (PLAN.md M121).
    fireEvent.click(screen.getByRole('button', { name: /What's in it/ }));
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
