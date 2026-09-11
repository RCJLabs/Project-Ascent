import { describe, expect, it } from 'vitest';
import { ENOUGH, costOf, projectHistory } from './projectHistory';
import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';

/**
 * What the projects cost (PLAN.md M69).
 *
 * Descriptive and only descriptive: these are counts of what happened, and
 * the module stays quiet where there is too little to mean anything.
 */

const project = (over: Partial<Project> & { id: string }): Project =>
  ({
    name: `Project ${over.id}`,
    grade: 'V5',
    scale: 'V',
    setting: 'indoor',
    status: 'sent',
    beta: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as Project;

/** A session on `date` carrying `outcomes` as burns on `projectId`. */
const session = (date: string, projectId: string, outcomes: string[]): Session =>
  ({
    id: `${date}#0`,
    date,
    completed: true,
    projectAttempts: outcomes.map((outcome) => ({ projectId, outcome })),
  }) as unknown as Session;

describe('one project', () => {
  const sessions = [
    session('2026-01-05', 'a', ['worked', 'fell-low']),
    session('2026-01-08', 'a', ['fell-mid', 'fell-high']),
    session('2026-01-12', 'a', ['fell-crux', 'send', 'worked']),
  ];

  it('counts the burns, the days and the span up to the send', () => {
    const cost = costOf(project({ id: 'a', sentDate: '2026-01-12' }), sessions)!;
    // Six burns up to and including the send; the seventh was afterwards.
    expect(cost.burns).toBe(6);
    expect(cost.sessions).toBe(3);
    expect(cost.span).toBe(7);
  });

  // A project climbed again after it went should not read as forty burns.
  it('ignores what happened after it went', () => {
    const later = [...sessions, session('2026-03-01', 'a', ['send', 'send', 'send'])];
    expect(costOf(project({ id: 'a', sentDate: '2026-01-12' }), later)!.burns).toBe(6);
  });

  it('says nothing about a project that is not sent', () => {
    expect(costOf(project({ id: 'a', status: 'active' }), sessions)).toBeNull();
    expect(costOf(project({ id: 'a', status: 'shelved' }), sessions)).toBeNull();
  });

  it('says nothing about a send with no burns behind it', () => {
    expect(costOf(project({ id: 'zz', sentDate: '2026-01-12' }), sessions)).toBeNull();
  });
});

describe('across the log', () => {
  function sent(id: string, grade: string, days: string[], burnsPerDay: number): { p: Project; s: Session[] } {
    const s = days.map((date, i) =>
      session(date, id, i === days.length - 1
        ? [...Array(burnsPerDay - 1).fill('fell-high'), 'send']
        : Array(burnsPerDay).fill('fell-high')),
    );
    return { p: project({ id, grade, sentDate: days.at(-1)! }), s };
  }

  const one = sent('a', 'V5', ['2026-01-01', '2026-01-05'], 3);
  const two = sent('b', 'V5', ['2026-02-01', '2026-02-10'], 5);
  const three = sent('c', 'V5', ['2026-03-01'], 4);
  const four = sent('d', 'V6', ['2026-04-01', '2026-04-20'], 9);
  const projects = [one.p, two.p, three.p, four.p];
  const sessions = [...one.s, ...two.s, ...three.s, ...four.s];

  it('groups by grade and takes the middle, not the mean', () => {
    const history = projectHistory(projects, sessions, '2026-05-01');
    const v5 = history.byGrade.find((g) => g.grade === 'V5')!;
    expect(v5.sends).toBe(3);
    // 6, 10 and 4 burns -> 6.
    expect(v5.burns).toBe(6);
    expect(v5.solid).toBe(true);
  });

  // Two sends at a grade is an anecdote, and the number should say so.
  it('marks a grade with too few sends as not solid', () => {
    const history = projectHistory(projects, sessions, '2026-05-01');
    const v6 = history.byGrade.find((g) => g.grade === 'V6')!;
    expect(v6.sends).toBe(1);
    expect(v6.solid).toBe(false);
    expect(ENOUGH).toBeGreaterThan(1);
  });

  it('stays quiet overall until there is enough of it', () => {
    expect(projectHistory([one.p], one.s, '2026-05-01').overall).toBeNull();
    expect(projectHistory(projects, sessions, '2026-05-01').overall).not.toBeNull();
  });

  it('reports how long an open project has sat, longest first', () => {
    const open = project({ id: 'e', status: 'active', grade: 'V7' });
    const touched = [session('2026-01-02', 'e', ['fell-low'])];
    const history = projectHistory([...projects, open], [...sessions, ...touched], '2026-05-01');
    expect(history.openest[0]).toMatchObject({ id: 'e', grade: 'V7' });
    expect(history.openest[0]!.days).toBe(119);
  });

  it('counts what was shelved, because that is a cost too', () => {
    const history = projectHistory([...projects, project({ id: 'f', status: 'shelved' })], sessions, '2026-05-01');
    expect(history.shelved).toBe(1);
  });

  it('lists sends newest first', () => {
    const dates = projectHistory(projects, sessions, '2026-05-01').sent.map((s) => s.sentDate);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('says nothing at all from an empty log', () => {
    const empty = projectHistory([], [], '2026-05-01');
    expect(empty).toMatchObject({ sent: [], byGrade: [], openest: [], shelved: 0, overall: null });
  });
});
