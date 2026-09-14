// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import type { ExerciseBlock, Program } from '@/content/types';
import { blankProgram } from '@/engine/customProgram';
import { newBlock, setPrescription } from '@/engine/prescription';
import { useCustomPrograms } from '@/store/programs';
import { hydrate, renderAt, reset } from '@/test/render';
import { BuilderPage } from './BuilderPage';

/**
 * The safety notes reach the builder's panel, and read differently there
 * (PLAN.md M167).
 *
 * The rules are tested as a function in `engine/programSafety.test.ts`. This
 * is the other half, and the half M161's battery caught missing twice: a
 * check that is imported but never rendered passes every name-based test
 * while the climber sees nothing.
 */

const PHASES: Program['phases'] = [
  { id: 'a', name: 'Anvil', weekStart: 1, weekEnd: 6, description: '', goals: [] },
  { id: 'b', name: 'Hammer', weekStart: 7, weekEnd: 12, description: '', goals: [] },
];

const hangboard = (phases: Program['phases']): ExerciseBlock => {
  let block = newBlock('Hangboard', phases, []);
  for (const phase of phases) {
    block = setPrescription(block, phase.id, { exercises: [{ name: 'Max Hangs', sets: '3', hold: '7s' }] });
  }
  return block;
};

/** Twelve weeks of fingerboarding, no gap, no rest type, no deload. */
function reckless(patch: Partial<Program> = {}): Program {
  return {
    ...blankProgram('Mine'),
    id: 'custom_mine',
    weeks: 12,
    phases: PHASES,
    deloadWeeks: [],
    sessionTypes: [
      { id: 'fp', name: 'Fingers', icon: '✋', description: '', intensity: 'hard', blocks: [hangboard(PHASES)] },
    ],
    constraints: [],
    ...patch,
  };
}

async function open(program: Program): Promise<void> {
  await loadPrograms();
  await reset();
  await useCustomPrograms.getState().save(program);
  await hydrate();
  renderAt(`/build/${program.id}`, <BuilderPage params={{ id: program.id }} />);
  await screen.findByRole('heading', { level: 1 });
}

/** The issue list itself — the panel heads either "Ready to run, with
 *  notes" or "Finish these before you can run it", depending. */
const panel = (): HTMLElement =>
  (screen.getByText(/Ready to run, with notes|Finish these before/i).closest('div') as HTMLElement) ??
  document.body;

describe('the builder says what a coach would', () => {
  it('names all three on a program that trips all three', async () => {
    await open(reckless());
    const text = document.body.textContent ?? '';
    expect(text, 'no gap warning').toMatch(/nothing sets a gap between sessions/);
    expect(text, 'no rest warning').toMatch(/No rest session type/);
    expect(text, 'no deload warning').toMatch(/no deload week/);
  });

  it('says nothing about a sound one', async () => {
    await open(
      reckless({
        deloadWeeks: [4, 8],
        sessionTypes: [
          { id: 'fp', name: 'Fingers', icon: '✋', description: '', intensity: 'hard', blocks: [hangboard(PHASES)] },
          { id: 'rest', name: 'Rest', icon: '🔋', description: '', isRest: true },
        ],
        constraints: [{ kind: 'min-gap-hours', between: ['fp'], hours: 48, note: '48 hours between finger days.' }],
      }),
    );
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/nothing sets a gap/);
    expect(text).not.toMatch(/No rest session type/);
    expect(text).not.toMatch(/no deload week/);
  });

  /**
   * Above the structural nits, not mixed in with them. Showing *"no
   * recommended week"* and *"no rest day in the week"* with the same grey
   * icon is how the second stops being read — which is why `safety` is its
   * own level rather than a `warning`.
   *
   * Read off the icons rather than the words, because the icon is the
   * ranking: `text-danger` a fault, `text-warn` a safety note, `text-ink-soft`
   * a nit. The list must be in that order with nothing interleaved — and a
   * blank program's *"No recommended week, so the planner starts blank"*
   * comes out of `validateProgram`, which is **ahead** of the safety notes in
   * the unsorted array. So the sort is what puts them right, and dropping it
   * fails here.
   */
  const RANK: Record<string, number> = { 'text-danger': 0, 'text-warn': 1, 'text-ink-soft': 2 };

  /** Each note in the panel as the rank its icon gives it. */
  const ranks = (): number[] =>
    [...panel().querySelectorAll('li')].map((li) => {
      const icon = li.firstElementChild;
      const hit = Object.entries(RANK).find(([cls]) => icon?.classList.contains(cls));
      return hit ? hit[1] : -1;
    });

  it('puts the safety notes above the nits and below the faults', async () => {
    await open(reckless());
    const order = ranks();
    expect(order, 'a note with no icon this can rank').not.toContain(-1);
    expect(order, 'no safety note in the panel at all').toContain(RANK['text-warn']);
    expect(order, 'no nit to sort below, so this proves nothing').toContain(RANK['text-ink-soft']);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('marks them apart from a nit rather than sharing its icon', async () => {
    await open(reckless());
    const gap = [...panel().querySelectorAll('li')].find((li) =>
      /gap between sessions/i.test(li.textContent ?? ''),
    );
    expect(gap, 'the gap note is not in the panel').toBeTruthy();
    expect(gap!.querySelector('.text-warn'), 'it carries the grey nit icon').toBeTruthy();
  });

  /**
   * And none of it blocks. A coach writing a deliberately brutal block for
   * themselves is allowed to — the app's job is to be sure they meant it.
   */
  it('still lets the program be run', async () => {
    await open(reckless({ constraints: [{ kind: 'sessions-per-week', min: 3, max: 4, note: '' }] }));
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/nothing sets a gap between sessions/);
    // The panel heads "Ready to run, with notes" when nothing is an error.
    expect(text).toMatch(/Ready to run, with notes/i);
  });
});
