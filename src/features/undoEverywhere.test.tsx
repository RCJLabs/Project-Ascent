// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getDb } from '@/db/db';
import { addMedia, listMedia, projectOwner } from '@/db/media';
import { newProject, putProject } from '@/db/projects';
import { getSession, newSession, putSession } from '@/db/sessions';
import { today } from '@/engine/dates';
import { newObjectiveId, type Objective } from '@/engine/objectives';
import { useMetrics } from '@/store/metrics';
import { useObjectives } from '@/store/objectives';
import { useProfile } from '@/store/profile';
import { useTemplates } from '@/store/templates';
import { useUndo } from '@/store/undo';
import { hydrate, renderAt, reset } from '@/test/render';
import { InjuryPage } from '@/features/injury/InjuryPage';
import { MediaCard } from '@/features/media/MediaCard';
import { MetricDetailPage } from '@/features/assessments/MetricDetailPage';
import { ObjectiveDetailPage } from '@/features/objectives/ObjectiveDetailPage';
import { GymPage } from '@/features/gym/GymPage';
import { LogPage } from '@/features/log/LogPage';

/**
 * Undo wherever it destroys (PLAN.md M79).
 *
 * Each of these deletes something a climber wrote, reads the offer the shell
 * would show, runs it, and checks the thing came back *whole* — same id,
 * same notes — rather than as a fresh record that merely looks the same.
 */

const DATE = today();
const settle = () => new Promise((r) => setTimeout(r, 40));
const offer = () => useUndo.getState().offer;

