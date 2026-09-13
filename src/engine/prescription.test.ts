import { describe, expect, it } from 'vitest';
import type { ExerciseBlock, Phase, Program, SessionType, WeekStep } from '@/content/types';
import { blankProgram } from './customProgram';
import {
  blockId,
  contentIssues,
  copyPhase,
  copyPhaseToAll,
  describeBlock,
  flatAcrossPhases,
  newBlock,
  nextStepWeek,
  phaseLength,
  phasePrescription,
  prescriptionLine,
  reconcilePhases,
  reconcileProgramPhases,
  setPrescription,
  trimDrills,
  withStep,
  withStepDose,
  withoutStep,
} from './prescription';

const phases: Phase[] = [
  { id: 'a', name: 'Anvil', weekStart: 1, weekEnd: 4, description: '', goals: [] },
  { id: 'b', name: 'Hammer', weekStart: 5, weekEnd: 8, description: '', goals: [] },
];

function program(patch: Partial<Program> = {}): Program {
  return {
    ...blankProgram('Test'),
    weeks: 8,
    phases,
    sessionTypes: [{ id: 'fp', name: 'Finger power', icon: '✋', description: '' }],
    ...patch,
  };
}

describe('creating a block', () => {
  // A block with no entry for a phase silently prescribes nothing for those
  // weeks, which is a hole rather than a default.
  it('covers every phase from the start', () => {
    const block = newBlock('Hangboard', phases, []);
    expect(Object.keys(block.perPhase).sort()).toEqual(['a', 'b']);
  });

  it('makes a readable id and keeps it unique', () => {
    expect(newBlock('Max Hangs!', phases, []).id).toBe('max_hangs');
    expect(blockId('Max Hangs', [{ id: 'max_hangs', name: '', perPhase: {} }])).toBe('max_hangs2');
    expect(blockId('   ', [])).toBe('block');
  });
});

describe('editing one phase at a time', () => {
  const block = newBlock('Hangboard', phases, []);

  it('reads an empty prescription rather than undefined', () => {
    expect(phasePrescription(block, 'nope')).toEqual({ rationale: '', exercises: [] });
  });

  it('writes only the phase it was given', () => {
    const next = setPrescription(block, 'a', { rationale: 'Build capacity' });
    expect(next.perPhase['a']!.rationale).toBe('Build capacity');
    expect(next.perPhase['b']!.rationale).toBe('');
  });

  it('does not mutate the block it was given', () => {
    setPrescription(block, 'a', { rationale: 'Changed' });
    expect(block.perPhase['a']!.rationale).toBe('');
  });
});

describe('copying a phase', () => {
  const written = setPrescription(newBlock('Hangboard', phases, []), 'a', {
    rationale: 'Repeaters',
    exercises: [{ name: '7/3 Repeaters', sets: '6' }],
  });

  it('copies onto another phase', () => {
    const next = copyPhase(written, 'a', 'b');
    expect(next.perPhase['b']!.exercises[0]!.name).toBe('7/3 Repeaters');
  });

  // A shallow copy would make editing one phase change the other, which is
  // the opposite of what periodisation is for.
  it('copies deeply, so the phases diverge afterwards', () => {
    const next = copyPhase(written, 'a', 'b');
    next.perPhase['b']!.exercises[0]!.name = 'Max hangs';
    expect(next.perPhase['a']!.exercises[0]!.name).toBe('7/3 Repeaters');
  });

  it('is a no-op onto itself', () => {
    expect(copyPhase(written, 'a', 'a')).toBe(written);
  });

  it('can fill every phase at once', () => {
    const three = [...phases, { id: 'c', name: 'Spark', weekStart: 9, weekEnd: 12, description: '', goals: [] }];
    const next = copyPhaseToAll(newBlock('B', three, []), 'a', three);
    expect(Object.keys(next.perPhase)).toHaveLength(3);
  });
});

