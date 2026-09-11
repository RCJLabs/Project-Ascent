// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { getSession, newSession, putSession } from '@/db/sessions';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { LogPage } from '@/features/log/LogPage';
import { today } from '@/engine/dates';

/**
 * The questions a session type asks, finally asked (PLAN.md M70).
 *
 * Outdoor Climbing declares `location`, `sessionNumber`, `attemptsToday` and
 * `highPoint` on its session types and the logger never rendered one.
 */

const DATE = today();

/** An Outdoor Climbing session, which is the program that asks the most. */
async function logging(): Promise<void> {
  await reset();
  const program = getProgram('outdoor_climbing')!;
  const type = program.sessionTypes.find((t) => (t.fields ?? []).includes('location'))!;
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: program.id,
    sessionTypeId: type.id,
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: DATE },
    plans: { [program.id]: {} },
    weekOverrides: {},
    adaptations: {},
  });
  renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
}

describe('a session type that asks for more', () => {
  it('asks it, instead of declaring it and staying silent', async () => {
    await logging();
    expect(screen.getByText('This session')).toBeTruthy();
    expect(screen.getByText('Where')).toBeTruthy();
  });

  it('keeps what it is told', async () => {
    await logging();
    fireEvent.change(screen.getByLabelText('Where'), { target: { value: 'Stanage' } });
    await waitFor(async () => {
      expect((await getSession(`${DATE}#0`))?.fields?.location).toBe('Stanage');
    });
  });

  // A field left alone is absent, not an empty string: a session should
  // never claim a blank it was not given.
  it('stores nothing for a question left alone', async () => {
    await logging();
    fireEvent.change(screen.getByLabelText('Where'), { target: { value: 'Stanage' } });
    await waitFor(async () => expect((await getSession(`${DATE}#0`))?.fields?.location).toBe('Stanage'));

    fireEvent.change(screen.getByLabelText('Where'), { target: { value: '' } });
    await waitFor(async () => {
      const stored = await getSession(`${DATE}#0`);
      // The key is gone, not present-and-undefined: a structured clone
      // keeps an explicit undefined, and `?.location` cannot tell them
      // apart.
      expect('location' in (stored?.fields ?? {})).toBe(false);
      // And with nothing left to say, the whole bag goes.
      expect(stored?.fields).toBeUndefined();
    });
  });

  it('asks nothing extra when the session type asks for nothing', async () => {
    await reset();
    await putSession(newSession(DATE, 0, { completed: false }));
    await hydrate();
    useProfile.setState({ activeProgramId: null, startDates: {}, plans: {}, weekOverrides: {}, adaptations: {} });
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    expect(screen.queryByText('This session')).toBeNull();
  });
});

/**
 * A typed grade against the session's own climbs (PLAN.md M88).
 *
 * Six of the eleven programs ask a session type for "Hardest sent" — and
 * the app derives exactly that from the climbs logged in the same session,
 * for the pyramid, the progression chart and the records. The typed answer
 * feeds none of them, and nothing had ever checked the two agree.
 */
async function performance(fields: Record<string, string>, climbs: unknown[]): Promise<void> {
  await reset();
  const program = getProgram('iron_grip')!;
  const type = program.sessionTypes.find((t) => (t.fields ?? []).includes('hardestGradeSent'))!;
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: program.id,
    sessionTypeId: type.id,
    fields,
    climbs,
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: DATE },
    plans: { [program.id]: {} },
    weekOverrides: {},
    adaptations: {},
  });
  renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
}

const sent = (grade: string) => ({ id: grade, grade, scale: 'V', count: 1, result: 'send' });

describe('when the typed grade and the climbs disagree', () => {
  it('says so, on the screen where either can be fixed', async () => {
    await performance({ hardestGradeSent: 'V7' }, [sent('V5')]);
    expect(screen.getByText(/the hardest in the climbs below is/)).toBeTruthy();
  });

  it('names both grades', async () => {
    await performance({ hardestGradeSent: 'V7' }, [sent('V5')]);
    const notice = screen.getByText(/the hardest in the climbs below is/).closest('li')!;
    expect(notice.textContent).toContain('V7');
    expect(notice.textContent).toContain('V5');
  });

  it('says which side reaches the grades and records', async () => {
    await performance({ hardestGradeSent: 'V7' }, [sent('V5')]);
    expect(screen.getByText(/only the climbs reach your grades and records/)).toBeTruthy();
  });

  it('allows that both can be true rather than calling it an error', async () => {
    await performance({ hardestGradeSent: 'V7' }, [sent('V5')]);
    expect(screen.getByText(/Both can be true/)).toBeTruthy();
  });

  it('stays quiet when they agree', async () => {
    await performance({ hardestGradeSent: 'V5' }, [sent('V5')]);
    expect(screen.queryByText(/the hardest in the climbs below is/)).toBeNull();
  });

  it('stays quiet when no climbs were logged', async () => {
    await performance({ hardestGradeSent: 'V7' }, []);
    expect(screen.queryByText(/the hardest in the climbs below is/)).toBeNull();
  });
});