beforeEach(async () => {
  await reset();
  useUndo.getState().clear();
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

describe('marking an injury healed', () => {
  it('comes back with its id, note and ticks', async () => {
    await hydrate();
    useProfile.setState({
      injuries: [{ id: 'inj-1', part: 'fingers', side: 'left', since: DATE, severity: 'managing', status: 'active', note: 'A2 pulley, left ring', checklist: { 'step-1': true } }],
    });
    renderAt('/injury/inj-1', <InjuryPage params={{ id: 'inj-1' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark healed' }));
    await settle();
    expect(useProfile.getState().injuries).toHaveLength(0);
    expect(offer()?.label).toBe('left fingers injury');

    await offer()!.run();
    const back = useProfile.getState().injuries[0]!;
    expect(back.id).toBe('inj-1');
    expect(back.note).toBe('A2 pulley, left ring');
    expect(back.checklist).toEqual({ 'step-1': true });
  });
});

describe('a photo', () => {
  const OWNER = projectOwner('p1');
  async function withPhoto(marks?: unknown) {
    const db = await getDb();
    await db.clear('media');
    return addMedia({
      ownerId: OWNER,
      blob: new Blob(['x'], { type: 'image/webp' }),
      type: 'image/webp',
      width: 400,
      height: 200,
      caption: 'The crux',
      ...(marks ? { marks: marks as never } : {}),
    });
  }

  it('deleted comes back, marks and caption included', async () => {
    const photo = await withPhoto([{ kind: 'circle', color: 'gold', points: [0.5, 0.5, 0.6, 0.5] }]);
    await hydrate();
    renderAt('/', <MediaCard owner={OWNER} blurb="None" fullNote="Full" />);
    fireEvent.click(await screen.findByRole('button', { name: /Open photo|The crux/ }));
    const dialog = await screen.findByRole('dialog');
    // The danger button in the caption row is the delete.
    const del = within(dialog).getAllByRole('button').find((b) => b.className.includes('text-danger'))!;
    fireEvent.click(del);
    await waitFor(async () => expect(await listMedia(OWNER)).toHaveLength(0));
    expect(offer()?.label).toBe('The crux');

    await offer()!.run();
    const back = (await listMedia(OWNER))[0]!;
    expect(back.id).toBe(photo.id);
    expect(back.caption).toBe('The crux');
    expect(back.marks).toHaveLength(1);
    // And it is back on screen, not only in the database.
    expect(await screen.findByRole('button', { name: /The crux/ })).toBeTruthy();
  });

  it('cleared of its beta gets the beta back', async () => {
    await withPhoto([
      { kind: 'circle', color: 'gold', points: [0.5, 0.5, 0.6, 0.5] },
      { kind: 'arrow', color: 'red', points: [0.1, 0.9, 0.5, 0.5] },
    ]);
    await hydrate();
    renderAt('/', <MediaCard owner={OWNER} blurb="None" fullNote="Full" />);
    fireEvent.click(await screen.findByRole('button', { name: /The crux/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    await waitFor(async () => expect((await listMedia(OWNER))[0]!.marks).toBeUndefined());
    expect(offer()?.label).toBe('Beta on this photo');

    await offer()!.run();
    await waitFor(async () => expect((await listMedia(OWNER))[0]!.marks).toHaveLength(2));
  });
});

describe('an assessment result', () => {
  it('deleted comes back on the same day with the same number', async () => {
    await hydrate();
    await useMetrics.getState().record({ metricId: 'dead_hang', date: DATE, value: 45, note: 'felt strong' });
    renderAt('/assessments/dead_hang', <MetricDetailPage params={{ id: 'dead_hang' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Delete the .* result/ }));
    await waitFor(() => expect(useMetrics.getState().entries).toHaveLength(0));
    expect(offer()?.label).toMatch(/result from/);

    await offer()!.run();
    const back = useMetrics.getState().entries[0]!;
    expect(back).toMatchObject({ metricId: 'dead_hang', date: DATE, value: 45, note: 'felt strong' });
  });
});

describe('a session template', () => {
  it('deleted comes back with its id and use count', async () => {
    await hydrate();
    const session = { ...newSession(DATE, 0, { completed: true }), climbs: [{ id: 'c1', grade: 'V4', scale: 'V', count: 3, result: 'send' }] } as never;
    const template = await useTemplates.getState().save(session, 'Tuesday circuit', 'Power');
    await useTemplates.getState().use(template.id);
    const used = useTemplates.getState().templates.find((t) => t.id === template.id)!.uses;

    await useTemplates.getState().remove(template.id);
    expect(useTemplates.getState().templates).toHaveLength(0);
    await useTemplates.getState().restore({ ...template, uses: used });
    const back = useTemplates.getState().templates[0]!;
    expect(back.id).toBe(template.id);
    expect(back.name).toBe('Tuesday circuit');
    expect(back.uses).toBe(used);
  });
});

describe('an objective requirement', () => {
  it('removed comes back in its place', async () => {
    await hydrate();
    const objective: Objective = {
      id: newObjectiveId(), name: 'Font trip', kind: 'trip', status: 'training',
      requirements: [
        { id: 'r1', requirement: { kind: 'sessions', count: 10 }, why: 'consistency first' },
        { id: 'r2', requirement: { kind: 'outdoor-days', count: 4 } },
      ],
      createdAt: DATE, updatedAt: DATE,
    };
    useObjectives.setState({ objectives: [objective], hydrated: true });
    renderAt(`/objectives/${objective.id}`, <ObjectiveDetailPage params={{ id: objective.id }} />);
    const removes = await screen.findAllByRole('button', { name: /^Remove: / });
    fireEvent.click(removes[0]!);
    await waitFor(() => expect(useObjectives.getState().objectives[0]!.requirements).toHaveLength(1));
    expect(offer()).not.toBeNull();

    await offer()!.run();
    await waitFor(() => expect(useObjectives.getState().objectives[0]!.requirements).toHaveLength(2));
    const back = useObjectives.getState().objectives[0]!.requirements;
    expect(back.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(back[0]!.why).toBe('consistency first');
  });
});

describe('a tally row taken to zero', () => {
  const ID = `${DATE}#0`;
  async function running() {
    await putSession({
      ...newSession(DATE, 0, { completed: false }),
      startedAt: new Date().toISOString(),
      climbs: [
        { id: 'a', grade: 'V4', scale: 'V', count: 2, result: 'send' },
        { id: 'b', grade: 'V6', scale: 'V', count: 1, result: 'attempt' },
      ],
    } as never);
    await hydrate();
    useProfile.setState({ activeProgramId: null, startDates: {} });
  }

  it('in gym mode comes back, in the same place', async () => {
    await running();
    renderAt('/gym', <GymPage />);
    fireEvent.click(await screen.findByRole('button', { name: /One fewer V6 tried/ }));
    await waitFor(async () => expect((await getSession(ID))!.climbs.map((c) => c.id)).toEqual(['a']));
    expect(offer()?.label).toBe('V6 tried');

    await offer()!.run();
    await waitFor(async () => expect((await getSession(ID))!.climbs.map((c) => c.id)).toEqual(['a', 'b']));
  });

  it('in gym mode is not offered for a count that merely fell', async () => {
    await running();
    renderAt('/gym', <GymPage />);
    fireEvent.click(await screen.findByRole('button', { name: /One fewer V4 sent/ }));
    await waitFor(async () => expect((await getSession(ID))!.climbs[0]!.count).toBe(1));
    // 2 → 1 is not a loss; an offer for it would be noise that buries the
    // one that matters.
    expect(offer()).toBeNull();
  });

  it('in the logger comes back too', async () => {
    await running();
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'One fewer V6' }));
    await waitFor(async () => expect((await getSession(ID))!.climbs).toHaveLength(1));
    expect(offer()?.label).toBe('V6 tried');
    await offer()!.run();
    await waitFor(async () => expect((await getSession(ID))!.climbs).toHaveLength(2));
  });
});

describe('a project burn taken to zero', () => {
  it('comes back with its high point', async () => {
    const project = newProject({ id: 'proj-1', name: 'The Nose Direct', grade: 'V7', scale: 'V' } as never);
    await putProject(project);
    await putSession({
      ...newSession(DATE, 0, { completed: false }),
      projectAttempts: [{ id: 'att-1', projectId: 'proj-1', outcome: 'fell-high', highPoint: 80, count: 1, note: 'slipped off the lip' }],
    } as never);
    await hydrate();
    useProfile.setState({ activeProgramId: null, startDates: {} });
    renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    const projectsCard = (await screen.findByText('Projects')).closest('section, div') as HTMLElement;
    const minus = within(projectsCard).getAllByRole('button').find((b) => /fewer/.test(b.getAttribute('aria-label') ?? '') || b.textContent === '−')!;
    fireEvent.click(minus);
    await waitFor(async () => expect((await getSession(`${DATE}#0`))!.projectAttempts ?? []).toHaveLength(0));
    expect(offer()?.label).toBe('The Nose Direct · Fell high');

    await offer()!.run();
    const back = (await getSession(`${DATE}#0`))!.projectAttempts![0]!;
    expect(back).toMatchObject({ id: 'att-1', highPoint: 80, note: 'slipped off the lip' });
  });
});
