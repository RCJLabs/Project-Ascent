import { describe, expect, it } from 'vitest';
import { PROGRAMS } from '@/content/programs';
import type { Program } from '@/content/types';
import { forkProgram } from './customProgram';
import { countChanges, programChanges } from './programChanges';

/**
 * What a copy changed from the program it was copied from (PLAN.md M333).
 *
 * The list is the coach's reply, so the two ways it can be wrong are both
 * held: a change it misses is a reply the athlete never reads, and a change
 * it invents is a reply the coach never wrote. The second is swept over
 * every shipped program first, because it is the one nobody would notice.
 */

const IRON = PROGRAMS.find((p) => p.id === 'iron_grip')!;
const copy = (): Program => forkProgram(IRON, 'Iron Grip (revised)');
const lines = (to: Program, from: Program = IRON) => programChanges(from, to).flatMap((g) => g.lines);
const group = (to: Program, title: string) => programChanges(IRON, to).find((g) => g.title === title)?.lines ?? [];
const fp = (p: Program) => p.sessionTypes.find((t) => t.id === 'fp')!;
const block = (p: Program, id: string) => fp(p).blocks!.find((b) => b.id === id)!;

describe('a copy nobody has touched', () => {
  it('has changed nothing, for every program the app ships', () => {
    const programs = PROGRAMS.filter((p) => p.kind === 'program');
    expect(programs.length).toBeGreaterThan(8);
    for (const program of programs) {
      expect(programChanges(program, forkProgram(program, 'renamed')), program.id).toEqual([]);
    }
  });

  it('does not count the new name, which every copy has', () => {
    expect(copy().name).not.toBe(IRON.name);
    expect(lines(copy())).toEqual([]);
  });
});

describe('the shape of the block', () => {
  it('says the length and the deloads', () => {
    const p = copy();
    p.weeks = 10;
    p.deloadWeeks = [5, 10];
    expect(group(p, 'Length')).toEqual(['12 weeks → 10', `Deload weeks: ${(IRON.deloadWeeks ?? []).join(', ') || 'none'} → 5, 10`]);
  });

  it('says which days moved, Monday first and Sunday last', () => {
    const p = copy();
    p.recommendedLayout = { ...p.recommendedLayout!, slots: { 0: 'perf', 1: 'fp', 3: 'perf', 5: 'fp' } };
    expect(group(p, 'The week')).toEqual([
      'Thursday: Finger Protocol + Engine → rest',
      'Friday: rest → Finger Protocol + Engine',
      'Saturday: Climbing Session → rest',
      'Sunday: rest → Climbing Session',
    ]);
  });

  it('says a phase that moved, was renamed, arrived or went', () => {
    const p = copy();
    p.phases = [
      { ...p.phases[0]!, name: 'Repeaters' },
      { ...p.phases[1]!, weekEnd: 7 },
      { id: 'extra', name: 'Taper', weekStart: 8, weekEnd: 8, description: '', goals: [] },
    ];
    expect(group(p, 'Phases')).toEqual([
      'Dropped The Spark (Contact Strength)',
      'The Anvil (Repeaters) is now called Repeaters',
      'The Hammer (Max Hangs): weeks 5–8 → weeks 5–7',
      'New phase: Taper, week 8',
    ]);
  });
});

