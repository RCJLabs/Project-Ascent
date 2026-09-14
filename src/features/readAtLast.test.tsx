// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { getProgram, loadPrograms } from '@/content/programs';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from '@/features/log/LogPage';
import { FinishPage } from '@/features/finish/FinishPage';
import { ProgramDetailPage } from '@/features/train/ProgramDetailPage';

/**
 * Authored or computed, and now read (PLAN.md M155, M156).
 *
 * Three fields the app carried and showed nobody: the prose that says how a
 * program runs, the sessions a climber did beyond what the plan placed, and
 * where a session came from when it was not typed here.
 */

const TODAY = today();

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

/** The program page, with the fold M121 put "How it runs" behind opened. */
async function program(id: string) {
  await hydrate();
  renderAt(`/train/${id}`, <ProgramDetailPage params={{ id }} />);
  fireEvent.click(await screen.findByRole('button', { name: /What's in it/ }));
  await screen.findByText('How it runs');
}

/**
 * The panel under *How it runs* (PLAN.md M155).
 *
 * It mapped over `program.constraints` unconditionally, so the two programs
 * that carry none — General Training and Outdoor Climbing, the logging
 * modes — got an empty grey box under a heading promising to say how the
 * program runs.
 *
 * The prose that might have filled it, `frequency` and `ordering`, is gone:
 * for eleven programs it is the sentence the constraints were derived from
 * (Iron Grip's *"48 hours between finger sessions"* was its `frequency`,
 * its `ordering` and two constraint notes), and for the other two it
 * restates the rhythm rendered immediately above it.
 */
describe('how a program runs', () => {
  it('shows the rules a program has', async () => {
    await program('iron_grip');
    expect(screen.getByText(/Leave at least 48 hours between finger sessions/)).toBeTruthy();
  });

  /**
   * Outdoor Climbing, since M166. General Training was the example here
   * until it declared the 48-hour hangboard gap it had been stating in prose
   * — so the entry with genuinely no rules is now the other mode, and the
   * behaviour under test is unchanged.
   */
  it('leaves no empty panel for a program with no rules', async () => {
    expect(getProgram('outdoor_climbing')!.constraints).toHaveLength(0);
    await program('outdoor_climbing');
    const rhythm = screen.getByText(/Log the session at the crag/);
    const card = rhythm.closest('section')!;
    expect(card.querySelector('.bg-sunken')).toBeNull();
  });

  /**
   * And the mode that does have one shows it, like any program.
   *
   * Scoped to the rules panel rather than the page: the same sentence is in
   * the Finger Protocol's rationale, which is where it lived alone until
   * M166 — so a page-wide match would pass whether or not the constraint
   * reached the panel, which is the only half that is new.
   */
  it('shows the one rule a mode declares, in the rules panel', async () => {
    expect(getProgram('general_training')!.constraints).toHaveLength(1);
    await program('general_training');
    const rhythm = screen.getByText(/Log your sessions as they happen/);
    const card = rhythm.closest('section')!;
    const rules = [...card.querySelectorAll('.bg-sunken')].map((n) => n.textContent ?? '');
    expect(rules.some((t) => /48 hours between hangboard sessions/.test(t))).toBe(true);
  });

  it('still says how the logging modes run, in the rhythm above it', async () => {
    await program('outdoor_climbing');
    expect(screen.getByText(/Log the session at the crag/)).toBeTruthy();
  });
});

describe('sessions the plan never placed', () => {
  const FROM = addDays(startOfWeek(TODAY), -14 * 7);

  async function report(extra: number) {
    for (let i = 0; i < extra; i += 1) {
      await putSession({
        ...newSession(addDays(FROM, 1 + i * 7), 0, { completed: true }),
        programId: 'iron_grip',
        sessionTypeId: 'fp',
      } as never);
    }
    await hydrate();
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: FROM },
      plans: { iron_grip: { 1: 'fp' } },
      weekOverrides: {},
      adaptations: {},
      injuries: [],
    } as never);
    renderAt('/finish', <FinishPage />);
    await screen.findByText('What comes next');
  }

  it('counts them beside the fraction rather than into it', async () => {
    // Two a week where the plan placed one: the extras are real training
    // and they are not the sessions that were asked for.
    for (let i = 0; i < 4; i += 1) {
      await putSession({
        ...newSession(addDays(FROM, 3 + i * 7), 0, { completed: true }),
        programId: 'iron_grip',
        sessionTypeId: 'fp',
      } as never);
    }
    await report(4);
    const row = (await screen.findByText('Finger Protocol + Engine')).closest('div')!;
    // Twelve weeks placed one a week; four of those happened, and four
    // more of the same type happened on days the plan left empty. The
    // fraction stays adherence to the plan; the extras sit beside it.
    expect(row.textContent).toMatch(/4 of 12/);
    expect(row.textContent).toMatch(/\+4/);
  });

  it('says nothing extra when nothing was extra', async () => {
    await report(2);
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });
});

describe('a session that was not typed here', () => {
  async function logger(patch: Record<string, unknown>) {
    await putSession({ ...newSession(TODAY, 0, { completed: true }), ...patch } as never);
    await hydrate();
    useProfile.setState({ activeProgramId: null, injuries: [] } as never);
    renderAt('/', <DayBody date={TODAY} />);
  }

  it('says where it came from', async () => {
    await logger({ imported: 'csv' });
    expect(await screen.findByText(/Imported from a spreadsheet/)).toBeTruthy();
  });

  it('says nothing about one the climber logged', async () => {
    await logger({});
    await screen.findByText('Logged');
    expect(screen.queryByText(/Imported from a spreadsheet/)).toBeNull();
  });
});
