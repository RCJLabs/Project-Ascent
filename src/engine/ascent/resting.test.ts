import { describe, expect, it } from 'vitest';
import { newProject, type Project } from '@/db/projects';
import { newSession, type ProjectAttempt, type Session } from '@/db/sessions';
import { DEFAULT_DISPLAY } from '@/engine/grades';
import { describeBurns, describeClimb, restingFor } from './resting';

const TODAY = '2026-09-15';
let counter = 0;

const project = (patch: Partial<Project> = {}): Project =>
  newProject({ name: 'Blue Moon', grade: 'V7', scale: 'V', id: 'p1', ...patch });

const burn = (projectId: string, patch: Partial<ProjectAttempt> = {}): ProjectAttempt => ({
  id: `a${counter++}`,
  projectId,
  outcome: 'fell-mid',
  count: 1,
  ...patch,
});

const session = (date: string, attempts: ProjectAttempt[]): Session =>
  newSession(date, counter++, { completed: true, projectAttempts: attempts });

const ask = (projects: Project[], sessions: Session[] = []) =>
  restingFor({ projects, sessions, display: DEFAULT_DISPLAY, today: TODAY });

describe('what the rest is for', () => {
  it('says nothing when there is no project on the go', () => {
    expect(ask([])).toBeNull();
    expect(ask([project({ status: 'sent' })])).toBeNull();
    expect(ask([project({ status: 'shelved' })])).toBeNull();
  });

  it('takes the one touched most recently, not the one touched most', () => {
    // A climber with two on the go is working the one they were on last
    // week; twenty burns from last winter is the wrong answer however big
    // the number is.
    const old = project({ id: 'old', name: 'Old Growth' });
    const now = project({ id: 'now', name: 'Blue Moon' });
    const sessions = [
      session('2026-01-04', [burn('old'), burn('old'), burn('old'), burn('old')]),
      session('2026-01-05', [burn('old'), burn('old'), burn('old')]),
      session('2026-09-12', [burn('now')]),
    ];
    expect(ask([old, now], sessions)?.name).toBe('Blue Moon');
  });

  it('breaks a tie on burns', () => {
    const a = project({ id: 'a', name: 'Alpha' });
    const b = project({ id: 'b', name: 'Beta' });
    const sessions = [session('2026-09-12', [burn('a'), burn('b'), burn('b')])];
    expect(ask([a, b], sessions)?.name).toBe('Beta');
  });

  it('still names an untouched project, because it is still the climb you said', () => {
    expect(ask([project()])?.name).toBe('Blue Moon');
    expect(ask([project()])?.daysSinceLast).toBeNull();
  });

  it('reads the grade in the climber’s notation', () => {
    const font = restingFor({
      projects: [project()],
      sessions: [],
      display: { boulder: 'Font', route: 'YDS' },
      today: TODAY,
    });
    expect(font?.grade).toBe('7A+');
    expect(ask([project()])?.grade).toBe('V7');
  });

  it('carries where it is, and nothing when the field is blank', () => {
    expect(ask([project({ location: 'The Works' })])?.location).toBe('The Works');
    expect(ask([project({ location: '   ' })])?.location).toBeNull();
    expect(ask([project()])?.location).toBeNull();
  });

  it('counts the days and the high point from the log', () => {
    const sessions = [
      session('2026-09-10', [burn('p1', { highPoint: 60 })]),
      session('2026-09-12', [burn('p1', { highPoint: 80 })]),
      session('2026-09-12', [burn('p1', { highPoint: 40 })]),
    ];
    const resting = ask([project({ location: 'The Works' })], sessions)!;
    expect(resting.days).toBe(2);
    expect(resting.daysSinceLast).toBe(3);
    expect(resting.highPoint).toBe(80);
  });
});

describe('said out loud', () => {
  const facts = (patch: Partial<ReturnType<typeof ask>> = {}) => ({
    id: 'p1',
    name: 'Blue Moon',
    grade: 'V7',
    location: 'The Works',
    days: 14,
    daysSinceLast: 3,
    highPoint: 80,
    ...patch,
  });

  it('names the grade, and the place when there is one', () => {
    expect(describeClimb(facts())).toBe('V7, at The Works');
    expect(describeClimb(facts({ location: null }))).toBe('V7');
  });

  it('says how it is going', () => {
    expect(describeBurns(facts())).toBe('14 days on it, last touched 3 days ago. High point 80%.');
    expect(describeBurns(facts({ days: 1, daysSinceLast: 0 }))).toBe(
      '1 day on it, last touched today. High point 80%.',
    );
    expect(describeBurns(facts({ daysSinceLast: 1 }))).toBe(
      '14 days on it, last touched yesterday. High point 80%.',
    );
    expect(describeBurns(facts({ highPoint: null }))).toBe('14 days on it, last touched 3 days ago.');
  });

  it('stays quiet about a climb with no burns on it', () => {
    // "0 days on it" is the app telling somebody off for a climb they have
    // only just written down.
    expect(describeBurns(facts({ days: 0, daysSinceLast: null }))).toBeNull();
    expect(describeBurns(facts({ daysSinceLast: null }))).toBeNull();
  });
});
