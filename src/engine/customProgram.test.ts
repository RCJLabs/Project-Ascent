import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import type { Program } from '@/content/types';
import {
  MAX_WEEKS,
  blankProgram,
  canRun,
  forkProgram,
  isCustomId,
  newProgramId,
  nextPhaseId,
  removeSessionType,
  retile,
  sessionTypeId,
  validateProgram,
} from './customProgram';

const errors = (p: Program) => validateProgram(p).filter((i) => i.level === 'error');
const messages = (p: Program) => validateProgram(p).map((i) => i.message);

/** The smallest thing that should be allowed to run. */
function runnable(): Program {
  return {
    ...blankProgram('Test'),
    subtitle: 'A test',
    intro: { pitch: 'Testing', rhythm: [], graduation: '' },
    sessionTypes: [
      { id: 'hard', name: 'Hard day', icon: '💪', description: '' },
      { id: 'rest', name: 'Rest', icon: '😴', description: '', isRest: true },
    ],
    recommendedLayout: { name: 'Week', description: '', slots: { 1: 'hard', 4: 'hard' } },
  };
}

describe('ids', () => {
  it('marks a written program as custom', () => {
    expect(isCustomId(newProgramId())).toBe(true);
    expect(isCustomId('iron_grip')).toBe(false);
  });

  it('does not hand out the same id twice', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newProgramId()));
    expect(ids.size).toBe(200);
  });
});

describe('a blank program', () => {
  it('is coherent from the first render, if incomplete', () => {
    const blank = blankProgram();
    // One thing missing, and it is the obvious one.
    expect(errors(blank).map((i) => i.field)).toEqual(['sessions']);
    expect(canRun(blank)).toBe(false);
  });

  it('covers its own length with one phase', () => {
    const blank = blankProgram();
    expect(errors(blank).some((i) => i.field === 'phases')).toBe(false);
  });
});

describe('phases must tile the program exactly', () => {
  const withPhases = (phases: Program['phases'], weeks = 8): Program => ({ ...runnable(), weeks, phases });

  it('accepts a clean tiling', () => {
    const p = withPhases([
      { id: 'a', name: 'A', weekStart: 1, weekEnd: 4, description: '', goals: [] },
      { id: 'b', name: 'B', weekStart: 5, weekEnd: 8, description: '', goals: [] },
    ]);
    expect(errors(p)).toEqual([]);
    expect(canRun(p)).toBe(true);
  });

  it('catches a gap in the middle', () => {
    const p = withPhases([
      { id: 'a', name: 'A', weekStart: 1, weekEnd: 3, description: '', goals: [] },
      { id: 'b', name: 'B', weekStart: 6, weekEnd: 8, description: '', goals: [] },
    ]);
    expect(messages(p).some((m) => /Nothing covers week 4–5/.test(m))).toBe(true);
  });

  it('catches an overlap', () => {
    const p = withPhases([
      { id: 'a', name: 'A', weekStart: 1, weekEnd: 5, description: '', goals: [] },
      { id: 'b', name: 'B', weekStart: 4, weekEnd: 8, description: '', goals: [] },
    ]);
    expect(messages(p).some((m) => /overlaps/.test(m))).toBe(true);
  });

  it('catches a short tiling and a long one', () => {
    const short = withPhases([{ id: 'a', name: 'A', weekStart: 1, weekEnd: 5, description: '', goals: [] }]);
    expect(messages(short).some((m) => /Nothing covers week 6–8/.test(m))).toBe(true);

    const long = withPhases([{ id: 'a', name: 'A', weekStart: 1, weekEnd: 12, description: '', goals: [] }]);
    expect(messages(long).some((m) => /runs past week 8/.test(m))).toBe(true);
  });

  it('catches a phase that ends before it starts', () => {
    const p = withPhases([{ id: 'a', name: 'A', weekStart: 5, weekEnd: 2, description: '', goals: [] }]);
    expect(messages(p).some((m) => /ends before it starts/.test(m))).toBe(true);
  });

  it('rejects a deload week outside the program', () => {
    expect(messages({ ...runnable(), deloadWeeks: [99] }).some((m) => /outside the program/.test(m))).toBe(true);
  });
});

describe('session types', () => {
  it('needs at least one', () => {
    const p = { ...runnable(), sessionTypes: [], recommendedLayout: undefined };
    expect(errors(p).some((i) => i.field === 'sessions')).toBe(true);
  });

  it('refuses a program that is only rest days', () => {
    const p: Program = {
      ...runnable(),
      sessionTypes: [{ id: 'rest', name: 'Rest', icon: '😴', description: '', isRest: true }],
      recommendedLayout: { name: 'Week', description: '', slots: {} },
    };
    expect(messages(p).some((m) => /only rest|Every session type is a rest day/.test(m))).toBe(true);
  });

  it('catches duplicate ids', () => {
    const p: Program = {
      ...runnable(),
      sessionTypes: [
        { id: 'hard', name: 'One', icon: '💪', description: '' },
        { id: 'hard', name: 'Two', icon: '🧗', description: '' },
      ],
    };
    expect(messages(p).some((m) => /share the id/.test(m))).toBe(true);
  });
});

