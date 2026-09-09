import { describe, expect, it } from 'vitest';
import { newProject, type Project } from '@/db/projects';
import { newSession, type ProjectAttempt, type Session } from '@/db/sessions';
import {
  applyPatch,
  attemptsFor,
  highPointOf,
  reconcileProjects,
  suggestProjects,
  summariseProject,
} from './projects';

const TODAY = '2026-09-09';
let counter = 0;

function project(patch: Partial<Project> = {}): Project {
  return newProject({ name: 'Midnight Lightning', grade: 'V8', scale: 'V', id: 'p1', ...patch });
}

function burn(patch: Partial<ProjectAttempt> = {}): ProjectAttempt {
  return { id: `a${counter++}`, projectId: 'p1', outcome: 'fell-mid', count: 1, ...patch };
}

function session(date: string, attempts: ProjectAttempt[], index = counter++): Session {
  return newSession(date, index, { completed: true, projectAttempts: attempts });
}

describe('highPointOf', () => {
  it('falls back to the outcome, and an explicit value wins', () => {
    expect(highPointOf(burn({ outcome: 'fell-high' }))).toBe(75);
    expect(highPointOf(burn({ outcome: 'fell-high', highPoint: 62 }))).toBe(62);
    // Rehearsal is not a redpoint burn, so it has no high point at all.
    expect(highPointOf(burn({ outcome: 'worked' }))).toBeNull();
  });
});

describe('summariseProject', () => {
  it('derives burns, days and the high point from sessions alone', () => {
    const sessions = [
      session('2026-09-01', [burn({ outcome: 'worked', count: 3 })]),
      session('2026-09-04', [burn({ outcome: 'fell-low' }), burn({ outcome: 'fell-high', count: 2 })]),
      session('2026-09-07', [burn({ outcome: 'fell-crux' })]),
    ];
    const s = summariseProject('p1', sessions, TODAY);
    expect(s.burns).toBe(7);
    expect(s.days).toBe(3);
    expect(s.firstDate).toBe('2026-09-01');
    expect(s.lastDate).toBe('2026-09-07');
    expect(s.daysSinceLast).toBe(2);
    expect(s.highPoint).toBe(90);
    expect(s.bestOutcome).toBe('fell-crux');
    expect(s.sendDate).toBeNull();
  });

  it('graphs the best high point per day, skipping rehearsal-only days', () => {
    const sessions = [
      session('2026-09-01', [burn({ outcome: 'worked' })]),
      session('2026-09-04', [burn({ outcome: 'fell-low' }), burn({ outcome: 'fell-high' })]),
    ];
    const s = summariseProject('p1', sessions, TODAY);
    expect(s.highPointByDay).toEqual([{ date: '2026-09-04', value: 75 }]);
  });

  it('ignores attempts belonging to other projects', () => {
    const sessions = [session('2026-09-04', [burn(), burn({ projectId: 'p2', outcome: 'send' })])];
    const s = summariseProject('p1', sessions, TODAY);
    expect(s.burns).toBe(1);
    expect(s.sendDate).toBeNull();
  });

  it('reads a day out of order the same way', () => {
    const late = session('2026-09-07', [burn({ outcome: 'fell-crux' })]);
    const early = session('2026-09-01', [burn({ outcome: 'fell-low' })]);
    expect(summariseProject('p1', [late, early], TODAY).firstDate).toBe('2026-09-01');
  });

  it('is empty, not broken, with no attempts', () => {
    const s = summariseProject('p1', [], TODAY);
    expect(s).toMatchObject({ burns: 0, days: 0, highPoint: null, daysSinceLast: null, lastDate: null });
  });
});

