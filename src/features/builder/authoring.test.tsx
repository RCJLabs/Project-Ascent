// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { FIELDS } from '@/content/fields';
import { getProgram, loadPrograms } from '@/content/programs';
import type { ExerciseBlock, Program } from '@/content/types';
import { blankProgram, forkProgram } from '@/engine/customProgram';
import { newBlock, setPrescription } from '@/engine/prescription';
import { useCustomPrograms } from '@/store/programs';
import { hydrate, renderAt, reset } from '@/test/render';
import { BuilderPage } from './BuilderPage';
import { SessionEditorPage } from './SessionEditorPage';

/**
 * The builder can author what the catalogue is made of (PLAN.md M136).
 *
 * Counted before this: `perWeek` 0 in the builder against 5 blocks in the
 * catalogue, `circuit` 0 against 19, `constantDose` 0 against 8, `tracks` 0
 * against 3 programs, `mergedInto` 0 against 1, `fields` and `nextPrograms`
 * 0 against most of it. A forked Cruiser kept its circuits invisibly. These
 * drive each control and read the store back, because a control that
 * renders and writes nothing is the fault M126 named.
 */

const TWO_PHASES: Program['phases'] = [
  { id: 'a', name: 'Anvil', weekStart: 1, weekEnd: 4, description: '', goals: [] },
  { id: 'b', name: 'Hammer', weekStart: 5, weekEnd: 8, description: '', goals: [] },
];

/** A program with one working session type and one block, written by hand. */
function authored(block: (phases: Program['phases']) => ExerciseBlock, patch: Partial<Program> = {}): Program {
  const phases = patch.phases ?? TWO_PHASES;
  return {
    ...blankProgram('Mine'),
    id: 'custom_mine',
    weeks: 8,
    phases,
    sessionTypes: [
      { id: 'fp', name: 'Fingers', icon: '✋', description: '', intensity: 'hard', blocks: [block(phases)] },
      { id: 'rest', name: 'Rest', icon: '🔋', description: '', isRest: true },
    ],
    ...patch,
  };
}

const hangboard = (phases: Program['phases']): ExerciseBlock => {
  let block = newBlock('Hangboard', phases, []);
  for (const phase of phases) {
    block = setPrescription(block, phase.id, { exercises: [{ name: 'Max Hangs', sets: '3', hold: '7s' }] });
  }
  return block;
};

async function open(program: Program, typeId = 'fp'): Promise<void> {
  await loadPrograms();
  await reset();
  await useCustomPrograms.getState().save(program);
  await hydrate();
  renderAt(`/build/${program.id}/session/${typeId}`, <SessionEditorPage params={{ id: program.id, typeId }} />);
  await screen.findByRole('heading', { level: 1 });
}

const stored = (id = 'custom_mine') => useCustomPrograms.getState().custom.find((p) => p.id === id)!;
const block = (id = 'custom_mine') => stored(id).sessionTypes[0]!.blocks![0]!;
const type = (value: string) => ({ target: { value } });