describe('keeping up with the program’s phases', () => {
  const written = setPrescription(newBlock('Hangboard', phases, []), 'b', {
    exercises: [{ name: 'Max hangs' }],
  });

  // Adding a block of weeks usually means "like the one before, then I will
  // change it" — starting from blank makes the builder retype everything.
  it('gives a new phase the nearest earlier prescription', () => {
    const withThird: Phase[] = [...phases, { id: 'c', name: 'Spark', weekStart: 9, weekEnd: 12, description: '', goals: [] }];
    const next = reconcilePhases(written, withThird);
    expect(next.perPhase['c']!.exercises[0]!.name).toBe('Max hangs');
  });

  it('gives the first phase a blank one when there is nothing before it', () => {
    const bare: ExerciseBlock = { id: 'x', name: 'X', perPhase: {} };
    expect(reconcilePhases(bare, phases).perPhase['a']!.exercises).toEqual([]);
  });

  it('drops entries for phases that no longer exist', () => {
    const next = reconcilePhases(written, [phases[0]!]);
    expect(Object.keys(next.perPhase)).toEqual(['a']);
  });

  it('keeps what is already written for a phase that survives', () => {
    const next = reconcilePhases(written, phases);
    expect(next.perPhase['b']!.exercises[0]!.name).toBe('Max hangs');
  });

  it('walks phases in week order, not key order', () => {
    const reversed = [phases[1]!, phases[0]!];
    const bare: ExerciseBlock = { id: 'x', name: 'X', perPhase: { b: { rationale: 'late', exercises: [{ name: 'L' }] } } };
    // 'a' comes first by week, so it must not inherit from 'b'.
    expect(reconcilePhases(bare, reversed).perPhase['a']!.exercises).toEqual([]);
  });

  it('applies across a whole program', () => {
    const p = program({
      sessionTypes: [{ id: 'fp', name: 'Finger power', icon: '✋', description: '', blocks: [written] }],
    });
    const next = reconcileProgramPhases(p);
    expect(Object.keys(next.sessionTypes[0]!.blocks![0]!.perPhase).sort()).toEqual(['a', 'b']);
  });

  it('leaves session types with no blocks alone', () => {
    expect(reconcileProgramPhases(program()).sessionTypes[0]!.blocks).toBeUndefined();
  });
});

describe('drills by week', () => {
  const type: SessionType = {
    id: 'fp', name: 'Finger power', icon: '✋', description: '',
    drillsByWeek: { 1: 'd1', 8: 'd2', 20: 'd3' },
  };

  it('drops assignments past the end of the program', () => {
    expect(Object.keys(trimDrills(type, 8).drillsByWeek!)).toEqual(['1', '8']);
  });

  it('leaves a type with no drills alone', () => {
    const bare: SessionType = { id: 'x', name: 'X', icon: '', description: '' };
    expect(trimDrills(bare, 8)).toBe(bare);
  });
});

describe('what the builder reports about contents', () => {
  // A program whose sessions have no written prescription is thin, not
  // broken. Plenty of real training is "climb hard for ninety minutes".
  it('treats an unwritten prescription as a warning, never an error', () => {
    const p = program({
      sessionTypes: [
        { id: 'fp', name: 'Finger power', icon: '✋', description: '', blocks: [newBlock('Hangboard', phases, [])] },
      ],
    });
    const issues = contentIssues(p);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.level === 'warning')).toBe(true);
  });

  it('says which phase is empty, by name', () => {
    const p = program({
      sessionTypes: [
        { id: 'fp', name: 'Finger power', icon: '✋', description: '', blocks: [newBlock('Hangboard', phases, [])] },
      ],
    });
    expect(contentIssues(p).some((i) => i.message.includes('Anvil'))).toBe(true);
  });

  it('ignores rest days, which prescribe nothing by design', () => {
    const p = program({
      sessionTypes: [{ id: 'rest', name: 'Rest', icon: '😴', description: '', isRest: true, blocks: [newBlock('X', phases, [])] }],
    });
    expect(contentIssues(p)).toEqual([]);
  });

  it('catches a menu asking for more than it offers', () => {
    let block = newBlock('Core', phases, []);
    block = setPrescription(block, 'a', { exercises: [{ name: 'Plank' }], selection: { pick: 3 } });
    const p = program({
      sessionTypes: [{ id: 'fp', name: 'Finger power', icon: '✋', description: '', blocks: [block] }],
    });
    expect(contentIssues(p).some((i) => /asks for 3 of 1/.test(i.message))).toBe(true);
  });

  it('errors on a drill outside the program', () => {
    const p = program({
      sessionTypes: [{ id: 'fp', name: 'Finger power', icon: '✋', description: '', drillsByWeek: { 20: 'd' } }],
    });
    expect(contentIssues(p).some((i) => i.level === 'error')).toBe(true);
  });
});

