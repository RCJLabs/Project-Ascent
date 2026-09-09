import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import { V_GRADES } from './grades';
import { deriveClimberState } from './derive';
import type { SkillInput } from './skills';
import {
  MAX_ACTIVE,
  achievedByProject,
  activeObjectives,
  describeProgress,
  newObjectiveId,
  newRequirementId,
  objectiveProgress,
  rankObjectives,
  suggestedRequirements,
  trainableByProgram,
  type Objective,
  type ObjectiveRequirement,
} from './objectives';

const TODAY = '2026-03-04';

function objective(patch: Partial<Objective> = {}): Objective {
  return {
    id: 'o1', name: 'The Nose', kind: 'route', status: 'training',
    requirements: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', ...patch,
  };
}
const req = (requirement: ObjectiveRequirement['requirement']): ObjectiveRequirement => ({
  id: newRequirementId(), requirement,
});

/** A history with `n` sessions, each with one V4 send. */
function history(n: number): Session[] {
  return Array.from({ length: n }, (_, i) =>
    newSession(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, i, {
      completed: true, rpe: 7, durationMin: 60,
      climbs: [{ id: `c${i}`, grade: 'V4', scale: 'V', count: 1, result: 'send' }],
    }),
  );
}
const inputFor = (sessions: Session[]): SkillInput => ({ state: deriveClimberState(sessions, { today: TODAY }) });

describe('measuring an objective', () => {
  const input = inputFor(history(30));

  it('measures every requirement against the log', () => {
    const o = objective({ requirements: [req({ kind: 'sessions', count: 60 }), req({ kind: 'sessions', count: 10 })] });
    const p = objectiveProgress(o, input, TODAY);
    expect(p.total).toBe(2);
    expect(p.met).toBe(1);
    expect(p.measured[0]!.measurement.current).toBe(30);
  });

  // Five requirements each 80% done is a climber nearly there. Reporting
  // that as 0% would be a lie the whole feature could not survive.
  it('counts a half-done requirement as half done', () => {
    const o = objective({ requirements: [req({ kind: 'sessions', count: 60 })] });
    expect(objectiveProgress(o, input, TODAY).readiness).toBeCloseTo(0.5, 2);
    expect(objectiveProgress(o, input, TODAY).met).toBe(0);
  });

  it('averages across requirements rather than counting them', () => {
    const o = objective({
      requirements: [req({ kind: 'sessions', count: 30 }), req({ kind: 'sessions', count: 60 })],
    });
    // One fully met, one half met.
    expect(objectiveProgress(o, input, TODAY).readiness).toBeCloseTo(0.75, 2);
  });

  it('caps a requirement at done rather than letting it carry the rest', () => {
    const o = objective({
      requirements: [req({ kind: 'sessions', count: 1 }), req({ kind: 'sessions', count: 100 })],
    });
    const p = objectiveProgress(o, input, TODAY);
    expect(p.readiness).toBeLessThan(1);
    expect(p.readiness).toBeCloseTo((1 + 0.3) / 2, 2);
  });

  it('reads as nothing when there is nothing to measure', () => {
    const p = objectiveProgress(objective(), input, TODAY);
    expect(p.readiness).toBe(0);
    expect(p.weakest).toBeNull();
    expect(describeProgress(p)).toMatch(/Nothing to work toward/);
  });
});

describe('what to work on next', () => {
  const input = inputFor(history(30));

  it('names the requirement furthest from done', () => {
    const o = objective({
      requirements: [
        req({ kind: 'sessions', count: 40 }),
        req({ kind: 'outdoor-days', count: 12 }),
        req({ kind: 'sessions', count: 31 }),
      ],
    });
    // No outdoor days at all: nothing is further away than that.
    expect(objectiveProgress(o, input, TODAY).weakest?.requirement.kind).toBe('outdoor-days');
  });

  it('has nothing to name once everything is met', () => {
    const o = objective({ requirements: [req({ kind: 'sessions', count: 5 })] });
    expect(objectiveProgress(o, input, TODAY).weakest).toBeNull();
  });
});

describe('the target date', () => {
  const input = inputFor(history(10));

  it('counts the weeks out', () => {
    const o = objective({ targetDate: '2026-04-01', requirements: [req({ kind: 'sessions', count: 5 })] });
    expect(objectiveProgress(o, input, TODAY).weeksLeft).toBe(4);
  });

  // A season that did not go to plan is a season, not a failure state.
  it('goes negative rather than declaring a failure', () => {
    const o = objective({ targetDate: '2026-02-04', requirements: [req({ kind: 'sessions', count: 5 })] });
    const p = objectiveProgress(o, input, TODAY);
    expect(p.weeksLeft).toBeLessThan(0);
    expect(describeProgress(p)).toMatch(/target was 4 weeks ago/);
  });

  it('says nothing about time when no date was set', () => {
    const p = objectiveProgress(objective({ requirements: [req({ kind: 'sessions', count: 5 })] }), input, TODAY);
    expect(p.weeksLeft).toBeNull();
    expect(describeProgress(p)).not.toMatch(/week/);
  });

  // The app can measure what happened. It cannot say whether three more
  // months will go the way a climber hopes.
  it('never predicts whether the date will be made', () => {
    const o = objective({ targetDate: '2026-06-01', requirements: [req({ kind: 'sessions', count: 200 })] });
    const text = describeProgress(objectiveProgress(o, input, TODAY));
    expect(text).not.toMatch(/on track|behind|will|should make|unlikely/i);
  });
});

