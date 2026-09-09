import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import { newProject } from '@/db/projects';
import { newSession, type Session } from '@/db/sessions';
import { addDays, startOfWeek } from './dates';
import { buildReview, weeksAgo, type ReviewInput } from './review';

const TODAY = '2026-09-09'; // a Wednesday
const THIS_WEEK = startOfWeek(TODAY);
let counter = 0;

function session(date: string, patch: Partial<Session> = {}): Session {
  return newSession(date, counter++, { completed: true, rpe: 7, durationMin: 90, ...patch });
}
function climb(grade: string, count = 1, patch: Record<string, unknown> = {}) {
  return {
    id: `c${counter++}`,
    grade,
    scale: (grade.startsWith('V') ? 'V' : 'YDS') as 'V' | 'YDS',
    count,
    result: 'send' as const,
    ...patch,
  };
}
function rest(date: string): Session {
  return session(date, {
    climbs: [],
    restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true },
  });
}
const review = (sessions: Session[], extra: Partial<ReviewInput> = {}) =>
  buildReview({ sessions, today: TODAY, ...extra });

/** Enough history that ACWR has a baseline to read. */
function baseline(weeks = 8): Session[] {
  const out: Session[] = [];
  for (let w = weeks; w >= 2; w--) {
    const start = addDays(THIS_WEEK, -7 * w);
    for (const d of [0, 2, 4]) out.push(session(addDays(start, d), { warmup: true }));
  }
  return out;
}

describe('the week window', () => {
  it('runs Sunday to Saturday around the date given', () => {
    const r = review([]);
    expect(r.from).toBe(THIS_WEEK);
    expect(r.to).toBe(addDays(THIS_WEEK, 6));
    expect(r.inProgress).toBe(true);
  });

  it('rebuilds an old week exactly, and knows it is finished', () => {
    const lastWeek = addDays(THIS_WEEK, -7);
    const r = review([session(addDays(lastWeek, 1))], { date: lastWeek });
    expect(r.from).toBe(lastWeek);
    expect(r.inProgress).toBe(false);
    expect(r.sessions).toBe(1);
    expect(weeksAgo(r, TODAY)).toBe(0);
  });

  it('counts only what happened inside the window', () => {
    const sessions = [
      session(addDays(THIS_WEEK, -1), { climbs: [climb('V5', 10)] }),
      session(addDays(THIS_WEEK, 1), { climbs: [climb('V3', 4)] }),
      session(addDays(THIS_WEEK, 7), { climbs: [climb('V6', 9)] }),
    ];
    const r = review(sessions);
    expect(r.sessions).toBe(1);
    expect(r.sends).toBe(4);
  });
});

describe('what the week says', () => {
  it('compares load against the week before', () => {
    const last = addDays(THIS_WEEK, -7);
    const sessions = [
      session(addDays(last, 1), { rpe: 6, durationMin: 60 }),
      session(addDays(last, 3), { rpe: 6, durationMin: 60 }),
      session(addDays(THIS_WEEK, 1), { rpe: 8, durationMin: 120 }),
    ];
    const r = review(sessions);
    expect(r.loadPrior).toBe(12);
    expect(r.load).toBe(16);
    expect(r.loadDelta).toBeCloseTo(1 / 3);
  });

  it('withholds a comparison rather than dividing by an empty week', () => {
    expect(review([session(addDays(THIS_WEEK, 1))]).loadDelta).toBeNull();
  });

  it('names the hardest send on each ladder', () => {
    const sessions = [
      session(addDays(THIS_WEEK, 1), {
        climbs: [climb('V3', 5), climb('V6', 2), climb('5.10a', 3), climb('5.11c')],
      }),
    ];
    const r = review(sessions);
    expect(r.best).toEqual([
      { scale: 'V', grade: 'V6', count: 2 },
      { scale: 'YDS', grade: '5.11c', count: 1 },
    ]);
    expect(r.sends).toBe(11);
  });

  it('picks up records, height, rest days and outdoor days', () => {
    const sessions = [
      ...baseline(),
      session(addDays(THIS_WEEK, 1), { climbs: [climb('V7')], mode: 'outdoor' }),
      rest(addDays(THIS_WEEK, 2)),
    ];
    const r = review(sessions);
    expect(r.records.map((x) => x.grade)).toContain('V7');
    expect(r.outdoorDays).toBe(1);
    expect(r.restDays).toBe(1);
    // One outdoor boulder send: 15 ft × 1.25.
    expect(r.feet).toBe(19);
  });

  it('reads the program target rather than assuming three', () => {
    const program = getProgram('iron_grip')!;
    expect(review([], { program }).target).toBe(
      (program.constraints.find((c) => c.kind === 'sessions-per-week') as { min: number }).min,
    );
    expect(review([]).target).toBe(3);
  });

  it('resolves the week board from the log', () => {
    const sessions = [...baseline(), ...[1, 3, 5].map((d) => session(addDays(THIS_WEEK, d)))];
    const r = review(sessions);
    expect(r.challenges.total).toBe(3);
    expect(r.challenges.list.every((c) => c.from === THIS_WEEK)).toBe(true);
  });

  it('counts a project sent inside the week', () => {
    const projects = [
      newProject({ id: 'p', name: 'The Prow', grade: 'V7', scale: 'V', status: 'sent', sentDate: addDays(THIS_WEEK, 2) }),
      newProject({ id: 'q', name: 'Old One', grade: 'V5', scale: 'V', status: 'sent', sentDate: addDays(THIS_WEEK, -20) }),
    ];
    expect(review([], { projects }).projectSends).toEqual(['The Prow']);
  });
});

