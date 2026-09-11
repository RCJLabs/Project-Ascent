// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { newProject, putProject } from '@/db/projects';
import { getSession, newSession, putSession, type ProjectAttempt } from '@/db/sessions';
import { today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { LogPage } from '@/features/log/LogPage';
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage';

/**
 * Links, not just high points (PLAN.md M102).
 *
 * A redpoint is decided by links. The app stored only where a burn ended, so
 * a climber who had covered a route in two overlapping halves and linked
 * none of it looked, on the card, like someone at 90%.
 */

const DATE = today();
const PROJECT = 'proj-1';

async function project(attempts: ProjectAttempt[] = []): Promise<void> {
  await reset();
  await putProject({
    ...newProject({ name: 'The Nose', grade: 'V7', scale: 'V' }),
    id: PROJECT,
  });
  await putSession({
    ...newSession(DATE, 0, { completed: true, rpe: 7, durationMin: 90 }),
    ...(attempts.length ? { projectAttempts: attempts } : {}),
  } as never);
  await hydrate();
}

const burn = (patch: Partial<ProjectAttempt>): ProjectAttempt => ({
  id: 'a1', projectId: PROJECT, outcome: 'fell-high', count: 2, ...patch,
});

/**
 * The same, on a session type that asks the `highPoint` question — The
 * Siege's projecting day, which declares it alongside three others.
 */
async function projecting(attempts: ProjectAttempt[]): Promise<void> {
  await reset();
  await putProject({ ...newProject({ name: 'The Nose', grade: 'V7', scale: 'V' }), id: PROJECT });
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: 'the_siege',
    sessionTypeId: 'proj',
    projectAttempts: attempts,
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: 'the_siege',
    startDates: { the_siege: DATE },
    plans: { the_siege: {} },
    weekOverrides: {},
    adaptations: {},
  });
}

const stored = async () => (await getSession(`${DATE}#0`))?.projectAttempts;

describe('logging where a burn started', () => {
  it('asks, once there is a burn to ask about', async () => {
    await project([burn({})]);
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    expect(screen.getByLabelText(/Where the fell-high burns started/)).toBeTruthy();
  });

  it('keeps what it is given', async () => {
    await project([burn({})]);
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    fireEvent.change(screen.getByLabelText(/Where the fell-high burns started/), {
      target: { value: '30' },
    });
    await waitFor(async () => expect((await stored())?.[0]?.from).toBe(30));
  });

  // Blank is the ground, which is what every burn logged before this meant.
  it('stores nothing when it is left alone', async () => {
    await project([burn({})]);
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    expect((await stored())?.[0]).not.toHaveProperty('from');
  });

  it('clears back to the ground when emptied', async () => {
    await project([burn({ from: 30 })]);
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    const box = screen.getByLabelText(/Where the fell-high burns started/);
    expect((box as HTMLInputElement).value).toBe('30');
    fireEvent.change(box, { target: { value: '' } });
    await waitFor(async () => expect((await stored())?.[0]?.from).toBeUndefined());
  });

  it('refuses a percentage off the climb', async () => {
    await project([burn({})]);
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    fireEvent.change(screen.getByLabelText(/Where the fell-high burns started/), {
      target: { value: '250' },
    });
    await waitFor(async () => expect((await stored())?.[0]?.from).toBe(100));
  });

  // A rehearsal starts nowhere in particular, and a send from the ground is
  // the whole climb by definition.
  it('does not ask about a rehearsal or a send', async () => {
    await project([burn({ outcome: 'worked' }), burn({ id: 'a2', outcome: 'send', count: 1 })]);
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    expect(screen.queryByLabelText(/Where the worked burns started/)).toBeNull();
    expect(screen.queryByLabelText(/Where the send burns started/)).toBeNull();
  });

  /**
   * Two controls called "High point" on one page, meaning different things:
   * the burn card's is a percentage, the session question names a move.
   *
   * On a session type that actually asks the question — a first version used
   * a plain session, which renders no fields at all, so the assertion passed
   * whatever the label said.
   */
  it('no longer calls the session question a high point', async () => {
    await projecting([burn({})]);
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    expect(screen.getByLabelText('The move you reached')).toBeTruthy();
    expect(screen.queryByLabelText('High point')).toBeNull();
  });
});

describe('what the project page says about it', () => {
  /** 0-40% from the ground, 30-100% from above. Never linked. */
  const halves = [
    burn({ id: 'a1', outcome: 'fell-low', count: 3, highPoint: 40 }),
    burn({ id: 'a2', outcome: 'fell-crux', count: 2, from: 30, highPoint: 100 }),
  ];

  it('reports the high point from the ground, and says so', async () => {
    await project(halves);
    renderAt(`/projects/${PROJECT}`, <ProjectDetailPage params={{ id: PROJECT }} />);
    // The stat's own block, not the page: "40%" also appears on the burn it
    // came from.
    const stat = screen.getByText('From the ground').parentElement!;
    expect(within(stat).getByText('40%')).toBeTruthy();
  });

  it('reports the longest link beside it', async () => {
    await project(halves);
    renderAt(`/projects/${PROJECT}`, <ProjectDetailPage params={{ id: PROJECT }} />);
    expect(screen.getByText('Longest link')).toBeTruthy();
    expect(screen.getByText('30% → 100%')).toBeTruthy();
  });

  // It will not guess how close the send is.
  it('makes no prediction from it', async () => {
    await project(halves);
    renderAt(`/projects/${PROJECT}`, <ProjectDetailPage params={{ id: PROJECT }} />);
    // Asserted as the sentence that is there rather than as words that are
    // not: a first draft banned /close/ and failed on the card's own "the app
    // will not guess how close it is", which is the disclaimer itself.
    const card = screen.getByText('Longest link').closest('section')!;
    expect(card.textContent).toMatch(/will not guess how close it is/);
    expect(card.textContent).not.toMatch(/you should|nearly there|close to sending|next session/i);
  });

  // A project climbed only from the ground has one number, and a second card
  // repeating it is noise.
  it('says nothing extra about an ordinary ground-up project', async () => {
    await project([burn({ count: 4 })]);
    renderAt(`/projects/${PROJECT}`, <ProjectDetailPage params={{ id: PROJECT }} />);
    expect(screen.queryByText('Longest link')).toBeNull();
  });

  it('shows the link on the burn it came from', async () => {
    await project(halves);
    renderAt(`/projects/${PROJECT}`, <ProjectDetailPage params={{ id: PROJECT }} />);
    // "Burns" is also a stat label on the card above, so the list is found
    // by the heading rather than by the word.
    const burns = screen.getAllByText('Burns').map((n) => n.closest('section')).find(
      (sec) => sec?.querySelector('ol') !== null,
    )!;
    expect(within(burns).getByText('30→100%')).toBeTruthy();
    expect(within(burns).getByText('40%')).toBeTruthy();
  });
});