describe('summarising a block', () => {
  it('names the first few exercises', () => {
    let block = newBlock('Core', phases, []);
    block = setPrescription(block, 'a', {
      exercises: [{ name: 'Plank' }, { name: 'Hollow' }, { name: 'Lever' }, { name: 'Raises' }],
    });
    expect(describeBlock(block, 'a')).toBe('Plank, Hollow, Lever +1');
  });

  it('leads with the pick count when it is a menu', () => {
    let block = newBlock('Core', phases, []);
    block = setPrescription(block, 'a', { exercises: [{ name: 'Plank' }], selection: { pick: 1 } });
    expect(describeBlock(block, 'a')).toBe('Pick 1 · Plank');
  });

  it('says when nothing is prescribed, and when it is folded elsewhere', () => {
    const block = newBlock('Core', phases, []);
    expect(describeBlock(block, 'a')).toBe('Nothing prescribed');
    expect(describeBlock(setPrescription(block, 'a', { mergedInto: 'Push' }), 'a')).toBe('Folded into Push');
  });
});

/**
 * How a block is meant to be run, said out loud (PLAN.md M90).
 *
 * The logger had the selection rule and the circuit format in hand and
 * rendered neither, so a menu of six with "pick one" written on it arrived
 * as a checklist of six.
 */
describe('the line that says how to run a block', () => {
  it('says how many of the list to pick', () => {
    expect(prescriptionLine({ pick: 1 }, undefined, 6)).toBe('Pick 1 of 6');
  });

  // The pool is what the climber can see. A track filter removes rows, and
  // "Pick 1 of 6" above four of them is worse than saying nothing.
  it('counts the rows actually on screen', () => {
    expect(prescriptionLine({ pick: 1 }, undefined, 4)).toBe('Pick 1 of 4');
  });

  it('lays out a circuit', () => {
    expect(
      prescriptionLine(undefined, { rounds: '3', work: '30s', restBetween: '15s', restBetweenRounds: '2 min' }, 5),
    ).toBe('30s each · 15s rest · 3 rounds · 2 min between rounds');
  });

  it('agrees with itself about one round', () => {
    expect(prescriptionLine(undefined, { rounds: '1' }, 3)).toBe('1 round');
    expect(prescriptionLine(undefined, { rounds: '2' }, 3)).toBe('2 rounds');
  });

  // A block can be both, and the two facts are independent.
  it('says both when a block is a menu run in rounds', () => {
    expect(prescriptionLine({ pick: 3 }, { rounds: '4' }, 9)).toBe('Pick 3 of 9 · 4 rounds');
  });

  // Most blocks are a plain list of everything. A line saying nothing is
  // worse than no line: it makes the ones that mean something ordinary.
  it('says nothing about a block that is just its list', () => {
    expect(prescriptionLine(undefined, undefined, 4)).toBe('');
  });
});

/**
 * Everything else a block can say (PLAN.md M136).
 *
 * The editor offered a name, five dose fields and *pick N of*; the catalogue
 * runs circuits, moves its dose week by week, says why a block never moves,
 * folds one block into another and puts lines on tracks. These hold the
 * helpers the editor writes through and the warnings the builder raises,
 * which are the catalogue's own content rules, applied to the author.
 */