describe('reconcileProjects — the appliedAt fold', () => {
  it('applies a send once and never again', () => {
    const sessions = [session('2026-09-04', [burn({ outcome: 'send' })], 0)];
    const first = reconcileProjects([project()], sessions, 'NOW');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ reason: 'sent' });
    expect(first[0]!.changes).toMatchObject({
      status: 'sent',
      sentDate: '2026-09-04',
      sendAppliedFrom: '2026-09-04#0',
      appliedAt: 'NOW',
    });

    // The whole point: replaying over unchanged data changes nothing.
    const sent = applyPatch(project(), first[0]!);
    expect(reconcileProjects([sent], sessions, 'LATER')).toEqual([]);
    expect(reconcileProjects([sent], sessions, 'LATER')).toEqual([]);
  });

  it('does not resurrect a project the climber shelved after sending', () => {
    const sessions = [session('2026-09-04', [burn({ outcome: 'send' })], 0)];
    const sent = applyPatch(project(), reconcileProjects([project()], sessions, 'NOW')[0]!);
    const shelved: Project = { ...sent, status: 'shelved' };
    expect(reconcileProjects([shelved], sessions, 'LATER')).toEqual([]);
  });

  it('retracts when the send attempt is deleted', () => {
    const sessions = [session('2026-09-04', [burn({ outcome: 'send' })], 0)];
    const sent = applyPatch(project(), reconcileProjects([project()], sessions, 'NOW')[0]!);

    const withoutSend = [session('2026-09-04', [burn({ outcome: 'fell-crux' })], 0)];
    const patches = reconcileProjects([sent], withoutSend, 'LATER');
    expect(patches[0]).toMatchObject({ reason: 'retracted' });
    const back = applyPatch(sent, patches[0]!);
    expect(back.status).toBe('active');
    expect(back.sendAppliedFrom).toBeUndefined();
    expect(back.sentDate).toBeUndefined();
    // And the retraction, too, happens exactly once.
    expect(reconcileProjects([back], withoutSend, 'LATER')).toEqual([]);
  });

  it('keeps a manual shelve when retracting', () => {
    const sent = applyPatch(
      project(),
      reconcileProjects([project()], [session('2026-09-04', [burn({ outcome: 'send' })], 0)], 'NOW')[0]!,
    );
    const shelved: Project = { ...sent, status: 'shelved' };
    const back = applyPatch(shelved, reconcileProjects([shelved], [], 'LATER')[0]!);
    expect(back.status).toBe('shelved');
    expect(back.sendAppliedFrom).toBeUndefined();
  });

  it('re-points when the send moves to another session', () => {
    const sent = applyPatch(
      project(),
      reconcileProjects([project()], [session('2026-09-04', [burn({ outcome: 'send' })], 0)], 'NOW')[0]!,
    );
    const moved = [session('2026-09-06', [burn({ outcome: 'send' })], 1)];
    const patches = reconcileProjects([sent], moved, 'LATER');
    expect(patches[0]).toMatchObject({ reason: 'moved' });
    expect(patches[0]!.changes.sentDate).toBe('2026-09-06');
    expect(reconcileProjects([applyPatch(sent, patches[0]!)], moved, 'LATER')).toEqual([]);
  });

  it('credits the first send when a project is sent twice', () => {
    const sessions = [
      session('2026-09-04', [burn({ outcome: 'send' })], 0),
      session('2026-09-11', [burn({ outcome: 'send' })], 1),
    ];
    expect(reconcileProjects([project()], sessions, 'NOW')[0]!.changes.sentDate).toBe('2026-09-04');
  });

  it('leaves untouched projects alone', () => {
    expect(reconcileProjects([project()], [session('2026-09-04', [burn()], 0)], 'NOW')).toEqual([]);
  });
});

describe('attemptsFor', () => {
  it('returns attempts oldest first with their session and date attached', () => {
    const sessions = [session('2026-09-07', [burn({ id: 'b' })], 1), session('2026-09-01', [burn({ id: 'a' })], 0)];
    expect(attemptsFor('p1', sessions).map((a) => a.id)).toEqual(['a', 'b']);
    expect(attemptsFor('p1', sessions)[0]).toMatchObject({ date: '2026-09-01', sessionId: '2026-09-01#0' });
  });
});

describe('suggestProjects', () => {
  function tried(date: string, name: string, grade = 'V7', result: 'send' | 'attempt' = 'attempt'): Session {
    return newSession(date, counter++, {
      completed: true,
      climbs: [{ id: `c${counter++}`, grade, scale: 'V', count: 1, result, name }],
    });
  }

  it('offers a named climb attempted across two or more sessions', () => {
    const out = suggestProjects([tried('2026-09-01', 'The Nose'), tried('2026-09-05', 'The Nose')], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: 'the nose', name: 'The Nose', grade: 'V7', sessions: 2, lastDate: '2026-09-05' });
  });

  it('does not offer one bad day', () => {
    expect(suggestProjects([tried('2026-09-01', 'The Nose')], [])).toEqual([]);
  });

  it('does not offer a climb you keep sending', () => {
    const sessions = [tried('2026-09-01', 'Warmup Jug', 'V2', 'send'), tried('2026-09-05', 'Warmup Jug', 'V2', 'send')];
    expect(suggestProjects(sessions, [])).toEqual([]);
  });

  it('does not offer something already tracked, whatever the capitalisation', () => {
    const sessions = [tried('2026-09-01', 'The Nose'), tried('2026-09-05', 'the NOSE')];
    expect(suggestProjects(sessions, [project({ name: 'The nose' })])).toEqual([]);
  });

  it('respects dismissals', () => {
    const sessions = [tried('2026-09-01', 'The Nose'), tried('2026-09-05', 'The Nose')];
    expect(suggestProjects(sessions, [], ['the nose'])).toEqual([]);
  });

  it('counts sessions, not burns', () => {
    const twice = newSession('2026-09-01', counter++, {
      climbs: [
        { id: 'x1', grade: 'V7', scale: 'V', count: 4, result: 'attempt', name: 'The Nose' },
        { id: 'x2', grade: 'V7', scale: 'V', count: 2, result: 'attempt', name: 'The Nose' },
      ],
    });
    expect(suggestProjects([twice], [])).toEqual([]);
  });

  it('keeps the hardest grade logged under one name', () => {
    const sessions = [tried('2026-09-01', 'The Nose', 'V6'), tried('2026-09-05', 'The Nose', 'V8')];
    expect(suggestProjects(sessions, [])[0]!.grade).toBe('V8');
  });

  it('skips unnamed and unparseable climbs', () => {
    const unnamed = newSession('2026-09-01', counter++, {
      climbs: [{ id: 'u1', grade: 'V7', scale: 'V', count: 1, result: 'attempt' }],
    });
    const nonsense = [tried('2026-09-01', 'Ghost', 'V99'), tried('2026-09-05', 'Ghost', 'V99')];
    expect(suggestProjects([unnamed, ...nonsense], [])).toEqual([]);
  });
});
