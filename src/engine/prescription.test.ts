import { describe, expect, it } from 'vitest';
import type { ExerciseBlock, Phase, Program, SessionType } from '@/content/types';
import { blankProgram } from './customProgram';
import {
  blockId,
  contentIssues,
  copyPhase,
  copyPhaseToAll,
  describeBlock,
  newBlock,
  phasePrescription,
  reconcilePhases,
  reconcileProgramPhases,
  setPrescription,
  trimDrills,
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
