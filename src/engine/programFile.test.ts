import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import { canRun, forkProgram, isCustomId, validateProgram } from './customProgram';
import {
  LIMITS,
  ProgramFileError,
  buildProgramFile,
  fileName,
  parseProgramFile,
} from './programFile';

const source = getProgram('iron_grip')!;
const wrap = (program: unknown) =>
  JSON.stringify({ app: 'project-ascent', kind: 'program', schemaVersion: 1, program });

describe('a round trip', () => {
  const file = buildProgramFile(forkProgram(source, 'Shared Grip'));
  const { program, dropped } = parseProgramFile(JSON.stringify(file));

  it('keeps the program intact', () => {
    expect(program.name).toBe('Shared Grip');
    expect(program.weeks).toBe(source.weeks);
    expect(program.sessionTypes).toHaveLength(source.sessionTypes.length);
    expect(program.phases.map((p) => p.id)).toEqual(source.phases.map((p) => p.id));
    expect(program.constraints).toHaveLength(source.constraints.length);
    expect(program.assessments).toEqual(source.assessments);
  });

  it('keeps the prescriptions, which is the whole point of sharing one', () => {
    const withBlocks = program.sessionTypes.find((t) => (t.blocks?.length ?? 0) > 0)!;
    const block = withBlocks.blocks![0]!;
    expect(Object.keys(block.perPhase).length).toBeGreaterThan(0);
    const filled = Object.values(block.perPhase).find((p) => p.exercises.length > 0)!;
    expect(filled.exercises[0]!.name).toBeTruthy();
  });

  it('loses nothing worth telling the climber about', () => {
    expect(dropped).toEqual([]);
  });

  it('arrives runnable', () => {
    expect(canRun(program)).toBe(true);
    expect(validateProgram(program).filter((i) => i.level === 'error')).toEqual([]);
  });

  // Keeping the original id would let a file overwrite a program the
  // climber wrote, which is the one outcome an import must never have.
  it('always takes a fresh id', () => {
    const again = parseProgramFile(JSON.stringify(file)).program;
    expect(isCustomId(program.id)).toBe(true);
    expect(again.id).not.toBe(program.id);
  });

  it('names the file after the program', () => {
    expect(fileName({ ...program, name: 'Iron Grip (mine)' })).toBe('iron-grip-mine.ascent-program.json');
    expect(fileName({ ...program, name: '   ' })).toBe('program.ascent-program.json');
  });
});

describe('files that are not ours', () => {
  it('rejects unreadable JSON', () => {
    expect(() => parseProgramFile('{oh no')).toThrow(ProgramFileError);
  });

  it('rejects a full backup, which is a different document', () => {
    const backup = JSON.stringify({ app: 'project-ascent', schemaVersion: 1, data: {} });
    expect(() => parseProgramFile(backup)).toThrow(/not a Project Ascent program file/);
  });

  it('rejects something else entirely', () => {
    expect(() => parseProgramFile(JSON.stringify({ hello: 'world' }))).toThrow(ProgramFileError);
    expect(() => parseProgramFile(JSON.stringify([1, 2, 3]))).toThrow(ProgramFileError);
    expect(() => parseProgramFile('null')).toThrow(ProgramFileError);
  });

  it('refuses a file from a newer app rather than guessing at it', () => {
    const future = JSON.stringify({ app: 'project-ascent', kind: 'program', schemaVersion: 99, program: {} });
    expect(() => parseProgramFile(future)).toThrow(/newer version/);
  });

  it('rejects a program that is not an object', () => {
    expect(() => parseProgramFile(wrap('a string'))).toThrow(/no program in it/);
  });
});