describe('a block that never changes', () => {
  const same = { name: 'Max Hangs', sets: '5', hold: '7s' };
  const flatBlock = () => {
    let block = newBlock('Hangboard', phases, []);
    block = setPrescription(block, 'a', { exercises: [same] });
    return setPrescription(block, 'b', { exercises: [{ ...same }] });
  };

  it('is flat when every phase asks the same dose', () => {
    expect(flatAcrossPhases(flatBlock(), phases)).toBe(true);
  });

  it('is not flat once a number moves', () => {
    const moved = setPrescription(flatBlock(), 'b', { exercises: [{ ...same, sets: '6' }] });
    expect(flatAcrossPhases(moved, phases)).toBe(false);
  });

  it('is not flat when only the words change', () => {
    // Dose and only dose: rewording a rationale is not progressing a block.
    const reworded = setPrescription(flatBlock(), 'b', { rationale: 'Now with feeling' });
    expect(flatAcrossPhases(reworded, phases)).toBe(true);
  });

  it('is not flat when a later week moves it', () => {
    const stepped = setPrescription(flatBlock(), 'b', {
      perWeek: [{ week: 2, step: 'Add a set', dose: { 'Max Hangs': { sets: '6' } } }],
    });
    expect(flatAcrossPhases(stepped, phases)).toBe(false);
  });

  it('is empty rather than flat when nothing is written anywhere', () => {
    expect(flatAcrossPhases(newBlock('Hangboard', phases, []), phases)).toBe(false);
  });

  it('is never flat over a single phase', () => {
    expect(flatAcrossPhases(flatBlock(), [phases[0]!])).toBe(false);
  });

  it('is asked for a reason, and told when the reason has stopped being true', () => {
    const silent = program({
      sessionTypes: [{ id: 'fp', name: 'Finger power', icon: '✋', description: '', blocks: [flatBlock()] }],
    });
    expect(contentIssues(silent).map((i) => i.message)).toContain(
      'Finger power · Hangboard prescribes the same dose in every block of weeks. Say why, or change one.',
    );
    const lying = program({
      sessionTypes: [
        {
          id: 'fp',
          name: 'Finger power',
          icon: '✋',
          description: '',
          blocks: [{ ...setPrescription(flatBlock(), 'b', { exercises: [{ ...same, sets: '6' }] }), constantDose: 'Never moves.' }],
        },
      ],
    });
    expect(contentIssues(lying).map((i) => i.message)).toContain(
      'Finger power · Hangboard says its dose never changes, and it does.',
    );
    const honest = program({
      sessionTypes: [{ id: 'fp', name: 'Finger power', icon: '✋', description: '', blocks: [{ ...flatBlock(), constantDose: 'The progression is grade, not dose.' }] }],
    });
    expect(contentIssues(honest).map((i) => i.message).filter((m) => /never changes|Say why/.test(m))).toEqual([]);
  });
});

describe('week by week', () => {
  const base = [{ name: 'Max Hangs', sets: '3', hold: '7s' }, { name: 'Pull-ups', sets: '3', reps: '5' }];

  it('writes a step into its week, in order, replacing one already there', () => {
    const steps = withStep(withStep(undefined, { week: 3, step: 'Three' }), { week: 2, step: 'Two' });
    expect(steps.map((s) => s.week)).toEqual([2, 3]);
    expect(withStep(steps, { week: 3, step: 'Three again' }).map((s) => s.step)).toEqual(['Two', 'Three again']);
  });

  it('takes a step out, and leaves nothing rather than an empty list', () => {
    const steps = withStep(undefined, { week: 2, step: 'Two' });
    expect(withoutStep(steps, 2)).toBeUndefined();
    expect(withoutStep(withStep(steps, { week: 3, step: 'Three' }), 2)?.map((s) => s.week)).toEqual([3]);
  });

  it('moves one number on one exercise, and clears it again', () => {
    const step: WeekStep = { week: 2, step: 'More' };
    const moved = withStepDose(step, 'Max Hangs', 'sets', '4');
    expect(moved.dose).toEqual({ 'Max Hangs': { sets: '4' } });
    const both = withStepDose(moved, 'Max Hangs', 'hold', '10s');
    expect(both.dose).toEqual({ 'Max Hangs': { sets: '4', hold: '10s' } });
    const back = withStepDose(withStepDose(both, 'Max Hangs', 'sets', ''), 'Max Hangs', 'hold', '  ');
    // Nothing left to say about the exercise, so the step says nothing.
    expect(back.dose).toBeUndefined();
    expect(back).toEqual({ week: 2, step: 'More' });
  });

  it('offers the first week of the phase without a step', () => {
    expect(nextStepWeek(undefined, 4)).toBe(2);
    expect(nextStepWeek([{ week: 2, step: 'x' }], 4)).toBe(3);
    expect(nextStepWeek([{ week: 2, step: 'x' }, { week: 3, step: 'y' }, { week: 4, step: 'z' }], 4)).toBeNull();
    // A one-week phase has no later week.
    expect(nextStepWeek(undefined, 1)).toBeNull();
  });

  it('measures a phase in weeks', () => {
    expect(phaseLength(phases[0]!)).toBe(4);
    expect(phaseLength({ weekStart: 5, weekEnd: 5 })).toBe(1);
  });

  const withSteps = (perWeek: WeekStep[]) =>
    program({
      sessionTypes: [
        {
          id: 'fp',
          name: 'Finger power',
          icon: '✋',
          description: '',
          blocks: [setPrescription(newBlock('Hangboard', phases, []), 'a', { exercises: base, perWeek })],
        },
      ],
    });
  const said = (perWeek: WeekStep[]) => contentIssues(withSteps(perWeek)).map((i) => i.message);

  it('warns about a step the phase has no week for', () => {
    expect(said([{ week: 5, step: 'Beyond the Anvil' }])).toContain(
      'Finger power · Hangboard (Anvil) has a step for week 5, and the phase runs 4 weeks — it never applies.',
    );
    expect(said([{ week: 1, step: 'Week one is the list' }]).some((m) => /never applies/.test(m))).toBe(true);
  });

  it('warns about two steps for one week', () => {
    expect(said([{ week: 2, step: 'A' }, { week: 2, step: 'B' }])).toContain(
      'Finger power · Hangboard (Anvil) has two steps for week 2.',
    );
  });

  it('warns about a step with nothing written on it', () => {
    expect(said([{ week: 2, step: '  ', dose: { 'Max Hangs': { sets: '4' } } }])).toContain(
      'Finger power · Hangboard (Anvil) week 2 changes the dose without a line saying what it asks.',
    );
  });

  it('warns about a dose on an exercise the phase does not have', () => {
    expect(said([{ week: 2, step: 'More', dose: { 'Campus': { sets: '4' } } }])).toContain(
      'Finger power · Hangboard (Anvil) week 2 moves "Campus", which is not in the block that phase.',
    );
  });

  it('warns about a dose that restates the phase', () => {
    expect(said([{ week: 2, step: 'More', dose: { 'Max Hangs': { sets: '3' } } }])).toContain(
      'Finger power · Hangboard (Anvil) week 2 restates Max Hangs and changes nothing.',
    );
  });

  it('says nothing about a step that is in order', () => {
    const fine = said([{ week: 2, step: 'Add a set if last week held', dose: { 'Max Hangs': { sets: '4' } } }]);
    expect(fine.filter((m) => /week 2/.test(m))).toEqual([]);
  });
});

