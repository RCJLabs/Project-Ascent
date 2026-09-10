import { describe, expect, it } from 'vitest';
import { BASE_CAMP, IRON_GRIP, LOCKDOWN, PROGRAMS, THE_LONG_GAME } from '@/content/programs';
import {
  assignSessions,
  describeDays,
  gapHours,
  layoutsFor,
  planFromLayout,
  sessionPriority,
  sessionsForDays,
  validateWeek,
  type WeekPlan,
} from './scheduler';
import type { Program, SessionType } from '@/content/types';

describe('gapHours', () => {
  it('measures the shorter way around a repeating week', () => {
    expect(gapHours(1, 4)).toBe(72);
    // Saturday to Monday is two days, not five.
    expect(gapHours(6, 1)).toBe(48);
    expect(gapHours(0, 6)).toBe(24);
    expect(gapHours(3, 3)).toBe(0);
  });
});

describe('validateWeek', () => {
  it('passes every program on its own recommended layout', () => {
    for (const program of PROGRAMS) {
      if (!program.recommendedLayout) continue;
      const violations = validateWeek(program, planFromLayout(program.recommendedLayout));
      expect(violations.filter((v) => v.severity === 'error'), program.id).toEqual([]);
    }
  });

  it('catches finger sessions scheduled too close together', () => {
    const plan: WeekPlan = { 1: 'fp', 2: 'fp', 4: 'perf' };
    const errors = validateWeek(IRON_GRIP, plan).filter((v) => v.severity === 'error');
    expect(errors.map((e) => e.kind)).toContain('min-gap-hours');
    expect(errors[0]!.message).toMatch(/24h between Mon and Tue/);
    expect(errors[0]!.days).toEqual([1, 2]);
  });

  it('catches finger work the day before a hard climb', () => {
    const plan: WeekPlan = { 1: 'fp', 2: 'perf', 5: 'fp' };
    const errors = validateWeek(IRON_GRIP, plan).filter((v) => v.kind === 'not-day-before');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.days).toEqual([1, 2]);
    expect(errors[0]!.message).toMatch(/day before/);
  });

  it('does not fire the adjacency rule when the order is reversed', () => {
    // Hard climb first, fingers the day after, is fine.
    const plan: WeekPlan = { 1: 'perf', 2: 'fp', 5: 'fp' };
    expect(validateWeek(IRON_GRIP, plan).filter((v) => v.kind === 'not-day-before')).toEqual([]);
  });

  it('warns when the week is ordered against the program', () => {
    const plan: WeekPlan = { 1: 'perf', 3: 'tech', 5: 'eng' };
    const warnings = validateWeek(BASE_CAMP, plan).filter((v) => v.kind === 'order-in-week');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('warning');
    expect(warnings[0]!.message).toMatch(/before/);
  });

  it('enforces a per-week cap on the heavy session', () => {
    const plan: WeekPlan = { 1: 'sa', 3: 'sa', 5: 'sa' };
    const errors = validateWeek(LOCKDOWN, plan).filter((v) => v.kind === 'max-per-week');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/3 Session A/);
  });

  it('warns on too few or too many training days', () => {
    const thin = validateWeek(THE_LONG_GAME, { 1: 'end' });
    expect(thin.some((v) => v.kind === 'sessions-per-week')).toBe(true);
    const fat: WeekPlan = { 0: 'eng', 1: 'end', 2: 'eng', 3: 'end', 4: 'eng', 5: 'end' };
    expect(validateWeek(THE_LONG_GAME, fat).some((v) => v.kind === 'sessions-per-week')).toBe(true);
  });

  it('ignores rest days when counting training load', () => {
    const plan: WeekPlan = { 1: 'fp', 3: 'perf', 4: 'fp', 6: 'perf', 0: 'rest', 2: 'rest' };
    expect(validateWeek(IRON_GRIP, plan).filter((v) => v.kind === 'sessions-per-week')).toEqual([]);
  });
});

