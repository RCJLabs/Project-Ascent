import { describe, expect, it } from 'vitest';
import { PROGRAMS } from '@/content/programs';
import { PEAK_PERFORMANCE, THE_CRUISER } from '@/content/programs/catalogue';
import { validateProgram } from '@/content/validate';
import { atLeastAsHard, INTENSITY_ORDER, type Program } from '@/content/types';
import { intensityOf, sessionPriority, sessionsForDays, validateWeek, type WeekPlan } from './scheduler';

/**
 * Hardness in the model (PLAN.md M131).
 *
 * The scheduler could space *named* sessions and could not space *hard*
 * ones, so every program that wanted "no two hard days running" wrote the
 * pairs out by hand and wrote the general rule in a note nothing could
 * read. The Cruiser's was the one that had drifted: its note said 48 hours
 * between hangboard and hard climbing over a constraint that only ever
 * compared hangboard days with each other.
 */

describe('how hard a day is', () => {
  it('orders the four', () => {
    expect(atLeastAsHard('max', 'hard')).toBe(true);
    expect(atLeastAsHard('hard', 'hard')).toBe(true);
    expect(atLeastAsHard('moderate', 'hard')).toBe(false);
    expect(INTENSITY_ORDER).toEqual(['easy', 'moderate', 'hard', 'max']);
  });

  it('calls a rest day easy without being told', () => {
    expect(intensityOf({ id: 'r', name: 'Rest', icon: '💤', description: '', isRest: true })).toBe('easy');
  });

  it('calls an unauthored working day ordinary, not maximal', () => {
    // A half-written custom program has to stay schedulable, and a default
    // of `max` would make every generated week illegal.
    expect(intensityOf({ id: 'x', name: 'Something', icon: '💪', description: '' })).toBe('moderate');
  });

  it('is stated by every working session in the catalogue', () => {
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        if (type.isRest) continue;
        expect(type.intensity, `${program.id}/${type.id}`).toBeDefined();
      }
    }
  });
});

describe('the catalogue keeps it honest', () => {
  it('rejects a working session that does not say', () => {
    const broken = structuredClone(PEAK_PERFORMANCE) as Program;
    delete broken.sessionTypes[0]!.intensity;
    expect(validateProgram(broken).join(' ')).toMatch(/does not say how hard it is/);
  });

  it('rejects a rule about days a program does not have', () => {
    const broken = structuredClone(PEAK_PERFORMANCE) as Program;
    for (const type of broken.sessionTypes) if (!type.isRest) type.intensity = 'easy';
    broken.constraints.push({ kind: 'no-back-to-back', intensity: 'max', note: 'Never two.' });
    expect(validateProgram(broken).join(' ')).toMatch(/asks about 'max' days and there are none/);
  });

  it('lets a rest day stay silent', () => {
    expect(validateProgram(PEAK_PERFORMANCE)).toEqual([]);
  });
});

describe('never two hard days running', () => {
  /** A program with one of each, so a week can be built out of them. */
  const program = {
    id: 'test',
    sessionTypes: [
      { id: 'limit', name: 'Limit', icon: '🔥', description: '', intensity: 'max' },
      { id: 'strong', name: 'Strong', icon: '💪', description: '', intensity: 'hard' },
      { id: 'easy', name: 'Easy', icon: '🌿', description: '', intensity: 'easy' },
      { id: 'rest', name: 'Rest', icon: '💤', description: '', isRest: true },
    ],
    constraints: [{ kind: 'no-back-to-back', intensity: 'hard', note: 'Leave a day.' }],
  } as unknown as Program;

  const fired = (plan: WeekPlan) =>
    validateWeek(program, plan).filter((v) => v.kind === 'no-back-to-back');

  it('fires on two hard days in a row', () => {
    expect(fired({ 1: 'limit', 2: 'strong' })).toHaveLength(1);
  });

  it('is quiet with a day between them', () => {
    expect(fired({ 1: 'limit', 3: 'strong' })).toHaveLength(0);
  });

  it('is quiet when a rest day sits between them', () => {
    expect(fired({ 1: 'limit', 2: 'rest', 3: 'strong' })).toHaveLength(0);
  });

  it('is quiet when only one of the pair is hard', () => {
    expect(fired({ 1: 'limit', 2: 'easy' })).toHaveLength(0);
  });

  it('counts Saturday into Sunday, because weeks repeat', () => {
    // The week is a loop, not a list: a block that ends hard on Saturday
    // and opens hard on Sunday is two hard days running, every week.
    expect(fired({ 6: 'limit', 0: 'strong' })).toHaveLength(1);
  });

  it('is an error, not a note', () => {
    expect(fired({ 1: 'limit', 2: 'strong' })[0]!.severity).toBe('error');
  });

  it('names both days, so the calendar can point at them', () => {
    expect(fired({ 1: 'limit', 2: 'strong' })[0]!.days).toEqual([1, 2]);
  });
});

describe('The Cruiser, whose note had outrun its rule', () => {
  it('now refuses a hangboard day beside hard climbing', () => {
    const broken = validateWeek(THE_CRUISER, { 1: 'hb', 2: 'perf' });
    expect(broken.some((v) => v.kind === 'no-back-to-back')).toBe(true);
  });

  it('still likes its own recommended week', () => {
    expect(validateWeek(THE_CRUISER, THE_CRUISER.recommendedLayout!.slots)).toEqual([]);
  });

  it('complains once, not twice', () => {
    // A separate 48-hour rule between Performance and Endurance said the
    // same thing as this one in hours rather than days, so moving Endurance
    // next to Performance was told off twice in different words — found in
    // a browser, where both sentences sat in the same move dialogue.
    const week = { 1: 'vol', 2: 'str', 3: 'end', 4: 'perf' } as const;
    expect(validateWeek(THE_CRUISER, week)).toHaveLength(1);
  });
});

describe('what a longer week repeats', () => {
  it('takes a second easy day, not a second limit day', () => {
    // Four session types across six days. The first pass is the program;
    // the two after it are a second helping, and nobody's coach adds a
    // second limit day to fill a gap.
    const week = sessionsForDays(PEAK_PERFORMANCE, 6);
    const extra = week.slice(PEAK_PERFORMANCE.sessionTypes.filter((t) => !t.isRest).length);
    const hardness = (id: string) =>
      intensityOf(PEAK_PERFORMANCE.sessionTypes.find((t) => t.id === id));
    expect(extra.length).toBeGreaterThan(0);
    for (const id of extra) expect(hardness(id), id).not.toBe('max');
  });

  it('still opens with what the program asks for', () => {
    // Priority decides the first pass, and a milestone about recovery is
    // not allowed to quietly reorder what a program *is*. Against
    // `sessionPriority` itself rather than against a shorter week, which
    // is the same code answering the same way: a version that sorted every
    // pass by intensity agreed with itself perfectly.
    const priority = sessionPriority(PEAK_PERFORMANCE);
    expect(sessionsForDays(PEAK_PERFORMANCE, priority.length)).toEqual(priority);
    expect(sessionsForDays(PEAK_PERFORMANCE, 6).slice(0, priority.length)).toEqual(priority);
  });

  it('keeps a short week exactly as it was', () => {
    expect(sessionsForDays(PEAK_PERFORMANCE, 2)).toHaveLength(2);
  });
});