describe('circuits, folds and tracks', () => {
  const typed = (block: ExerciseBlock, tracks?: Program['tracks']) =>
    contentIssues(
      program({
        ...(tracks ? { tracks } : {}),
        sessionTypes: [
          {
            id: 'fp',
            name: 'Finger power',
            icon: '✋',
            description: '',
            blocks: [block, newBlock('Pull', phases, [block])],
          },
        ],
      }),
    ).map((i) => i.message);

  it('warns about a circuit with no rounds', () => {
    const block = setPrescription(newBlock('Core', phases, []), 'a', {
      exercises: [{ name: 'Plank' }],
      circuit: { rounds: ' ' },
    });
    expect(typed(block)).toContain('Finger power · Core (Anvil) is a circuit with no number of rounds.');
  });

  it('warns about a block folded into itself or into nothing', () => {
    const self = setPrescription(newBlock('Core', phases, []), 'a', { mergedInto: 'core' });
    expect(typed(self)).toContain('Finger power · Core (Anvil) is folded into itself.');
    const ghost = setPrescription(newBlock('Core', phases, []), 'a', { mergedInto: 'legs' });
    expect(typed(ghost)).toContain(
      'Finger power · Core (Anvil) is folded into "legs", which is not a block in Finger power.',
    );
  });

  it('accepts a fold into a block that exists, and does not call it empty', () => {
    const folded = setPrescription(newBlock('Core', phases, []), 'a', { mergedInto: 'pull' });
    const said = typed(folded);
    expect(said.filter((m) => /folded/.test(m))).toEqual([]);
    expect(said.filter((m) => /Core: nothing prescribed for Anvil/.test(m))).toEqual([]);
  });

  it('warns about an exercise on a track the program does not declare', () => {
    const block = setPrescription(newBlock('Core', phases, []), 'a', { exercises: [{ name: 'Plank', track: 'B' }] });
    expect(typed(block, [{ id: 'A', name: 'Bodyweight', description: '' }])).toContain(
      'Finger power · Core (Anvil): Plank is on track "B", which this program does not declare.',
    );
    expect(typed(block, [{ id: 'B', name: 'Loaded', description: '' }]).filter((m) => /track/.test(m))).toEqual([]);
  });
});