describe('a block run as a circuit', () => {
  it('is written, with a round count to start from', async () => {
    await open(authored(hangboard));
    fireEvent.click(screen.getByText('Run as a circuit'));
    await waitFor(() => expect(block().perPhase['a']!.circuit).toEqual({ rounds: '3' }));
    expect(screen.getByText('Not a circuit')).toBeTruthy();
  });

  it('takes its four fields, and says whether the clock can run it', async () => {
    await open(authored((phases) => setPrescription(hangboard(phases), 'a', { circuit: { rounds: '3' } })));
    expect(screen.getByText(/The clock cannot run this one/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Circuit rounds'), type('2-3'));
    await waitFor(() => expect(block().perPhase['a']!.circuit?.rounds).toBe('2-3'));
    fireEvent.change(screen.getByLabelText('Circuit each'), type('45s'));
    await waitFor(() => expect(block().perPhase['a']!.circuit?.work).toBe('45s'));
    expect(await screen.findByText('The clock can run this one from the log.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Circuit each'), type(''));
    await waitFor(() => expect(block().perPhase['a']!.circuit).toEqual({ rounds: '2-3' }));
  });

  it('stops being one', async () => {
    await open(authored((phases) => setPrescription(hangboard(phases), 'a', { circuit: { rounds: '3' } })));
    fireEvent.click(screen.getByText('Not a circuit'));
    await waitFor(() => expect(block().perPhase['a']!.circuit).toBeUndefined());
  });
});

describe('the dose, week by week', () => {
  it('starts a step on the first free week of the phase', async () => {
    await open(authored(hangboard));
    fireEvent.click(screen.getByRole('button', { name: 'Week 2' }));
    await waitFor(() => expect(block().perPhase['a']!.perWeek).toEqual([{ week: 2, step: '' }]));
    expect(screen.getByRole('button', { name: 'Week 3' })).toBeTruthy();
  });

  it('takes the line and the numbers, and clears a number back out', async () => {
    await open(authored((phases) => setPrescription(hangboard(phases), 'a', { perWeek: [{ week: 2, step: '' }] })));
    fireEvent.change(screen.getByLabelText('Week 2 step'), type('Add a set if every hang held'));
    await waitFor(() => expect(block().perPhase['a']!.perWeek![0]!.step).toBe('Add a set if every hang held'));
    fireEvent.change(screen.getByLabelText('Week 2 Max Hangs sets'), type('4'));
    await waitFor(() => expect(block().perPhase['a']!.perWeek![0]!.dose).toEqual({ 'Max Hangs': { sets: '4' } }));
    fireEvent.change(screen.getByLabelText('Week 2 Max Hangs sets'), type(''));
    await waitFor(() => expect(block().perPhase['a']!.perWeek![0]!.dose).toBeUndefined());
  });

  it('shows the phase’s own dose where nothing has moved', async () => {
    await open(authored((phases) => setPrescription(hangboard(phases), 'a', { perWeek: [{ week: 2, step: 'More' }] })));
    expect((screen.getByLabelText('Week 2 Max Hangs sets') as HTMLInputElement).placeholder).toBe('3');
    expect((screen.getByLabelText('Week 2 Max Hangs hold') as HTMLInputElement).placeholder).toBe('7s');
  });

  it('moves a step to another week and takes it out again', async () => {
    await open(authored((phases) => setPrescription(hangboard(phases), 'a', { perWeek: [{ week: 2, step: 'More' }] })));
    fireEvent.change(screen.getByLabelText('Which week'), type('4'));
    await waitFor(() => expect(block().perPhase['a']!.perWeek).toEqual([{ week: 4, step: 'More' }]));
    fireEvent.click(screen.getByLabelText('Remove the week 4 step'));
    await waitFor(() => expect(block().perPhase['a']!.perWeek).toBeUndefined());
  });

  it('offers no week for a phase one week long', async () => {
    const one: Program['phases'] = [{ id: 'a', name: 'Only', weekStart: 1, weekEnd: 1, description: '', goals: [] }];
    await open(authored(hangboard, { weeks: 1, phases: one }));
    expect(screen.queryByText('Week by week')).toBeNull();
  });
});

describe('tracks on a line', () => {
  const tracked = authored(hangboard, { tracks: [{ id: 'a', name: 'Bodyweight', description: '' }, { id: 'b', name: 'Loaded', description: '' }] });

  it('puts an exercise on a track, and takes it off again', async () => {
    await open(tracked);
    fireEvent.change(screen.getByLabelText('Exercise 1 track'), type('b'));
    await waitFor(() => expect(block().perPhase['a']!.exercises[0]!.track).toBe('b'));
    fireEvent.change(screen.getByLabelText('Exercise 1 track'), type(''));
    await waitFor(() => expect(block().perPhase['a']!.exercises[0]!.track).toBeUndefined());
  });

  it('offers no track control on a program with no tracks', async () => {
    await open(authored(hangboard));
    expect(screen.queryByLabelText('Exercise 1 track')).toBeNull();
  });
});

describe('a block folded into another', () => {
  const two = authored(hangboard, {});
  two.sessionTypes[0]!.blocks!.push(newBlock('Pull', TWO_PHASES, two.sessionTypes[0]!.blocks!));

  it('is written for the phase, and its own list goes quiet', async () => {
    await open(two);
    fireEvent.change(screen.getByLabelText('Where Pull is done'), type('hangboard'));
    await waitFor(() => expect(block().perPhase['a']!.mergedInto).toBeUndefined());
    await waitFor(() => expect(stored().sessionTypes[0]!.blocks![1]!.perPhase['a']!.mergedInto).toBe('hangboard'));
    expect(screen.getByText(/Performed inside Hangboard these weeks/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Where Pull is done'), type(''));
    await waitFor(() => expect(stored().sessionTypes[0]!.blocks![1]!.perPhase['a']!.mergedInto).toBeUndefined());
  });

  it('is not offered when there is nothing to fold into', async () => {
    await open(authored(hangboard));
    expect(screen.queryByLabelText('Where Hangboard is done')).toBeNull();
  });
});

describe('a block that never changes', () => {
  it('is asked why, and keeps the answer', async () => {
    await open(authored(hangboard));
    expect(screen.getByText(/prescribes the same dose in every block of weeks/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Why Hangboard never changes'), type('The progression is the edge, not the dose.'));
    await waitFor(() => expect(block().constantDose).toBe('The progression is the edge, not the dose.'));
    fireEvent.change(screen.getByLabelText('Why Hangboard never changes'), type(' '));
    await waitFor(() => expect(block().constantDose).toBeUndefined());
    expect('constantDose' in block()).toBe(false);
  });

  it('is not asked when the dose moves', async () => {
    await open(authored((phases) => setPrescription(hangboard(phases), 'b', { exercises: [{ name: 'Max Hangs', sets: '5', hold: '7s' }] })));
    expect(screen.queryByLabelText('Why Hangboard never changes')).toBeNull();
  });

  it('is told when its reason has stopped being true', async () => {
    await open(
      authored((phases) => ({
        ...setPrescription(hangboard(phases), 'b', { exercises: [{ name: 'Max Hangs', sets: '5', hold: '7s' }] }),
        constantDose: 'Never moves.',
      })),
    );
    expect(screen.getByText(/says its dose never changes, and it does/)).toBeTruthy();
  });
});

describe('the questions at the end', () => {
  it('are chosen from what the log can ask, and written to the type', async () => {
    await open(authored(hangboard));
    fireEvent.click(screen.getByText('Pump'));
    await waitFor(() => expect(stored().sessionTypes[0]!.fields).toEqual(['pumpLevel']));
    fireEvent.click(screen.getByText('Attempts'));
    await waitFor(() => expect(stored().sessionTypes[0]!.fields).toEqual(['pumpLevel', 'attemptsToday']));
    fireEvent.click(screen.getByText('Pump'));
    await waitFor(() => expect(stored().sessionTypes[0]!.fields).toEqual(['attemptsToday']));
    fireEvent.click(screen.getByText('Attempts'));
    await waitFor(() => expect(stored().sessionTypes[0]!.fields).toBeUndefined());
  });

  /**
   * The registry decides, not a list here (PLAN.md M311).
   *
   * This asserted *Where* and *Style* were absent, which is exactly the two
   * ids `ASKABLE` excluded by hand — a test written from the code rather
   * than from the rule, and so unable to see the other four it should have
   * excluded. The rule is the two markers: `retired` is a question answered
   * better elsewhere, `alwaysAsked` is one the logger puts to every session
   * itself. Swept over the whole registry so a fifth of either lands on the
   * right side by saying so in the registry, which is the sentence
   * `quickFold.test.tsx` already makes about the logger.
   */
  it('offers nothing the app asks for itself, nor anything retired', async () => {
    await open(authored(hangboard));
    const elsewhere = Object.values(FIELDS).filter(
      (f) => f.retired !== undefined || f.alwaysAsked !== undefined,
    );
    expect(elsewhere.length, 'no marked fields to check').toBeGreaterThan(4);
    for (const spec of elsewhere) {
      expect(screen.queryByText(spec.label), `${spec.id} is offered`).toBeNull();
    }
    // And the ones a program does own are still there, so this is not
    // passing by rendering no chips at all.
    for (const label of ['Pump', 'Attempts', 'Pitches']) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
  });

  /**
   * And a question already chosen keeps its chip, whatever the rule now
   * says (PLAN.md M311).
   *
   * The builder offered *Time on the wall* until this milestone, so a
   * program saved before it can carry `sessionDuration` — and the logger
   * renders whatever `fields` names. Filtering the row alone would leave
   * that input on screen with no chip left to switch it off.
   */
  it('keeps a chip for a question this type already carries', async () => {
    const type = { id: 'fp', name: 'Fingers', icon: '✋', description: '', intensity: 'hard' as const };
    await open({
      ...authored(hangboard),
      sessionTypes: [{ ...type, fields: ['sessionDuration', 'pumpLevel'] }],
    });
    const chip = screen.getByText('Time on the wall');
    expect(chip).toBeTruthy();
    fireEvent.click(chip);
    await waitFor(() => expect(stored().sessionTypes[0]!.fields).toEqual(['pumpLevel']));
    // Gone once it is off: the row offers it because it was on, not because
    // it is offerable.
    await waitFor(() => expect(screen.queryByText('Time on the wall')).toBeNull());
  });
});

describe('what a fork already carried, now on screen', () => {
  it('shows the Cruiser’s circuit', async () => {
    await loadPrograms();
    const cruiser = { ...forkProgram(getProgram('the_cruiser')!, 'Cruise'), id: 'custom_cruise' };
    await open(cruiser, 'str');
    expect(screen.getAllByText(/^Circuit · /).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not a circuit').length).toBeGreaterThan(0);
  });

  it('shows Iron Grip’s week-two step in its own words', async () => {
    await loadPrograms();
    const grip = { ...forkProgram(getProgram('iron_grip')!, 'Grip'), id: 'custom_grip' };
    await open(grip, 'fp');
    const authoredStep = getProgram('iron_grip')!
      .sessionTypes.find((t) => t.id === 'fp')!
      .blocks!.find((b) => b.name === 'Finger Protocol')!.perPhase['anvil']!.perWeek!.find((w) => w.week === 2)!.step;
    expect((screen.getByLabelText('Week 2 step') as HTMLInputElement).value).toBe(authoredStep);
    // Two tracks, so every line has a track control.
    expect(screen.getAllByLabelText(/^Exercise \d+ track$/).length).toBeGreaterThan(0);
  });
});

describe('on the builder page', () => {
  async function openBuilder(program: Program): Promise<void> {
    await loadPrograms();
    await reset();
    await useCustomPrograms.getState().save(program);
    await hydrate();
    renderAt(`/build/${program.id}`, <BuilderPage params={{ id: program.id }} />);
    await screen.findByRole('heading', { level: 1 });
  }

  it('declares a track and takes it away again, lines and all', async () => {
    const program = authored((phases) => setPrescription(hangboard(phases), 'a', { exercises: [{ name: 'Max Hangs', sets: '3', track: 'loaded' }] }), {
      tracks: [{ id: 'loaded', name: 'Loaded', description: '' }],
    });
    await openBuilder(program);
    fireEvent.change(screen.getByLabelText('New track'), type('Bodyweight'));
    fireEvent.click(screen.getAllByRole('button', { name: /^Add$/ }).find((b) => b.closest('section')?.textContent?.includes('Tracks'))!);
    await waitFor(() => expect(stored().tracks?.map((t) => t.id)).toEqual(['loaded', 'bodyweight']));
    fireEvent.change(screen.getByLabelText('Track 2 description'), type('Nothing but you'));
    await waitFor(() => expect(stored().tracks![1]!.description).toBe('Nothing but you'));
    fireEvent.click(screen.getByLabelText('Remove Loaded'));
    await waitFor(() => expect(stored().tracks?.map((t) => t.id)).toEqual(['bodyweight']));
    expect(block().perPhase['a']!.exercises[0]!.track).toBeUndefined();
  });

  it('names what comes after, from the catalogue, with a reason', async () => {
    await openBuilder(authored(hangboard));
    fireEvent.change(screen.getByLabelText('Program that follows'), type('peak_performance'));
    fireEvent.click(screen.getAllByRole('button', { name: /^Add$/ }).find((b) => b.closest('section')?.textContent?.includes('What comes after'))!);
    await waitFor(() => expect(stored().nextPrograms).toEqual([{ id: 'peak_performance', reason: '' }]));
    // Said on the issue panel until a reason is written.
    expect(await screen.findByText(/gives no reason for "peak_performance"/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Why Peak Performance follows'), type('Express it.'));
    await waitFor(() => expect(stored().nextPrograms[0]!.reason).toBe('Express it.'));
    // Named once, it leaves the list of candidates.
    const options = [...(screen.getByLabelText('Program that follows') as HTMLSelectElement).options].map((o) => o.value);
    expect(options).not.toContain('peak_performance');
    fireEvent.click(screen.getByLabelText('Remove Peak Performance'));
    await waitFor(() => expect(stored().nextPrograms).toEqual([]));
  });

  it('raises the catalogue’s content rules on the author', async () => {
    await openBuilder(
      authored((phases) =>
        setPrescription(hangboard(phases), 'a', {
          perWeek: [{ week: 9, step: 'Beyond the phase' }],
          circuit: { rounds: '' },
        }),
      ),
    );
    expect(screen.getByText(/has a step for week 9, and the phase runs 4 weeks/)).toBeTruthy();
    expect(screen.getByText(/is a circuit with no number of rounds/)).toBeTruthy();
  });
});