describe('the coaching note', () => {
  const note = (sessions: Session[], extra: Partial<ReviewInput> = {}) =>
    review(sessions, extra).note;

  it('puts an injury above everything else', () => {
    const great = [...baseline(), session(addDays(THIS_WEEK, 1), { climbs: [climb('V9')] })];
    expect(note(great).id).toBe('record');
    expect(note(great, { injuries: ['shoulder'] }).id).toBe('injury');
  });

  it('gets the article right on a body part', () => {
    expect(note(baseline(), { injuries: ['elbow'] }).headline).toBe('Training around an elbow');
    expect(note(baseline(), { injuries: ['shoulder'] }).headline).toBe('Training around a shoulder');
    expect(note(baseline(), { injuries: ['ankle', 'wrist'] }).headline).toBe(
      'Training around an ankle and a wrist',
    );
  });

  it('flags a load spike before it praises the week', () => {
    const quiet = baseline(8).map((s) => ({ ...s, rpe: 4, durationMin: 30 }));
    const spike = [0, 1, 2, 3].map((d) =>
      session(addDays(THIS_WEEK, d), { rpe: 9, durationMin: 240, warmup: true }),
    );
    const n = note([...quiet, ...spike]);
    expect(n.id).toBe('spike');
    expect(n.tone).toBe('caution');
  });

  it('notices five sessions with no rest day', () => {
    const sessions = [...baseline(), ...[0, 1, 2, 3, 4].map((d) => session(addDays(THIS_WEEK, d), { warmup: true }))];
    expect(note(sessions).id).toBe('no-rest');
  });

  it('celebrates a record, then a project send', () => {
    const record = [...baseline(), session(addDays(THIS_WEEK, 1), { climbs: [climb('V8')], warmup: true })];
    expect(note(record).id).toBe('record');

    const projects = [newProject({ id: 'p', name: 'The Prow', grade: 'V7', scale: 'V', status: 'sent', sentDate: addDays(THIS_WEEK, 2) })];
    expect(note([...baseline(), session(addDays(THIS_WEEK, 1), { warmup: true })], { projects }).id).toBe('project');
  });

  it('calls out slipping warmups', () => {
    const sessions = [
      ...baseline(),
      session(addDays(THIS_WEEK, 1), { warmup: false }),
      session(addDays(THIS_WEEK, 3), { warmup: false }),
    ];
    expect(note(sessions).id).toBe('warmup');
  });

  it('says nothing clever about a blank week', () => {
    const n = note(baseline());
    expect(n.id).toBe('blank');
    expect(n.tone).toBe('neutral');
  });

  it('treats a short week as one week, not a failure', () => {
    const sessions = [...baseline(), session(addDays(THIS_WEEK, 1), { warmup: true })];
    expect(note(sessions).id).toBe('short');
  });

  it('always produces exactly one note, with all three fields', () => {
    const cases: Session[][] = [[], baseline(), [...baseline(), session(THIS_WEEK, { warmup: true })]];
    for (const sessions of cases) {
      for (const injuries of [[], ['elbow']]) {
        const n = note(sessions, { injuries });
        expect(n.headline.length).toBeGreaterThan(0);
        expect(n.body.length).toBeGreaterThan(20);
        expect(['good', 'caution', 'neutral']).toContain(n.tone);
      }
    }
  });
});

describe('next week', () => {
  it('is empty without an active plan', () => {
    expect(review([]).nextWeek).toEqual([]);
  });

  it('previews the seven days after the week under review', () => {
    const program = getProgram('iron_grip')!;
    const r = review([], {
      program,
      startDate: addDays(THIS_WEEK, -28),
      plan: { 1: 'fp', 3: 'power', 5: 'fp' },
    });
    expect(r.nextWeek).toHaveLength(7);
    expect(r.nextWeek[0]!.date).toBe(addDays(r.to, 1));
    expect(r.nextWeek.some((s) => !s.isRest)).toBe(true);
    expect(r.nextWeek.filter((s) => s.isRest).length).toBeGreaterThan(0);
  });
});
