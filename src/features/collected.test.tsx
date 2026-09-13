// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { loadPrograms } from '@/content/programs';
import { newSession, putSession, type Climb } from '@/db/sessions';
import { today } from '@/engine/dates';
import { ENOUGH } from '@/engine/ropeStyle';
import { useObjectives } from '@/store/objectives';
import { useProfile } from '@/store/profile';
import { useProjects } from '@/store/projects';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from '@/features/log/LogPage';
import { ObjectiveDetailPage } from '@/features/objectives/ObjectiveDetailPage';
import { ProgressPage } from '@/features/progress/ProgressPage';

/**
 * The fields the app collected and never read (PLAN.md M133).
 *
 * Not one bug four times, which is how the audit item read it. Two of them
 * are dead ends — `Climb.ropeStyle` written and read by nothing, and an
 * objective's `projectId` stored beside an `achievedByProject` whose only
 * caller was its own test. One is a gate: `location` is read in three
 * places and was *asked* by seven session types out of forty-two. And the
 * fourth is an archive that forgot what the logger collected.
 */

const TODAY = today();

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
});

describe('where you climbed is asked of everyone', () => {
  async function logging(programId: string | null, typeId?: string): Promise<void> {
    await putSession({
      ...newSession(TODAY, 0, { completed: false }),
      ...(programId ? { programId, sessionTypeId: typeId } : {}),
    } as never);
    await hydrate();
    useProfile.setState({
      activeProgramId: programId,
      startDates: programId ? { [programId]: TODAY } : {},
      plans: programId ? { [programId]: {} } : {},
      weekOverrides: {},
      adaptations: {},
      injuries: [],
    });
    useSettings.setState({ logView: 'full' });
    renderAt('/', <DayBody date={TODAY} />);
  }

  it('asks an Iron Grip climber, whose program never did', async () => {
    // Iron Grip's finger day declares no fields at all, so this card did not
    // exist for it — and Iron Grip is twelve weeks of sessions with no
    // record of where any of them happened.
    await logging('iron_grip', 'fp');
    expect(await screen.findByLabelText('Where')).toBeTruthy();
  });

  it('keeps what it is told, from a program that never asked', async () => {
    await logging('iron_grip', 'fp');
    fireEvent.change(await screen.findByLabelText('Where'), { target: { value: 'The Depot' } });
    await waitFor(async () => {
      const { getSession } = await import('@/db/sessions');
      expect((await getSession(`${TODAY}#0`))?.fields?.location).toBe('The Depot');
    });
  });

  it('does not ask it twice of a program that already does', async () => {
    await logging('outdoor_climbing', 'outdoor_boulder');
    await screen.findByText('This session');
    expect(screen.getAllByLabelText('Where')).toHaveLength(1);
  });

  it('does not ask where you rested', async () => {
    await logging('iron_grip', 'rest');
    await screen.findByText(/Rest/);
    expect(screen.queryByLabelText('Where')).toBeNull();
  });
});

describe('lead against top-rope, finally read', () => {
  const route = (grade: string, ropeStyle: 'lead' | 'toprope'): Climb =>
    ({ id: `${grade}-${ropeStyle}-${Math.random()}`, grade, scale: 'YDS', count: 1, result: 'send', ropeStyle }) as Climb;

  async function progress(climbs: Climb[]): Promise<void> {
    await putSession(newSession('2026-01-09', 0, { completed: true, climbs } as never));
    await hydrate();
    // The card lives in the Grades view, and 'This block' is the default.
    useSettings.setState({ progressView: 'grades' } as never);
    renderAt('/progress', <ProgressPage />);
    await screen.findByRole('heading', { name: 'Progress' });
  }

  const both = () => [
    ...Array.from({ length: ENOUGH }, () => route('5.10d', 'lead')),
    ...Array.from({ length: ENOUGH }, () => route('5.12a', 'toprope')),
  ];

  it('shows the split once routes carry one', async () => {
    await progress(both());
    fireEvent.click(await screen.findByRole('button', { name: 'Routes' }));
    expect(await screen.findByText('Led and top-roped')).toBeTruthy();
  });

  it('names both ceilings', async () => {
    await progress(both());
    fireEvent.click(await screen.findByRole('button', { name: 'Routes' }));
    await screen.findByText('Led and top-roped');
    expect(screen.getByText(/5\.10d led, 5\.12a top-roped/)).toBeTruthy();
  });

  it('stays on the route ladder, where a rope style belongs', async () => {
    // The boulder view of a log full of led routes must not offer a card
    // about leading: the two ladders are two different questions, and the
    // chips above it say which one is being asked.
    await progress(both());
    fireEvent.click(await screen.findByRole('button', { name: 'Boulder' }));
    await waitFor(() => expect(screen.queryByText('Led and top-roped')).toBeNull());
  });

  it('says nothing at all when no route says which', async () => {
    await progress([
      { id: 'a', grade: '5.11a', scale: 'YDS', count: 1, result: 'send' } as Climb,
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Routes' }));
    await waitFor(() => expect(screen.queryByText('Led and top-roped')).toBeNull());
  });
});

describe('an objective whose project went', () => {
  async function objective(projectStatus: 'active' | 'sent', linked = true): Promise<void> {
    await hydrate();
    useProjects.setState({
      projects: [
        {
          id: 'p1',
          name: 'The Nose',
          grade: '5.13a',
          scale: 'YDS',
          status: projectStatus,
          createdAt: '2026-01-01',
        } as never,
      ],
      hydrated: true,
    } as never);
    useObjectives.setState({
      objectives: [
        {
          id: 'o1',
          name: 'Send The Nose',
          kind: 'route',
          status: 'training',
          requirements: [],
          ...(linked ? { projectId: 'p1' } : {}),
        } as never,
      ],
      hydrated: true,
    } as never);
    renderAt('/objectives/o1', <ObjectiveDetailPage params={{ id: 'o1' }} />);
    await screen.findByText('Send The Nose');
  }

  it('says so, naming the project', async () => {
    await objective('sent');
    const note = await screen.findByText(/is logged as sent/);
    // Inside the notice, not merely somewhere on the page — the select
    // above it lists every project by name.
    expect(note.textContent).toContain('The Nose');
  });

  it('does not mark it done by itself', async () => {
    // A project can be the crux of an objective rather than the whole of it,
    // and an app that decided otherwise would be wrong in a way the climber
    // has to go and undo.
    await objective('sent');
    await screen.findByText(/is logged as sent/);
    expect(useObjectives.getState().objectives[0]!.status).toBe('training');
  });

  it('marks it done when the climber says so', async () => {
    await objective('sent');
    fireEvent.click(await screen.findByRole('button', { name: /Mark this done/ }));
    await waitFor(() => {
      expect(useObjectives.getState().objectives[0]!.status).toBe('sent');
    });
  });

  it('stays quiet while the project is still a project', async () => {
    await objective('active');
    expect(screen.queryByText(/is logged as sent/)).toBeNull();
  });

  it('stays quiet when no project is linked', async () => {
    await objective('sent', false);
    expect(screen.queryByText(/is logged as sent/)).toBeNull();
  });
});