describe('layoutsFor', () => {
  it('offers the recommended layout first', () => {
    expect(layoutsFor(IRON_GRIP)[0]!.name).toBe('Recommended');
  });

  it('only offers generated layouts that pass validation', () => {
    for (const program of PROGRAMS) {
      for (const layout of layoutsFor(program)) {
        const errors = validateWeek(program, planFromLayout(layout)).filter((v) => v.severity === 'error');
        expect(errors, `${program.id}/${layout.name}`).toEqual([]);
      }
    }
  });

  it('honours a requested number of days', () => {
    const generated = layoutsFor(BASE_CAMP, { daysPerWeek: 3 }).filter((l) => l.name !== 'Recommended');
    expect(generated.length).toBeGreaterThan(0);
    for (const layout of generated) {
      expect(Object.keys(layout.slots)).toHaveLength(3);
    }
  });

  // A climber who can only train at the weekend is a real climber, and the
  // three fixed shapes were the only answer the app had (PLAN.md M55).
  it('only uses days the climber says they have', () => {
    const weekend: readonly (0 | 5 | 6)[] = [5, 6, 0];
    const generated = layoutsFor(IRON_GRIP, { availableDays: weekend }).filter(
      (l) => l.name !== 'Recommended',
    );
    expect(generated.length).toBeGreaterThan(0);
    for (const layout of generated) {
      for (const day of Object.keys(layout.slots).map(Number)) {
        expect(weekend, layout.name).toContain(day);
      }
    }
  });

  it('never asks for more days than the climber has', () => {
    const generated = layoutsFor(BASE_CAMP, { daysPerWeek: 5, availableDays: [2, 4] }).filter(
      (l) => l.name !== 'Recommended',
    );
    expect(generated.length).toBeGreaterThan(0);
    for (const layout of generated) {
      expect(Object.keys(layout.slots).length).toBeLessThanOrEqual(2);
    }
  });

  it('offers a one-day week, which the catalogue never asks for', () => {
    for (const program of PROGRAMS) {
      if (!program.sessionTypes.some((t) => !t.isRest)) continue;
      const generated = layoutsFor(program, { daysPerWeek: 1 }).filter(
        (l) => l.name !== 'Recommended',
      );
      expect(generated.length, program.id).toBeGreaterThan(0);
      for (const layout of generated) {
        expect(Object.keys(layout.slots), `${program.id}/${layout.name}`).toHaveLength(1);
      }
    }
  });

  it('does not offer the same week twice under different names', () => {
    const generated = layoutsFor(BASE_CAMP, { daysPerWeek: 2, availableDays: [1, 3] });
    const shapes = generated.map((l) => JSON.stringify(l.slots));
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  // Dropping sessions without saying which is how a climber ends up doing a
  // different program than the one they read about.
  it('says what a short week leaves out', () => {
    const [short] = layoutsFor(IRON_GRIP, { daysPerWeek: 1 }).filter((l) => l.name !== 'Recommended');
    expect(short!.note).toMatch(/^Keeps .+\. Leaves out .+\.$/);
    const [full] = layoutsFor(BASE_CAMP, { daysPerWeek: 4 }).filter((l) => l.name !== 'Recommended');
    expect(full!.note).toBeUndefined();
  });

  // Offering nothing is not an answer. Iron Grip across Friday, Saturday and
  // Sunday has no legal three-day week — 48 hours between finger sessions and
  // no fingers the day before hard climbing cannot both hold across three
  // consecutive days — so it comes back with a two-day one.
  it('offers a shorter week when the asked-for one cannot fit', () => {
    const generated = layoutsFor(IRON_GRIP, { daysPerWeek: 3, availableDays: [5, 6, 0] }).filter(
      (l) => l.name !== 'Recommended',
    );
    expect(generated.length).toBeGreaterThan(0);
    for (const layout of generated) {
      expect(Object.keys(layout.slots).length).toBeLessThan(3);
      expect(validateWeek(IRON_GRIP, planFromLayout(layout)).filter((v) => v.severity === 'error')).toEqual([]);
    }
  });
});

/** A program built for the test, so the rules are the ones being tested. */
function fixture(types: SessionType[], constraints: Program['constraints'] = []): Program {
  return {
    id: 'fixture' as Program['id'],
    name: 'Fixture',
    subtitle: '',
    kind: 'structured',
    stage: 'style',
    discipline: 'both',
    gradeRange: { scale: 'v', min: 'V0', max: 'V5' },
    weeks: 4,
    equipment: [],
    intro: '',
    phases: [],
    sessionTypes: types,
    frequency: '',
    ordering: '',
    assessments: [],
    nextPrograms: [],
    constraints,
  } as unknown as Program;
}

const type = (id: string, priority?: number): SessionType =>
  ({ id, name: id.toUpperCase(), icon: '·', description: '', ...(priority !== undefined ? { priority } : {}) }) as SessionType;

describe('naming a week built from chosen days', () => {
  // "Front-loaded — hard days early in the week, weekend free" is a false
  // sentence about a Friday-and-Saturday week.
  it('names it by its days rather than by a strategy it is not', () => {
    const generated = layoutsFor(IRON_GRIP, { availableDays: [5, 6, 0] }).filter(
      (l) => l.name !== 'Recommended',
    );
    expect(generated.length).toBeGreaterThan(0);
    for (const layout of generated) {
      expect(layout.name).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)(, (Sun|Mon|Tue|Wed|Thu|Fri|Sat))*$/);
      expect(layout.description).not.toMatch(/weekend free|early in the week/);
    }
  });

  it('describes the spacing it actually has', () => {
    expect(describeDays([5, 6]).description).toBe('Sessions on consecutive days.');
    expect(describeDays([1, 3]).description).toBe('A rest day between sessions.');
    expect(describeDays([1, 4])).toEqual({ name: 'Mon, Thu', description: 'Spread across the week.' });
    expect(describeDays([2]).description).toBe('One session a week.');
  });

  it('keeps the strategy names when the whole week is open', () => {
    const generated = layoutsFor(IRON_GRIP, { daysPerWeek: 2 }).filter((l) => l.name !== 'Recommended');
    expect(generated.map((l) => l.name)).toContain('Front-loaded');
  });
});

