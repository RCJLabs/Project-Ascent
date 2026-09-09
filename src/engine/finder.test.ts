import { describe, expect, it } from 'vitest';
import { findProgram, recommend, type FinderInput } from './finder';

const ALL_GEAR: FinderInput['equipment'] = ['wall', 'hangboard', 'campus', 'gym'];

function input(over: Partial<FinderInput> = {}): FinderInput {
  return {
    discipline: 'both',
    experience: 'intermediate',
    boulderGrade: 'V4',
    goal: 'technique',
    daysPerWeek: 4,
    equipment: ALL_GEAR,
    ...over,
  };
}

describe('finder', () => {
  it('sends a complete beginner to Ground Zero', () => {
    const { top } = findProgram(input({ experience: 'new', goal: 'prep', boulderGrade: undefined }));
    expect(top.program.id).toBe('ground_zero');
    expect(top.reasons.join(' ')).toMatch(/starting point/i);
  });

  it('sends a V6 climber whose goal is fingers to Iron Grip', () => {
    const { top } = findProgram(input({ boulderGrade: 'V6', goal: 'fingers' }));
    expect(top.program.id).toBe('iron_grip');
  });

  it('sends a rope climber chasing endurance to The Long Game', () => {
    const { top } = findProgram(
      input({ discipline: 'sport', sportGrade: '5.11a', boulderGrade: undefined, goal: 'endurance' }),
    );
    expect(top.program.id).toBe('the_long_game');
  });

  it('recommends The Siege, which the prototype could never reach', () => {
    const { top } = findProgram(
      input({ discipline: 'sport', sportGrade: '5.13a', boulderGrade: undefined, goal: 'project' }),
    );
    expect(top.program.id).toBe('the_siege');
  });

  it('blocks The Siege when the redpoint prerequisite is not met', () => {
    const ranked = recommend(
      input({ discipline: 'sport', sportGrade: '5.11a', boulderGrade: undefined, goal: 'project' }),
    );
    const siege = ranked.find((r) => r.program.id === 'the_siege')!;
    expect(siege.blockers.length).toBeGreaterThan(0);
    expect(findProgram(input({ discipline: 'sport', sportGrade: '5.11a', goal: 'project' })).top.program.id).not.toBe(
      'the_siege',
    );
  });

  it('never recommends a program the climber cannot equip', () => {
    const ranked = recommend(input({ boulderGrade: 'V6', goal: 'fingers', equipment: ['wall'] }));
    const ironGrip = ranked.find((r) => r.program.id === 'iron_grip')!;
    expect(ironGrip.blockers.join(' ')).toMatch(/hangboard|campus/);
    const { top } = findProgram(input({ boulderGrade: 'V6', goal: 'fingers', equipment: ['wall'] }));
    expect(top.blockers).toEqual([]);
  });

  it('refuses to send a healing pulley to a finger program', () => {
    const injured = recommend(input({ boulderGrade: 'V6', goal: 'fingers', injuries: ['A2 Pulley'] }));
    const ironGrip = injured.find((r) => r.program.id === 'iron_grip')!;
    expect(ironGrip.blockers.length).toBeGreaterThan(0);
    expect(ironGrip.blockers.join(' ')).toMatch(/healing/i);

    const { top } = findProgram(input({ boulderGrade: 'V6', goal: 'fingers', injuries: ['A2 Pulley'] }));
    expect(top.program.id).not.toBe('iron_grip');
    expect(top.program.equipment).not.toContain('hangboard');
    expect(top.program.equipment).not.toContain('campus');
  });

  it('cautions rather than blocks for an elbow on a hangboard program', () => {
    const injured = recommend(input({ boulderGrade: 'V6', goal: 'fingers', injuries: ['Elbow'] }));
    const ironGrip = injured.find((r) => r.program.id === 'iron_grip')!;
    expect(ironGrip.cautions.join(' ')).toMatch(/elbow/i);
    // Campus work is still off the table with a bad elbow.
    expect(ironGrip.blockers.join(' ')).toMatch(/campus/i);
  });

  it('warns rather than blocks when the week is too short', () => {
    const ranked = recommend(input({ boulderGrade: 'V6', goal: 'fingers', daysPerWeek: 2 }));
    const ironGrip = ranked.find((r) => r.program.id === 'iron_grip')!;
    expect(ironGrip.blockers).toEqual([]);
    expect(ironGrip.cautions.join(' ')).toMatch(/days a week/);
  });

  it('never recommends a logging mode as training', () => {
    for (const goal of ['prep', 'fingers', 'endurance', 'maintain'] as const) {
      const { top, alternatives } = findProgram(input({ goal }));
      for (const rec of [top, ...alternatives]) {
        expect(rec.program.kind).toBe('program');
      }
    }
  });

  it('always returns something, and says when the match is weak', () => {
    // A contradictory request: brand new, no gear, one day a week, elite goal.
    const result = findProgram(
      input({ experience: 'new', goal: 'project', daysPerWeek: 1, equipment: [], boulderGrade: 'V0' }),
    );
    expect(result.top).toBeDefined();
    expect(result.fallback).toBe(true);
  });

  it('explains every recommendation it makes', () => {
    const { top, alternatives } = findProgram(input({ boulderGrade: 'V6', goal: 'fingers' }));
    for (const rec of [top, ...alternatives]) {
      expect(rec.reasons.length, rec.program.id).toBeGreaterThan(0);
    }
  });

  it('offers two distinct alternatives', () => {
    const { top, alternatives } = findProgram(input({ boulderGrade: 'V4', goal: 'dynamic' }));
    expect(alternatives).toHaveLength(2);
    const ids = [top.program.id, ...alternatives.map((a) => a.program.id)];
    expect(new Set(ids).size).toBe(3);
  });
});