describe('hostile and broken input', () => {
  // The risk is not injection — React escapes markup — it is a program
  // claiming 100,000 weeks, which is a frozen tab.
  it('clamps an absurd length', () => {
    expect(parseProgramFile(wrap({ name: 'X', weeks: 1e9 })).program.weeks).toBe(52);
    expect(parseProgramFile(wrap({ name: 'X', weeks: -5 })).program.weeks).toBe(1);
    expect(parseProgramFile(wrap({ name: 'X', weeks: NaN })).program.weeks).toBe(8);
    expect(parseProgramFile(wrap({ name: 'X', weeks: '12' })).program.weeks).toBe(8);
  });

  it('caps a runaway list and says how much it threw away', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, icon: '', description: '' }));
    const { program, dropped } = parseProgramFile(wrap({ name: 'X', sessionTypes: many }));
    expect(program.sessionTypes).toHaveLength(LIMITS.sessionTypes);
    expect(dropped.some((d) => /extra session types/.test(d))).toBe(true);
  });

  it('caps a runaway string', () => {
    const { program } = parseProgramFile(wrap({ name: 'z'.repeat(5000) }));
    expect(program.name).toHaveLength(LIMITS.name);
  });

  it('strips control characters from text', () => {
    const { program } = parseProgramFile(wrap({ name: 'Bad\u001b[31mname\u0000here' }));
    expect(program.name).not.toMatch(/[\u0000-\u001f]/);
    expect(program.name).toContain('name');
  });

  it('replaces a missing name rather than rendering an empty header', () => {
    expect(parseProgramFile(wrap({})).program.name).toBe('Untitled program');
  });

  it('falls back on unknown enum values instead of trusting them', () => {
    const { program } = parseProgramFile(wrap({ name: 'X', stage: 'evil', discipline: 'nope', kind: 'weird' }));
    expect(program.stage).toBe('style');
    expect(program.discipline).toBe('both');
    expect(program.kind).toBe('program');
  });

  it('drops equipment it does not recognise, and never ends up with none', () => {
    const { program } = parseProgramFile(wrap({ name: 'X', equipment: ['wall', 'laser', 42] }));
    expect(program.equipment).toEqual(['wall']);
    expect(parseProgramFile(wrap({ name: 'X', equipment: [] })).program.equipment).toEqual(['wall']);
  });

  it('never carries a field the app did not ask for', () => {
    const { program } = parseProgramFile(
      wrap({ name: 'X', evil: 'payload', nextPrograms: [{ id: 'x', reason: 'y' }] }),
    );
    expect('evil' in program).toBe(false);
    // A shared program is not part of this catalog's progression graph.
    expect(program.nextPrograms).toEqual([]);
  });

  it('gives a program with no phases one that covers it', () => {
    const { program } = parseProgramFile(wrap({ name: 'X', weeks: 6, phases: 'nonsense' }));
    expect(program.phases).toHaveLength(1);
    expect(program.phases[0]!.weekEnd).toBe(6);
  });

  it('clamps phase weeks inside the program', () => {
    const { program } = parseProgramFile(
      wrap({ name: 'X', weeks: 4, phases: [{ id: 'a', name: 'A', weekStart: -3, weekEnd: 900 }] }),
    );
    expect(program.phases[0]!.weekStart).toBe(1);
    expect(program.phases[0]!.weekEnd).toBe(4);
  });

  // Two phases sharing an id means two blocks of weeks sharing one
  // prescription, which is silent and wrong.
  it('makes duplicate phase ids unique', () => {
    const { program } = parseProgramFile(
      wrap({ name: 'X', phases: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] }),
    );
    expect(new Set(program.phases.map((p) => p.id)).size).toBe(2);
  });
});

describe('references that cannot resolve here', () => {
  const withGhosts = wrap({
    name: 'X',
    sessionTypes: [{ id: 'real', name: 'Real', icon: '', description: '' }],
    recommendedLayout: { name: 'W', description: '', slots: { 1: 'real', 2: 'ghost', 9: 'real' } },
    constraints: [
      { kind: 'max-per-week', sessionTypeId: 'ghost', count: 2, note: '' },
      { kind: 'max-per-week', sessionTypeId: 'real', count: 2, note: '' },
      { kind: 'telepathy', note: '' },
    ],
    assessments: ['max_hang_20mm_7s', 'invented_metric'],
  });

  it('keeps the references that resolve and drops the ones that do not', () => {
    const { program, dropped } = parseProgramFile(withGhosts);
    expect(program.recommendedLayout!.slots).toEqual({ 1: 'real' });
    expect(program.constraints).toHaveLength(1);
    expect(program.assessments).toEqual(['max_hang_20mm_7s']);
    expect(dropped.length).toBeGreaterThanOrEqual(3);
  });

  it('leaves the imported program runnable despite the mess', () => {
    expect(canRun(parseProgramFile(withGhosts).program)).toBe(true);
  });

  /**
   * A file is the third way a session type reaches the app (PLAN.md M311).
   *
   * The builder's chips no longer offer these and its validator names one
   * that is already there, but a file written before M142 can still say
   * `sessionDuration` — and accepting it would put *Time on the wall* back
   * beside the logger's own Duration input. Dropped and named, like every
   * other thing this version does not take.
   */
  it('drops a question the app now asks somewhere else', () => {
    const { program, dropped } = parseProgramFile(
      wrap({
        name: 'X',
        weeks: 4,
        sessionTypes: [
          {
            id: 'a',
            name: 'A',
            icon: '',
            description: '',
            fields: ['sessionDuration', 'location', 'pumpLevel', 'not_a_field'],
          },
        ],
      }),
    );
    expect(program.sessionTypes[0]!.fields).toEqual(['pumpLevel']);
    expect(dropped.filter((d) => /asks elsewhere/.test(d))).toHaveLength(2);
    expect(dropped.some((d) => /Time on the wall/.test(d))).toBe(true);
    // And an id from no version at all still reads as its own kind of loss.
    expect(dropped.some((d) => /does not ask \("not_a_field"\)/.test(d))).toBe(true);
  });

  it('drops a drill this version does not ship', () => {
    const { program, dropped } = parseProgramFile(
      wrap({
        name: 'X',
        weeks: 4,
        sessionTypes: [
          { id: 'a', name: 'A', icon: '', description: '', drillsByWeek: { 1: 'not_a_drill', 99: 'x' } },
        ],
      }),
    );
    expect(program.sessionTypes[0]!.drillsByWeek).toBeUndefined();
    expect(dropped.some((d) => /drill this version does not have/.test(d))).toBe(true);
  });

  it('drops a timer protocol this version does not ship', () => {
    const { program } = parseProgramFile(
      wrap({
        name: 'X',
        sessionTypes: [
          {
            id: 'a',
            name: 'A',
            icon: '',
            description: '',
            blocks: [
              {
                id: 'b',
                name: 'B',
                perPhase: {
                  phase1: {
                    rationale: '',
                    exercises: [
                      { name: 'Real', protocolId: 'repeaters_7_3' },
                      { name: 'Fake', protocolId: 'made_up' },
                    ],
                  },
                },
              },
            ],
          },
        ],
      }),
    );
    const exercises = program.sessionTypes[0]!.blocks![0]!.perPhase['phase1']!.exercises;
    expect(exercises[0]!.protocolId).toBe('repeaters_7_3');
    expect(exercises[1]!.protocolId).toBeUndefined();
    expect(exercises[1]!.name).toBe('Fake');
  });
});

