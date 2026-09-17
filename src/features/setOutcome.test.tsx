// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { getSession, newSession, putSession } from '@/db/sessions';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from '@/features/log/LogPage';

/**
 * How the sets went, in the logger (PLAN.md M238).
 *
 * Same fixture as `exerciseNumbers.test.tsx`, and for the same reason: Iron
 * Grip's Hammer phase is where the catalogue's conditional steps live —
 * *"Add one increment if all five hangs held the full ten seconds in half
 * crimp last week"* — and until this milestone there was no field in the app
 * that could answer it.
 */

const DATE = today();
/** Four weeks in, which is the Hammer phase (weeks 5-8). */
const START = startOfWeek(addDays(DATE, -28));
const HANG = 'Max Hangs';

function hangDay() {
  const program = getProgram('iron_grip')!;
  const type = program.sessionTypes.find((t) =>
    (t.blocks ?? []).some((b) =>
      Object.values(b.perPhase).some((p) => p.exercises.some((e) => e.name === HANG)),
    ),
  )!;
  return { programId: program.id, sessionTypeId: type.id, program };
}

async function open(entry: Record<string, unknown> | null, history?: Record<string, unknown>) {
  await reset();
  const { programId, sessionTypeId, program } = hangDay();
  if (history !== undefined) {
    await putSession({
      ...newSession(addDays(DATE, -7), 0, { completed: true }),
      exercises: [{ name: HANG, ...history }],
    } as never);
  }
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId,
    sessionTypeId,
    ...(entry === null ? {} : { exercises: [{ name: HANG, ...entry }] }),
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: START },
    plans: { [program.id]: {} },
    weekOverrides: {},
    adaptations: {},
  });
  useSettings.setState({ units: 'imperial' });
  renderAt('/', <DayBody date={DATE} />);
  await screen.findByText(HANG);
}

const stored = async () => (await getSession(`${DATE}#0`))?.exercises?.[0];
const chip = (word: string) => screen.getByRole('button', { name: word });

describe('how it went', () => {
  /**
   * Nothing to qualify about a bare tick. It is the same rule that decides
   * which number boxes appear at all — a row of controls on every line of a
   * circuit is how a logger becomes unusable.
   */
  it('is not asked of an exercise with no numbers on it', async () => {
    await open({});
    expect(screen.getByText('Sets')).toBeTruthy();
    expect(screen.queryByText('How it went')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Solid' })).toBeNull();
  });

  it('is asked as soon as a number is typed', async () => {
    await open({});
    fireEvent.change(screen.getByLabelText(/Sets/), { target: { value: '5' } });
    await waitFor(() => expect(screen.queryByText('How it went')).toBeTruthy());
    for (const word of ['Solid', 'Hard', 'Failed']) expect(chip(word)).toBeTruthy();
  });

  it('stores the one that was tapped', async () => {
    await open({ sets: 5, hold: 10, load: 20 });
    fireEvent.click(chip('Solid'));
    await waitFor(async () => expect((await stored())?.outcome).toBe('solid'));
  });

  it('replaces rather than stacks', async () => {
    await open({ sets: 5, outcome: 'solid' });
    fireEvent.click(chip('Failed'));
    await waitFor(async () => expect((await stored())?.outcome).toBe('failed'));
  });

  /**
   * And the screen says which one. A battery found this: every store
   * assertion above passes with all three chips drawn unpressed, so the
   * climber would tap, have it recorded, and see no sign of it.
   */
  it('shows which one is on, and only that one', async () => {
    await open({ sets: 5, outcome: 'hard' });
    const pressed = (word: string) => chip(word).getAttribute('aria-pressed');
    expect(pressed('Hard')).toBe('true');
    expect(pressed('Solid')).toBe('false');
    expect(pressed('Failed')).toBe('false');
    fireEvent.click(chip('Solid'));
    await waitFor(() => expect(pressed('Solid')).toBe('true'));
    expect(pressed('Hard')).toBe('false');
  });

  /**
   * Absent is a state, and it has to stay reachable: nobody said is a
   * different thing from any of the three, and a mis-tap that could not be
   * undone would push a climber into answering something.
   */
  it('comes back off when the one that is on is tapped again', async () => {
    await open({ sets: 5, outcome: 'hard' });
    fireEvent.click(chip('Hard'));
    await waitFor(async () => expect(await stored()).toEqual({ name: HANG, sets: 5 }));
  });

  it('says what the word it is given means', async () => {
    await open({ sets: 5, outcome: 'hard' });
    expect(screen.getByText('finished, at the limit')).toBeTruthy();
  });

  /**
   * And says nothing while the question is unanswered. A line explaining a
   * state nobody chose reads as the answer — which is how an unanswered
   * field becomes an answered one without anybody tapping anything.
   */
  it('explains nothing until one is chosen', async () => {
    await open({ sets: 5 });
    expect(screen.getByText('How it went')).toBeTruthy();
    for (const meaning of [
      'every set with something left',
      'finished, at the limit',
      'a set did not finish',
    ]) {
      expect(screen.queryByText(meaning), meaning).toBeNull();
    }
  });

  it('keeps the numbers out of nothing — the entry is otherwise untouched', async () => {
    await open({ sets: 5, hold: 10, load: 20 });
    fireEvent.click(chip('Failed'));
    await waitFor(async () =>
      expect(await stored()).toEqual({ name: HANG, sets: 5, hold: 10, load: 20, outcome: 'failed' }),
    );
  });
});

describe('last time', () => {
  /**
   * The payoff. The `step` sentence asking *"if all five hangs held the full
   * ten seconds"* renders on this same card, directly above — so the answer
   * it is asking about belongs where the next number gets typed.
   */
  it('says how it went, beside what it was', async () => {
    await open({}, { sets: 5, hold: 10, load: 20, outcome: 'solid' });
    expect(screen.getByText(/5 × 10s at \+20 lbs · Solid/)).toBeTruthy();
  });

  it('says nothing extra when last time never answered', async () => {
    await open({}, { sets: 5, hold: 10, load: 20 });
    const line = screen.getByText(/5 × 10s at \+20 lbs/);
    expect(line.textContent).not.toMatch(/Solid|Hard|Failed/);
  });

  /**
   * *Same again* repeats what you did. How today went is not something last
   * week can answer, and a copied verdict would be a claim the climber never
   * made — the same line `templates.ts` draws refusing to carry climbs
   * forward.
   */
  it('copies the numbers forward and not the verdict', async () => {
    await open({}, { sets: 5, hold: 10, load: 20, outcome: 'solid' });
    fireEvent.click(screen.getByText('Same again'));
    await waitFor(async () =>
      expect(await stored()).toEqual({ name: HANG, sets: 5, hold: 10, load: 20 }),
    );
    // And the question is now being asked of today, unanswered.
    expect(screen.getByText('How it went')).toBeTruthy();
    expect((chip('Solid') as HTMLButtonElement).getAttribute('aria-pressed')).toBe('false');
  });
});
