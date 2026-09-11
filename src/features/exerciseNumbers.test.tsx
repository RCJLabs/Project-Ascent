// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { getSession, newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { LogPage } from '@/features/log/LogPage';

/**
 * Logging the load, not just the tick (PLAN.md M98).
 *
 * The fixture is the case the milestone exists for. Iron Grip's Hammer
 * phase states its goal as "Progress added load weekly" and prescribes
 * `load: '85-90% max added weight'` — one static string for four weeks — so
 * until now a climber could follow that instruction for a month and the app
 * would hold nothing but four ticks.
 */

const DATE = today();
/** Four weeks in, which is the Hammer phase (weeks 5-8). */
const START = addDays(DATE, -28);
const HANG = 'Max Hangs';

/** `reset()` re-hydrates every store, so a setting has to be applied after it. */
async function hammer(patch: Record<string, unknown> = {}, units: 'imperial' | 'metric' = 'imperial'): Promise<void> {
  await reset();
  const program = getProgram('iron_grip')!;
  const type = program.sessionTypes.find((t) =>
    (t.blocks ?? []).some((b) =>
      Object.values(b.perPhase).some((p) => p.exercises.some((e) => e.name === HANG)),
    ),
  )!;
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: program.id,
    sessionTypeId: type.id,
    ...patch,
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: START },
    plans: { [program.id]: {} },
    weekOverrides: {},
    adaptations: {},
  });
  useSettings.setState({ units });
  renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
}