describe('attribution', () => {
  it('carries an author when there is one', () => {
    expect(parseProgramFile(wrap({ name: 'X', author: 'Evan' })).program.author).toBe('Evan');
  });

  it('leaves it unset rather than storing an empty string', () => {
    expect(parseProgramFile(wrap({ name: 'X', author: '   ' })).program.author).toBeUndefined();
    expect(parseProgramFile(wrap({ name: 'X', author: 42 })).program.author).toBeUndefined();
  });
});

/**
 * Everything the file carried and the reader threw away (PLAN.md M136).
 *
 * `buildProgramFile` wrote the whole program from the day it existed, and
 * this parser — rebuild, never cast — read only what it had been taught.
 * So a shared Iron Grip arrived with its tracks gone (and both tracks'
 * lines shown to everyone), its weekly steps flattened to one dose a
 * phase, every day ordinary, every session equally droppable, the Cruiser's
 * hard-day rule dropped as a kind this version does not know — and the
 * round-trip test counted session types and called it intact.
 */
describe('the rest of the round trip', () => {
  const grip = forkProgram(getProgram('iron_grip')!, 'Grip');
  const back = parseProgramFile(JSON.stringify(buildProgramFile(grip))).program;
  const cruiser = forkProgram(getProgram('the_cruiser')!, 'Cruise');
  const cruised = parseProgramFile(JSON.stringify(buildProgramFile(cruiser)));

  it('keeps the tracks, and the lines on them', () => {
    expect(back.tracks).toEqual(grip.tracks);
    const on = (p: typeof grip) =>
      p.sessionTypes.flatMap((t) => (t.blocks ?? []).flatMap((b) => Object.values(b.perPhase).flatMap((e) => e.exercises.map((x) => x.track ?? ''))));
    expect(on(back)).toEqual(on(grip));
    expect(on(back).some((t) => t !== '')).toBe(true);
  });

  it('keeps the week-by-week steps, dose and all', () => {
    const steps = (p: typeof grip) =>
      p.sessionTypes.flatMap((t) => (t.blocks ?? []).flatMap((b) => Object.values(b.perPhase).flatMap((e) => e.perWeek ?? [])));
    expect(steps(back)).toEqual(steps(grip));
    expect(steps(back).length).toBeGreaterThan(0);
  });

  it('keeps a session length the dose cannot state, and drops one no clock can read', () => {
    // The Cruiser authors three (PLAN.md M138).
    expect(cruised.program.sessionTypes.map((t) => t.duration)).toEqual(cruiser.sessionTypes.map((t) => t.duration));
    expect(cruiser.sessionTypes.some((t) => t.duration !== undefined)).toBe(true);
    const { program, dropped } = parseProgramFile(
      wrap({ name: 'X', sessionTypes: [{ id: 'a', name: 'A', icon: '', description: '', duration: 'a while' }] }),
    );
    expect(program.sessionTypes[0]!.duration).toBeUndefined();
    expect(dropped.some((d) => /session length this version cannot read/.test(d))).toBe(true);
  });

  it('keeps how hard each day is, which sessions survive a short week, and the questions it asks', () => {
    expect(back.sessionTypes.map((t) => t.intensity)).toEqual(grip.sessionTypes.map((t) => t.intensity));
    expect(back.sessionTypes.map((t) => t.priority)).toEqual(grip.sessionTypes.map((t) => t.priority));
    expect(back.sessionTypes.map((t) => t.fields)).toEqual(grip.sessionTypes.map((t) => t.fields));
    expect(grip.sessionTypes.some((t) => t.fields !== undefined)).toBe(true);
  });

  it('keeps the helpful kit', () => {
    expect(back.helpfulEquipment).toEqual(grip.helpfulEquipment);
    expect(grip.helpfulEquipment?.length).toBeGreaterThan(0);
  });

  it('keeps a circuit, a reason for never changing, and the hard-day rule', () => {
    const circuits = (p: typeof grip) =>
      p.sessionTypes.flatMap((t) => (t.blocks ?? []).flatMap((b) => Object.values(b.perPhase).map((e) => e.circuit ?? null)));
    expect(circuits(cruised.program)).toEqual(circuits(cruiser));
    const reasons = (p: typeof grip) => p.sessionTypes.flatMap((t) => (t.blocks ?? []).map((b) => b.constantDose ?? null));
    expect(reasons(cruised.program)).toEqual(reasons(cruiser));
    expect(reasons(cruiser).some((r) => r !== null)).toBe(true);
    expect(cruised.program.constraints).toEqual(cruiser.constraints);
    expect(cruiser.constraints.some((c) => c.kind === 'no-back-to-back')).toBe(true);
    expect(cruised.dropped).toEqual([]);
  });

  it('keeps a successor the catalogue has, and says when it drops one it does not', () => {
    const { program, dropped } = parseProgramFile(
      wrap({ name: 'X', nextPrograms: [{ id: 'peak_performance', reason: 'Express it.' }, { id: 'nope', reason: '' }] }),
    );
    expect(program.nextPrograms).toEqual([{ id: 'peak_performance', reason: 'Express it.' }]);
    expect(dropped.some((d) => /what comes after/.test(d))).toBe(true);
  });

  it('drops a question this version does not ask, and a line on a track the file does not declare', () => {
    const { program, dropped } = parseProgramFile(
      wrap({
        name: 'X',
        tracks: [{ id: 'a', name: 'A', description: '' }],
        sessionTypes: [
          {
            id: 'a',
            name: 'A',
            icon: '',
            description: '',
            fields: ['pumpLevel', 'shoeSize'],
            blocks: [
              {
                id: 'b',
                name: 'B',
                perPhase: {
                  phase1: { rationale: '', exercises: [{ name: 'On A', track: 'a' }, { name: 'On nothing', track: 'ghost' }] },
                },
              },
            ],
          },
        ],
      }),
    );
    expect(program.sessionTypes[0]!.fields).toEqual(['pumpLevel']);
    const lines = program.sessionTypes[0]!.blocks![0]!.perPhase['phase1']!.exercises;
    expect(lines.map((e) => e.track)).toEqual(['a', undefined]);
    expect(dropped.some((d) => /shoeSize/.test(d))).toBe(true);
    expect(dropped.some((d) => /track the file does not declare/.test(d))).toBe(true);
  });

  it('drops a step with no week or nothing written, and keeps the rest in order', () => {
    const { program, dropped } = parseProgramFile(
      wrap({
        name: 'X',
        sessionTypes: [
          {
            id: 'a',
            name: 'A',
            icon: '',
            description: '',
            blocks: [
              {
                id: 'b',
                name: 'B',
                perPhase: {
                  phase1: {
                    rationale: '',
                    exercises: [{ name: 'Hangs', sets: '3' }],
                    perWeek: [
                      { week: 3, step: 'Three', dose: { Hangs: { sets: '5', bogus: 'x' } } },
                      { week: 2, step: 'Two' },
                      { week: 1, step: 'Week one is the list' },
                      { week: 4, step: '' },
                    ],
                  },
                },
              },
            ],
          },
        ],
      }),
    );
    expect(program.sessionTypes[0]!.blocks![0]!.perPhase['phase1']!.perWeek).toEqual([
      { week: 2, step: 'Two' },
      { week: 3, step: 'Three', dose: { Hangs: { sets: '5' } } },
    ]);
    expect(dropped.filter((d) => /week step/.test(d))).toHaveLength(2);
  });
});