describe('inside a session', () => {
  it('says a dose that changed, field by field, and where', () => {
    const p = copy();
    const anvil = block(p, 'finger_protocol').perPhase['anvil']!;
    anvil.exercises[0] = { ...anvil.exercises[0]!, sets: '3', rest: '4 min' };
    expect(group(p, 'Finger Protocol + Engine')).toEqual([
      `7/3 Repeaters: sets 3-5 → 3, rest 3 min → 4 min — Finger Protocol, The Anvil (Repeaters)`,
    ]);
  });

  it('says a change made in every phase once, without naming the phases', () => {
    // Iron Grip's armour block carries Wrist Extensor Curls in all three.
    const p = copy();
    const armor = block(p, 'armor');
    for (const id of ['anvil', 'hammer', 'spark']) {
      armor.perPhase[id]!.exercises = armor.perPhase[id]!.exercises.map((e) =>
        e.name === 'Wrist Extensor Curls' ? { ...e, sets: '9' } : e,
      );
    }
    const said = group(p, 'Finger Protocol + Engine');
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^Wrist Extensor Curls: sets .+ → 9 — Armor$/);
  });

  it('names the phases when the same change is in some of them', () => {
    // Hammer Curls are in the second and third phases only; start them equal
    // so the two edits are the same change.
    const before = copy();
    const edit = (p: Program, sets: string) => {
      for (const id of ['hammer', 'spark']) {
        const phase = block(p, 'armor').perPhase[id]!;
        phase.exercises = phase.exercises.map((e) => (e.name === 'Hammer Curls' ? { ...e, sets } : e));
      }
    };
    edit(before, '3');
    const after = structuredClone(before);
    edit(after, '9');
    expect(lines(after, before)).toEqual([
      'Hammer Curls: sets 3 → 9 — Armor, The Hammer (Max Hangs), The Spark (Contact Strength)',
    ]);
  });

  it('says them apart when the same exercise changed differently', () => {
    const p = copy();
    for (const id of ['hammer', 'spark']) {
      const phase = block(p, 'armor').perPhase[id]!;
      phase.exercises = phase.exercises.map((e) => (e.name === 'Hammer Curls' ? { ...e, sets: '9' } : e));
    }
    expect(group(p, 'Finger Protocol + Engine')).toEqual([
      'Hammer Curls: sets 3 → 9 — Armor, The Hammer (Max Hangs)',
      'Hammer Curls: sets 2 → 9 — Armor, The Spark (Contact Strength)',
    ]);
  });

  it('says an exercise added, with its dose, and one dropped', () => {
    const p = copy();
    const spark = block(p, 'finger_protocol').perPhase['spark']!;
    spark.exercises = [
      ...spark.exercises.filter((e) => e.name !== 'Campus Skips'),
      { name: 'Board Limit Moves', sets: '4', reps: '3' },
    ];
    expect(group(p, 'Finger Protocol + Engine')).toEqual([
      'Dropped Campus Skips — Finger Protocol, The Spark (Contact Strength)',
      'Added Board Limit Moves (4 · 3) — Finger Protocol, The Spark (Contact Strength)',
    ]);
  });

  it('says a block gone or new, a session renamed, re-timed or made a rest', () => {
    const p = copy();
    const type = fp(p);
    type.blocks = [...type.blocks!.filter((b) => b.id !== 'core'), { id: 'mobility', name: 'Mobility', perPhase: {} }];
    type.name = 'Fingers';
    type.duration = '45 min';
    expect(group(p, 'Fingers')).toEqual([
      'Was called Finger Protocol + Engine',
      `Length: ${fp(IRON).duration || 'not set'} → 45 min`,
      `Dropped ${block(IRON, 'core').name}`,
      'Added Mobility',
    ]);
    const rest = copy();
    rest.sessionTypes = rest.sessionTypes.map((t) => (t.id === 'perf' ? { ...t, isRest: true } : t));
    expect(lines(rest)).toContain('Now a rest day');
  });

  it('says a session added or dropped from the program', () => {
    const p = copy();
    p.sessionTypes = [
      ...p.sessionTypes.filter((t) => t.id !== 'perf'),
      { id: 'yoga', name: 'Yoga', icon: '🧘', description: '' },
    ];
    expect(group(p, 'Sessions')).toEqual(['Dropped Climbing Session', 'Added Yoga']);
  });

  it('says the week-by-week steps changed without reciting them', () => {
    const p = copy();
    const anvil = block(p, 'finger_protocol').perPhase['anvil']!;
    anvil.perWeek = [...(anvil.perWeek ?? []), { week: 4, step: 'Test week' }];
    expect(lines(p)).toEqual(['Its week-by-week steps changed — Finger Protocol, The Anvil (Repeaters)']);
  });

  it('leaves a reworded note or rationale alone', () => {
    const p = copy();
    const anvil = block(p, 'finger_protocol').perPhase['anvil']!;
    anvil.rationale = 'Reworded.';
    anvil.exercises[0] = { ...anvil.exercises[0]!, notes: 'Say it differently.' };
    expect(lines(p)).toEqual([]);
  });
});

describe('the rest of the program', () => {
  it('names benchmarks by their label', () => {
    const p = copy();
    p.assessments = [...p.assessments.filter((a) => a !== 'dead_hang'), 'max_pullups'].filter(
      (a, i, all) => all.indexOf(a) === i,
    );
    const said = group(p, 'Benchmarks');
    expect(said).toContain('Dropped Dead Hang');
  });

  it('reads a rule swapped for another of its kind as one change', () => {
    const p = copy();
    p.constraints = p.constraints.map((c) => (c.kind === 'min-gap-hours' ? { ...c, hours: 72 } : c));
    const said = group(p, 'Rules');
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^\d+ hours between .* → 72 hours between /);
  });

  it('says a rule dropped and a rule new when they are different kinds', () => {
    const p = copy();
    p.constraints = [
      ...p.constraints.filter((c) => c.kind !== 'max-per-week'),
      { kind: 'no-back-to-back', intensity: 'max', note: '' },
    ];
    const said = group(p, 'Rules');
    expect(said.some((l) => l.startsWith('Dropped: '))).toBe(true);
    expect(said).toContain('New: No two max days in a row');
  });

  it('names kit and grades, and says the words were rewritten without quoting them', () => {
    const p = copy();
    p.equipment = [...p.equipment.filter((e) => e !== 'gym'), 'campus'];
    p.gradeRange = { ...p.gradeRange, min: 'V3' };
    p.intro = { ...p.intro, pitch: `${p.intro.pitch} Keep the elbow quiet.` };
    expect(group(p, 'Kit').length).toBeGreaterThan(0);
    expect(group(p, 'Grades')).toEqual([`${IRON.gradeRange.min}–${IRON.gradeRange.max} → V3–${IRON.gradeRange.max}`]);
    expect(group(p, 'In its own words')).toEqual(['Rewritten — read it under What it is']);
  });

  it('keeps the order a climber reads in, and counts every line', () => {
    const p = copy();
    p.weeks = 10;
    p.recommendedLayout = { ...p.recommendedLayout!, slots: { 1: 'fp', 3: 'perf', 5: 'fp', 6: 'perf' } };
    p.intro = { ...p.intro, pitch: 'New.' };
    const groups = programChanges(IRON, p);
    expect(groups.map((g) => g.title)).toEqual(['Length', 'The week', 'In its own words']);
    expect(countChanges(groups)).toBe(4);
  });
});