/** Seed an earlier session that logged the same exercise. */
async function withHistory(entry: Record<string, unknown>): Promise<void> {
  await reset();
  await putSession({
    ...newSession(addDays(DATE, -7), 0, { completed: true }),
    exercises: [{ name: HANG, ...entry }],
  } as never);
  const program = getProgram('iron_grip')!;
  const type = program.sessionTypes.find((t) =>
    (t.blocks ?? []).some((b) =>
      Object.values(b.perPhase).some((p) => p.exercises.some((e) => e.name === HANG)),
    ),
  )!;
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: program.id,
    sessionTypeId: type.id,
    exercises: [{ name: HANG }],
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

const stored = async () => (await getSession(`${DATE}#0`))?.exercises;

describe('the numbers under a prescribed exercise', () => {
  // The untouched path stays untouched: nothing renders until the exercise
  // is ticked, which is the answer to M74's complaint that the logger is
  // already long.
  it('shows nothing until the exercise is ticked', async () => {
    await hammer();
    expect(screen.getByText(HANG)).toBeTruthy();
    expect(screen.queryByLabelText(/Load/)).toBeNull();
  });

  it('asks for the dimensions the prescription itself declares', async () => {
    await hammer({ exercises: [{ name: HANG }] });
    // Max Hangs declares sets, a hold and a load, and no reps.
    expect(screen.getByText('Sets')).toBeTruthy();
    expect(screen.getByText('Hold')).toBeTruthy();
    expect(screen.getByText('Load')).toBeTruthy();
    expect(screen.queryByText('Reps')).toBeNull();
  });

  it('keeps a number it is given', async () => {
    await hammer({ exercises: [{ name: HANG }] });
    fireEvent.change(screen.getByLabelText(/Sets/), { target: { value: '5' } });
    await waitFor(async () => expect((await stored())?.[0]?.sets).toBe(5));
  });

  // Absent, not zero: a session must never claim a number it was not given.
  it('stores nothing for a box left alone', async () => {
    await hammer({ exercises: [{ name: HANG }] });
    fireEvent.change(screen.getByLabelText(/Sets/), { target: { value: '5' } });
    await waitFor(async () => expect((await stored())?.[0]?.sets).toBe(5));
    expect((await stored())?.[0]).not.toHaveProperty('load');
  });

  it('clears a number back to absent when the box is emptied', async () => {
    await hammer({ exercises: [{ name: HANG }] });
    fireEvent.change(screen.getByLabelText(/Sets/), { target: { value: '5' } });
    await waitFor(async () => expect((await stored())?.[0]?.sets).toBe(5));
    fireEvent.change(screen.getByLabelText(/Sets/), { target: { value: '' } });
    await waitFor(async () => expect((await stored())?.[0]).not.toHaveProperty('sets'));
  });

  // Presence is the tick, so unticking takes the numbers with it — one fact
  // about the session, stored once.
  it('takes the numbers away when the exercise is unticked', async () => {
    await hammer({ exercises: [{ name: HANG, sets: 5 }] });
    fireEvent.click(screen.getByLabelText(`Mark ${HANG} done`));
    await waitFor(async () => expect(await stored()).toEqual([]));
  });

  it('marks the exercise done when it is ticked', async () => {
    await hammer();
    fireEvent.click(screen.getByLabelText(`Mark ${HANG} done`));
    await waitFor(async () => expect(await stored()).toEqual([{ name: HANG }]));
  });
});

describe('the load, which is the one the programs ask you to progress', () => {
  it('stores what was typed, in pounds, for an imperial climber', async () => {
    await hammer({ exercises: [{ name: HANG }] }, 'imperial');
    fireEvent.change(screen.getByLabelText(/Load/), { target: { value: '20' } });
    await waitFor(async () => expect((await stored())?.[0]?.load).toBe(20));
  });

  // Canonical storage is imperial (M48) and which unit it is shown in is a
  // display concern — so a climber typing kilograms gets kilograms back.
  it('converts a metric climber\'s kilograms to the stored pounds', async () => {
    await hammer({ exercises: [{ name: HANG }] }, 'metric');
    fireEvent.change(screen.getByLabelText(/Load/), { target: { value: '20' } });
    await waitFor(async () => expect((await stored())?.[0]?.load).toBeCloseTo(44.1, 1));
    expect((screen.getByLabelText(/Load/) as HTMLInputElement).value).toBe('20');
  });

  it('says which unit it is asking for', async () => {
    await hammer({ exercises: [{ name: HANG }] }, 'metric');
    expect(screen.getByText('(kg)')).toBeTruthy();
  });

  // The keypad has no minus sign, which `Input` says in as many words, so
  // weight taken off needs a control rather than a character.
  it('turns a load negative without needing a minus key', async () => {
    await hammer({ exercises: [{ name: HANG, load: 20 }] });
    fireEvent.click(screen.getByText('Added'));
    await waitFor(async () => expect((await stored())?.[0]?.load).toBe(-20));
    expect(screen.getByText('Assisted')).toBeTruthy();
  });

  it('will not offer to take weight off nothing', async () => {
    await hammer({ exercises: [{ name: HANG }] });
    expect((screen.getByText('Added').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the sign while the magnitude is retyped', async () => {
    await hammer({ exercises: [{ name: HANG, load: -20 }] });
    fireEvent.change(screen.getByLabelText(/Load/), { target: { value: '25' } });
    await waitFor(async () => expect((await stored())?.[0]?.load).toBe(-25));
  });
});

/**
 * The same sheet, over a named protocol (PLAN.md M99).
 *
 * M99 generalised `TimerSheet` away from `Protocol` so a circuit could use
 * it. These hold the protocol side of that: a fingerboard set still says
 * "Hang" and still counts in sets and reps.
 */
describe('the protocol timer the circuit generalisation had to keep', () => {
  it('opens over the exercise, named by its protocol', async () => {
    await hammer({ exercises: [{ name: HANG }] });
    fireEvent.click(within(screen.getByText(HANG).closest('li')!).getByText('Timer'));
    expect(screen.getByRole('dialog', { name: 'Max Hangs timer' })).toBeTruthy();
  });

  // A hang is a hang. `workLabel` has always known that and nothing used to
  // prove the sheet asked it.
  it('calls the work phase a hang rather than work', async () => {
    await hammer({ exercises: [{ name: HANG }] });
    fireEvent.click(within(screen.getByText(HANG).closest('li')!).getByText('Timer'));
    fireEvent.click(screen.getByLabelText('Skip segment'));
    // The element, not the sheet's text: the header is "Max Hangs", so a
    // regex over the whole sheet matches /Hang/ whatever the dial says —
    // and `\bWork\b` never matches inside "…HangsWork10" either, because
    // neither side of it is a word boundary. Both directions pass for the
    // wrong reason, which a mutation found and this fixes.
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByText('Hang', { exact: true })).toBeTruthy();
    expect(sheet.queryByText('Work', { exact: true })).toBeNull();
  });

  it('counts in sets and reps, not rounds and exercise names', async () => {
    await hammer({ exercises: [{ name: HANG }] });
    fireEvent.click(within(screen.getByText(HANG).closest('li')!).getByText('Timer'));
    fireEvent.click(screen.getByLabelText('Skip segment'));
    const sheet = screen.getByRole('dialog');
    expect(sheet.textContent).toMatch(/Set 1 of 5 · rep 1 of 1/);
    expect(sheet.textContent).not.toMatch(/Round/);
  });

  it('shows the protocol\'s grip under the dial', async () => {
    await hammer({ exercises: [{ name: HANG }] });
    fireEvent.click(within(screen.getByText(HANG).closest('li')!).getByText('Timer'));
    expect(screen.getByRole('dialog').textContent).toMatch(/20\s?mm/i);
  });
});

describe('last time', () => {
  it('says what was done last time, rather than pre-filling it', async () => {
    await withHistory({ sets: 5, hold: 10, load: 20 });
    expect(screen.getByText(/5 × 10s at \+20 lbs/)).toBeTruthy();
    // Nothing is claimed until the climber says so.
    expect((screen.getByLabelText(/Sets/) as HTMLInputElement).value).toBe('');
    expect((await stored())?.[0]).toEqual({ name: HANG });
  });

  it('copies it forward on one tap, which is what makes it a claim', async () => {
    await withHistory({ sets: 5, hold: 10, load: 20 });
    fireEvent.click(screen.getByText('Same again'));
    await waitFor(async () =>
      expect((await stored())?.[0]).toEqual({ name: HANG, sets: 5, hold: 10, load: 20 }),
    );
    await waitFor(() => expect((screen.getByLabelText(/Sets/) as HTMLInputElement).value).toBe('5'));
  });

  it('offers nothing when the exercise has never been logged with numbers', async () => {
    await withHistory({});
    expect(screen.queryByText('Same again')).toBeNull();
  });

  it('never pre-fills from the prescription\'s own prose', async () => {
    await hammer({ exercises: [{ name: HANG }] });
    // The program prescribes '5' sets and '10s'. Neither is a number the
    // climber did, so neither is in the boxes.
    expect((screen.getByLabelText(/Sets/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Hold/) as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('Same again')).toBeNull();
  });
});