describe('which sessions a short week keeps', () => {
  it('follows the order the program declares when nothing is tuned', () => {
    const program = fixture([type('a'), type('b'), type('c')]);
    expect(sessionPriority(program)).toEqual(['a', 'b', 'c']);
    expect(sessionsForDays(program, 2)).toEqual(['a', 'b']);
  });

  it('puts an authored priority ahead of everything unset', () => {
    const program = fixture([type('a'), type('b'), type('c', 1)]);
    expect(sessionPriority(program)).toEqual(['c', 'a', 'b']);
    expect(sessionsForDays(program, 1)).toEqual(['c']);
  });

  it('keeps authored priorities in their own order', () => {
    const program = fixture([type('a', 3), type('b', 1), type('c', 2)]);
    expect(sessionPriority(program)).toEqual(['b', 'c', 'a']);
  });

  it('ignores rest days — they are not a session to keep', () => {
    const program = fixture([type('a'), { ...type('rest'), isRest: true }, type('b')]);
    expect(sessionPriority(program)).toEqual(['a', 'b']);
  });

  it('repeats from the top when there are more days than sessions', () => {
    const program = fixture([type('a'), type('b')]);
    expect(sessionsForDays(program, 5)).toEqual(['a', 'b', 'a', 'b', 'a']);
  });

  // A long week must not be filled by breaking the program's own cap.
  it('stops repeating a session that has hit its weekly cap', () => {
    const program = fixture(
      [type('a'), type('b')],
      [{ kind: 'max-per-week', sessionTypeId: 'a', count: 1, note: 'One A a week.' }] as Program['constraints'],
    );
    expect(sessionsForDays(program, 4)).toEqual(['a', 'b', 'b', 'b']);
  });

  it('returns a short week rather than one that breaks every cap', () => {
    const program = fixture(
      [type('a'), type('b')],
      [
        { kind: 'max-per-week', sessionTypeId: 'a', count: 1, note: 'One A.' },
        { kind: 'max-per-week', sessionTypeId: 'b', count: 1, note: 'One B.' },
      ] as Program['constraints'],
    );
    expect(sessionsForDays(program, 5)).toEqual(['a', 'b']);
  });
});

describe('assignSessions', () => {
  it('keeps the priority order when that week already works', () => {
    const program = fixture([type('a'), type('b')]);
    expect(assignSessions(program, [1, 4], ['a', 'b'])).toEqual({ 1: 'a', 4: 'b' });
  });

  // Before M55 the order was whatever the cycle produced, and an
  // order-in-week rule was satisfied by luck or not at all.
  it('reorders to respect a rule the priority order would break', () => {
    const program = fixture(
      [type('perf'), type('tech')],
      [{ kind: 'order-in-week', first: 'tech', then: 'perf', note: 'Technique first.' }] as Program['constraints'],
    );
    expect(assignSessions(program, [1, 4], ['perf', 'tech'])).toEqual({ 1: 'tech', 4: 'perf' });
  });

  it('finds the arrangement that breaks no hard rule', () => {
    const program = fixture(
      [type('fp'), type('perf'), type('vol')],
      [
        { kind: 'not-day-before', sessionTypeId: 'fp', before: 'perf', note: 'Never fingers the day before hard climbing.' },
      ] as Program['constraints'],
    );
    const plan = assignSessions(program, [1, 2, 3], ['fp', 'perf', 'vol']);
    expect(validateWeek(program, plan).filter((v) => v.severity === 'error')).toEqual([]);
  });
});
