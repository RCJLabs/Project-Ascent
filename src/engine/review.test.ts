import { deriveClimberState } from './derive';
import { weeklyChallenges } from './challenges';
import { describe, expect, it } from 'vitest';
import type { BodyPart } from '@/content/bodyParts';
import { getProgram } from '@/content/programs';
import { newProject } from '@/db/projects';
import { newSession, type Session } from '@/db/sessions';
import { addDays, startOfWeek } from './dates';
import { buildReview, type ReviewInput } from './review';

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

  it('shows the challenges it was handed, and none when it was handed none', () => {
    /**
     * It used to resolve them itself (PLAN.md M230). That one import put the
     * whole board engine — the daily ladder, the weekly table, the bounty
     * generator — into the **entry chunk**, because `ReviewCard` is on Home,
     * for a field that only the lazy review page reads. Measured at 2.12KB
     * gzipped.
     *
     * So the contract is now a pass-through, and this checks both halves:
     * what arrives is reported, and a caller that hands over nothing gets an
     * empty board rather than a resolved one.
     */
    const sessions = [...baseline(), ...[1, 3, 5].map((d) => session(addDays(THIS_WEEK, d)))];
    const list = weeklyChallenges(sessions, deriveClimberState(sessions), THIS_WEEK, 3);
    expect(list.length).toBe(3);

    const r = review(sessions, { challenges: list });
    expect(r.challenges.total).toBe(3);
    expect(r.challenges.done).toBe(list.filter((c) => c.done).length);
    expect(r.challenges.list.every((c) => c.from === THIS_WEEK)).toBe(true);

    expect(review(sessions).challenges).toEqual({ done: 0, total: 0, list: [] });
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
      for (const injuries of [[], ['elbow'] as BodyPart[]]) {
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

/**
 * A part-week is not compared against a whole one (PLAN.md M254).
 *
 * `yearReview.ts` opens with an essay about this: *"A year-in-review that
 * compares a part-finished year against a full one tells every climber they
 * are having a worse year until roughly December."* `blockCompare.ts` guards
 * it from the other side. The weekly note — fifty-two readings a year against
 * the year page's one — took the whole of last week and divided by however
 * much of this one had happened.
 */
describe('comparing a week that is still running', () => {
  /** TODAY is a Wednesday, so this week holds Sunday to Wednesday. */
  const lastWeek = (days: number[]) =>
    days.map((d) => session(addDays(addDays(THIS_WEEK, -7), d), { rpe: 7, durationMin: 90 }));
  const thisWeek = (days: number[]) =>
    days.map((d) => session(addDays(THIS_WEEK, d), { rpe: 7, durationMin: 90 }));

  it('takes the same days out of last week', () => {
    // Three sessions each, in the same first four days. The rest of last
    // week — Thursday, Friday, Saturday — is not this week's to be measured
    // against yet.
    const r = review([...lastWeek([0, 2, 3, 4, 5, 6]), ...thisWeek([0, 2, 3])]);
    expect(r.inProgress).toBe(true);
    expect(r.sessionsPrior, 'Sunday to Wednesday of last week, not all of it').toBe(3);
    expect(r.load).toBe(r.loadPrior);
    expect(r.loadDelta).toBe(0);
  });

  it('called a matched week a collapse before', () => {
    // The same fixture, measured the old way: six sessions against three.
    const r = review([...lastWeek([0, 2, 3, 4, 5, 6]), ...thisWeek([0, 2, 3])]);
    const wholeOfLastWeek = 6 * (7 * 1.5);
    expect(wholeOfLastWeek).toBeGreaterThan(r.loadPrior);
    expect(r.loadDelta, 'would have read -50%').not.toBeCloseTo(-0.5);
  });

  /**
   * A finished week still takes the whole of the one before it — every day
   * of it. The first version of this test read only `sessions`, which is
   * this week's count, so clamping the *prior* slice changed nothing it
   * looked at and the battery walked straight through.
   */
  it('leaves a finished week exactly as it was', () => {
    const lastSaturday = addDays(THIS_WEEK, -1);
    // Sessions on the last day of the week before the one under review: the
    // days a short slice would drop.
    const twoWeeksBack = addDays(THIS_WEEK, -14);
    const r = review(
      [
        ...lastWeek([0, 2, 3, 4, 5, 6]),
        ...[0, 5, 6].map((d) => session(addDays(twoWeeksBack, d), { rpe: 7, durationMin: 90 })),
      ],
      { date: lastSaturday },
    );
    expect(r.inProgress).toBe(false);
    expect(r.sessions).toBe(6);
    // All three, including the ones on the last days of that week.
    expect(r.sessionsPrior).toBe(3);
  });
});

describe('the note on a week that has not finished', () => {
  const note = (sessions: Session[], extra: Partial<ReviewInput> = {}) =>
    review(sessions, { program: getProgram('iron_grip'), ...extra }).note;

  /**
   * "A short week is not a failure — next week starts clean" was written for
   * a week that is over, and was delivered on a Wednesday with three days
   * left in it. `inProgress` has been on the shape all along; only the page
   * subtitle ever read it.
   */
  it('does not write off a week with days left in it', () => {
    const n = note([...baseline(), session(addDays(THIS_WEEK, 1), { warmup: true })]);
    expect(n.id).toBe('short');
    expect(n.headline).toMatch(/so far/);
    expect(n.body, 'the week has not ended').not.toMatch(/next week starts clean/);
    expect(n.body).toMatch(/Still time/);
  });

  it('still writes off a week that is over', () => {
    const lastSaturday = addDays(THIS_WEEK, -1);
    const n = note([...baseline(), session(addDays(THIS_WEEK, -7), { warmup: true })], {
      date: lastSaturday,
    });
    expect(n.id).toBe('short');
    expect(n.headline).not.toMatch(/so far/);
    expect(n.body).toMatch(/next week starts clean/);
  });

  it('calls a blank week in progress a note rather than a verdict', () => {
    const n = note(baseline());
    expect(n.id).toBe('blank');
    expect(n.headline).toBe('Nothing logged yet this week');
    expect(n.body).toMatch(/still running, so this is a note rather than a verdict/);
  });
});
