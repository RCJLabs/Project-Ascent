// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getProgram, loadPrograms } from '@/content/programs';
import type { Program } from '@/content/types';
import { forkProgram } from '@/engine/customProgram';
import { buildProgramFile } from '@/engine/programFile';
import { useCustomPrograms } from '@/store/programs';
import { hydrate, renderAt, reset } from '@/test/render';
import { APP_VERSION } from '@/version';
import { BuilderList } from './BuilderList';
import { BuilderPage } from './BuilderPage';

/**
 * The reply, read by the athlete it was written for (PLAN.md M333).
 *
 * M322 let a coach answer an athlete's block with a program, and the athlete
 * then opened twelve weeks of it with nothing saying which parts were the
 * coach's. These hold what the builder now says above it — for the athlete
 * who opens it and the coach still writing it alike.
 */

async function open(program: Program): Promise<void> {
  await loadPrograms();
  await reset();
  await useCustomPrograms.getState().save(program);
  await hydrate();
  renderAt(`/build/${program.id}`, <BuilderPage params={{ id: program.id }} />);
}

const reply = (): Program => forkProgram(getProgram('iron_grip')!, 'Iron Grip (revised)');
/** The changes card's own list items, not the rest of the page's. */
const changeLines = () =>
  within(screen.getByRole('heading', { name: 'Changed from Iron Grip' }).closest('section')!).queryAllByRole('listitem');

describe('what a copy changed', () => {
  it('says so when nothing has, yet', async () => {
    await open(reply());
    expect(await screen.findByText('Nothing yet — this is still Iron Grip as the app ships it.')).toBeTruthy();
  });

  it('lists the changes, under where they are, and whose they are', async () => {
    const p = reply();
    p.author = 'Sam';
    p.weeks = 10;
    p.phases = p.phases.map((ph) =>
      ph.id === 'hammer' ? { ...ph, weekEnd: 7 } : ph.id === 'spark' ? { ...ph, weekStart: 8, weekEnd: 10 } : ph,
    );
    await open(p);
    expect(await screen.findByText('3 changes by Sam to Iron Grip as the app ships it.')).toBeTruthy();
    expect(screen.getByText('12 weeks → 10')).toBeTruthy();
    expect(screen.getByText('The Hammer (Max Hangs): weeks 5–8 → weeks 5–7')).toBeTruthy();
    expect(screen.getByText('Length')).toBeTruthy();
    expect(screen.getByText('Phases')).toBeTruthy();
  });

  it('is not there for a program written from nothing', async () => {
    const p = reply();
    delete p.forkedFrom;
    await open(p);
    await screen.findByText('Share it');
    expect(screen.queryByText(/Changed from/)).toBeNull();
  });

  it('says there is nothing to compare with when this app lacks the original', async () => {
    const p = reply();
    p.forkedFrom = { id: 'retired_program', name: 'Old Faithful', version: APP_VERSION };
    await open(p);
    expect(await screen.findByText(/which this version of the app does not have/)).toBeTruthy();
  });

  it('says when the copy was made by another version, and not otherwise', async () => {
    const other = reply();
    other.forkedFrom = { ...other.forkedFrom!, version: '0.0.1' };
    await open(other);
    expect(await screen.findByText(/Copied in version 0\.0\.1; this app is/)).toBeTruthy();

    await open(reply());
    await screen.findByText(/Nothing yet/);
    expect(screen.queryByText(/Copied in version/)).toBeNull();
  });

  it('shows the first dozen and the rest behind a tap', async () => {
    const p = reply();
    // Every day of the week moved: seven changes, and five more to the rules.
    p.recommendedLayout = { name: 'Other', description: '', slots: { 0: 'fp', 2: 'fp', 5: 'perf' } };
    p.assessments = [];
    await open(p);
    const all = Number(/^(\d+) changes/.exec((await screen.findByText(/changes to Iron Grip/)).textContent!)![1]);
    expect(all).toBeGreaterThan(12);
    expect(changeLines()).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: `Show all ${all}` }));
    await screen.findByRole('button', { name: 'Show fewer' });
    expect(changeLines()).toHaveLength(all);
  });
});

describe('the athlete opening what the coach sent', () => {
  it('lands on the program, with the coach’s changes above it', async () => {
    // The coach's side: a copy of what the athlete ran, one set taken off.
    const coach = reply();
    coach.author = 'Sam';
    const anvil = coach.sessionTypes.find((t) => t.id === 'fp')!.blocks!.find((b) => b.id === 'finger_protocol')!
      .perPhase['anvil']!;
    anvil.exercises[0] = { ...anvil.exercises[0]!, sets: '3' };
    const file = new File([JSON.stringify(buildProgramFile(coach))], 'reply.json', { type: 'application/json' });

    // The athlete's side, which has never seen this program.
    await loadPrograms();
    await reset();
    await hydrate();
    const list = renderAt('/build', <BuilderList />);
    const input = list.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(useCustomPrograms.getState().custom.map((p) => p.name)).toContain('Iron Grip (revised)'));
    const arrived = useCustomPrograms.getState().custom.find((p) => p.name === 'Iron Grip (revised)')!;
    await waitFor(() => expect(window.location.hash).toBe(`#/build/${arrived.id}`));

    renderAt(window.location.hash, <BuilderPage params={{ id: arrived.id }} />);
    expect(await screen.findByText('1 change by Sam to Iron Grip as the app ships it.')).toBeTruthy();
    expect(
      screen.getByText('7/3 Repeaters: sets 3-5 → 3 — Finger Protocol, The Anvil (Repeaters)'),
    ).toBeTruthy();
  });
});