describe('suggested requirements', () => {
  it('builds a pyramid under the grade', () => {
    const suggested = suggestedRequirements('boulder', 'V', 'V8', V_GRADES);
    const sends = suggested.filter((s) => s.requirement.kind === 'sends');
    expect(sends).toHaveLength(2);
    const grades = sends.map((s) => (s.requirement as { grade: string }).grade);
    expect(grades).toEqual(['V6', 'V7']);
  });

  it('asks for real rock, and more of it for a route', () => {
    const boulder = suggestedRequirements('boulder', 'V', 'V8', V_GRADES);
    const route = suggestedRequirements('route', 'YDS', '5.13a', V_GRADES);
    const days = (list: ObjectiveRequirement[]) =>
      list.find((r) => r.requirement.kind === 'outdoor-days')?.requirement as { count: number } | undefined;
    expect(days(route)!.count).toBeGreaterThan(days(boulder)!.count);
  });

  it('does not fall off the bottom of the ladder', () => {
    const suggested = suggestedRequirements('boulder', 'V', 'V0', V_GRADES);
    const grades = suggested
      .filter((s) => s.requirement.kind === 'sends')
      .map((s) => (s.requirement as { grade: string }).grade);
    expect(grades.every((g) => V_GRADES.includes(g as (typeof V_GRADES)[number]))).toBe(true);
  });

  it('gives every suggestion its own id', () => {
    const suggested = suggestedRequirements('route', 'YDS', '5.12a', V_GRADES);
    expect(new Set(suggested.map((s) => s.id)).size).toBe(suggested.length);
  });

  it('still suggests the consistency requirements for a trip with no grade', () => {
    const suggested = suggestedRequirements('trip', 'V', '', V_GRADES);
    expect(suggested.some((s) => s.requirement.kind === 'streak-weeks')).toBe(true);
    expect(suggested.some((s) => s.requirement.kind === 'sends')).toBe(false);
  });
});

describe('the list', () => {
  it('separates what you are working on from what you are not', () => {
    const list = [
      objective({ id: 'a', status: 'sent' }),
      objective({ id: 'b', status: 'training' }),
      objective({ id: 'c', status: 'shelved' }),
      objective({ id: 'd', status: 'planning' }),
    ];
    expect(activeObjectives(list).map((o) => o.id)).toEqual(['b', 'd']);
    expect(rankObjectives(list, new Map()).map((o) => o.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('puts the closest first within a status', () => {
    const list = [objective({ id: 'far', status: 'training' }), objective({ id: 'near', status: 'training' })];
    const readiness = new Map([['far', 0.2], ['near', 0.9]]);
    expect(rankObjectives(list, readiness).map((o) => o.id)).toEqual(['near', 'far']);
  });

  it('caps how many can really be the objective', () => {
    expect(MAX_ACTIVE).toBeLessThanOrEqual(3);
  });

  it('hands out unique ids', () => {
    expect(new Set(Array.from({ length: 100 }, newObjectiveId)).size).toBe(100);
  });
});

// Derived rather than stored, so an objective cannot claim a send the log
// does not have.
describe('an objective the log has already achieved', () => {
  it('follows a linked project being sent', () => {
    const o = objective({ projectId: 'p1' });
    expect(achievedByProject(o, new Set(['p1']))).toBe(true);
    expect(achievedByProject(o, new Set(['p2']))).toBe(false);
  });

  it('says nothing about an objective with no project behind it', () => {
    expect(achievedByProject(objective(), new Set(['p1']))).toBe(false);
  });
});

describe('trainableByProgram', () => {
  it('does not offer a program for things a program cannot deliver', () => {
    expect(trainableByProgram({ kind: 'streak-weeks', weeks: 8 })).toBe(false);
    expect(trainableByProgram({ kind: 'outdoor-days', count: 12 })).toBe(false);
    expect(trainableByProgram({ kind: 'rest-days', count: 20 })).toBe(false);
  });

  it('offers one for training that a block actually contains', () => {
    expect(trainableByProgram({ kind: 'sends', scale: 'V', grade: 'V6', count: 10 })).toBe(true);
    expect(trainableByProgram({ kind: 'hours', hours: 80 })).toBe(true);
    expect(trainableByProgram({ kind: 'drills', category: 'technique', count: 10 })).toBe(true);
  });
});