describe('references that must resolve', () => {
  it('catches a layout naming a session type that does not exist', () => {
    const p: Program = {
      ...runnable(),
      recommendedLayout: { name: 'Week', description: '', slots: { 1: 'ghost' } },
    };
    expect(messages(p).some((m) => /"ghost"/.test(m))).toBe(true);
  });

  it('catches a constraint naming one that does not exist', () => {
    const p: Program = {
      ...runnable(),
      constraints: [{ kind: 'max-per-week', sessionTypeId: 'ghost', count: 2, note: '' }],
    };
    expect(messages(p).some((m) => /"ghost"/.test(m))).toBe(true);
  });

  it('catches a backwards sessions-per-week rule', () => {
    const p: Program = {
      ...runnable(),
      constraints: [{ kind: 'sessions-per-week', min: 5, max: 2, note: '' }],
    };
    expect(messages(p).some((m) => /minimum is above the maximum/.test(m))).toBe(true);
  });
});

// A builder that refuses to save until perfect is a builder nobody finishes.
describe('warnings do not stop a program running', () => {
  it('runs without a subtitle or a description', () => {
    const p: Program = { ...runnable(), subtitle: '', intro: { pitch: '', rhythm: [], graduation: '' } };
    expect(validateProgram(p).some((i) => i.level === 'warning')).toBe(true);
    expect(canRun(p)).toBe(true);
  });

  it('puts errors before warnings', () => {
    const p: Program = { ...runnable(), name: '', subtitle: '' };
    const levels = validateProgram(p).map((i) => i.level);
    expect(levels.indexOf('error')).toBeLessThan(levels.indexOf('warning'));
  });
});

describe('forking a shipped program', () => {
  const source = getProgram('iron_grip')!;

  it('keeps the content and takes a new identity', () => {
    const fork = forkProgram(source);
    expect(fork.id).not.toBe(source.id);
    expect(isCustomId(fork.id)).toBe(true);
    expect(fork.name).toBe('Iron Grip (mine)');
    expect(fork.sessionTypes).toHaveLength(source.sessionTypes.length);
    expect(fork.phases).toEqual(source.phases);
  });

  it('is a deep copy, so editing it cannot reach the original', () => {
    const fork = forkProgram(source);
    fork.phases[0]!.name = 'Changed';
    fork.sessionTypes[0]!.name = 'Changed';
    expect(source.phases[0]!.name).not.toBe('Changed');
    expect(source.sessionTypes[0]!.name).not.toBe('Changed');
  });

  // A fork is not the thing it came from: the graduation graph and the
  // prerequisites belonged to the original's place in the catalog.
  it('drops the progression graph and the entry requirements', () => {
    const fork = forkProgram(source);
    expect(fork.nextPrograms).toEqual([]);
    expect(fork.prerequisites).toBeUndefined();
  });

  it('produces something that still validates', () => {
    expect(canRun(forkProgram(source))).toBe(true);
  });
});

describe('editing helpers', () => {
  it('re-tiles phases across a new length without leaving a gap', () => {
    const phases = [
      { id: 'a', name: 'A', weekStart: 1, weekEnd: 4, description: '', goals: [] },
      { id: 'b', name: 'B', weekStart: 5, weekEnd: 8, description: '', goals: [] },
      { id: 'c', name: 'C', weekStart: 9, weekEnd: 12, description: '', goals: [] },
    ];
    const tiled = retile(phases, 10);
    expect(tiled[0]!.weekStart).toBe(1);
    expect(tiled.at(-1)!.weekEnd).toBe(10);
    for (let i = 1; i < tiled.length; i++) {
      expect(tiled[i]!.weekStart).toBe(tiled[i - 1]!.weekEnd + 1);
    }
  });

  it('drops phases that cannot fit a shorter program', () => {
    const phases = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, name: `P${i}`, weekStart: i + 1, weekEnd: i + 1, description: '', goals: [],
    }));
    const tiled = retile(phases, 2);
    expect(tiled).toHaveLength(2);
    expect(tiled.at(-1)!.weekEnd).toBe(2);
  });

  it('re-tiles to something that validates', () => {
    const p = { ...runnable(), weeks: 20, phases: retile(blankProgram().phases, 20) };
    expect(errors(p).some((i) => i.field === 'phases')).toBe(false);
  });

  it('never reuses a phase id', () => {
    const phases = [{ id: 'phase1', name: '', weekStart: 1, weekEnd: 1, description: '', goals: [] }];
    expect(nextPhaseId(phases)).not.toBe('phase1');
  });

  it('makes a readable session id and keeps it unique', () => {
    expect(sessionTypeId('Finger Power!', [])).toBe('finger_power');
    const existing = [{ id: 'finger_power', name: '', icon: '', description: '' }];
    expect(sessionTypeId('Finger Power', existing)).toBe('finger_power2');
    expect(sessionTypeId('   ', [])).toBe('session');
  });

  // Removing a session type must not leave dangling references behind, or
  // the program becomes unrunnable through no fault of the climber.
  it('takes its layout slots and rules with it', () => {
    const p: Program = {
      ...runnable(),
      constraints: [
        { kind: 'max-per-week', sessionTypeId: 'hard', count: 2, note: '' },
        { kind: 'sessions-per-week', min: 2, max: 4, note: '' },
      ],
    };
    const after = removeSessionType(p, 'hard');
    expect(after.sessionTypes.map((t) => t.id)).toEqual(['rest']);
    expect(after.recommendedLayout!.slots).toEqual({});
    expect(after.constraints).toHaveLength(1);
    expect(errors(after).some((i) => i.field === 'layout' || i.field === 'constraints')).toBe(false);
  });
});

describe('length bounds', () => {
  it('refuses zero weeks and refuses a decade', () => {
    expect(errors({ ...runnable(), weeks: 0 }).some((i) => i.field === 'weeks')).toBe(true);
    expect(errors({ ...runnable(), weeks: MAX_WEEKS + 1 }).some((i) => i.field === 'weeks')).toBe(true);
  });
});
