import { describe, expect, it } from 'vitest';
import { SKILL_TREES } from '@/content/skills';
import { newSession, type Session } from '@/db/sessions';
import { newProject, type Project } from '@/db/projects';
import { addDays } from './dates';
import {
  ACHIEVEMENT_COUNT,
  BREAK_DAYS,
  BURNS_FOR_PERSISTENCE,
  CLEAN_SHEET_CLIMBS,
  COMEBACK_DAYS,
  DELOAD_RPE_CAP,
  EASY_RPE,
  LONG_SESSION_MIN,
  OUTDOOR_MONTHS,
  MAXIMAL_RPE,
  SPREAD_GRADES,
  TRIP_DAYS,
  WARM_RUN,
  WEEK_DAYS,
  deriveAchievements,
  earnedCount,
  sortAchievements,
  type Achievement,
  type AchievementId,
  type AchievementInput,
} from './achievements';

/**
 * A shape in the log, never a running total (PLAN.md M32).
 *
 * The app already names accomplishments three ways and all three answer
 * "how much". These have to answer something else, or they are the same
 * facts in a fourth place.
 */

let counter = 0;
const TODAY = '2026-09-10';

function session(date: string, patch: Partial<Session> = {}): Session {
  return newSession(date, counter++, {
    completed: true,
    rpe: 7,
    durationMin: 90,
    warmup: true,
    ...patch,
  });
}
function climb(grade: string, patch: Record<string, unknown> = {}) {
  return {
    id: `c${counter++}`,
    grade,
    scale: (grade.startsWith('V') ? 'V' : 'YDS') as 'V' | 'YDS',
    count: 1,
    result: 'send' as const,
    ...patch,
  };
}
const rest = (date: string) =>
  session(date, {
    climbs: [],
    warmup: false,
    restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true },
  });

const build = (sessions: Session[], extra: Partial<AchievementInput> = {}) =>
  deriveAchievements({ sessions, ...extra });
const get = (list: Achievement[], id: AchievementId) => list.find((a) => a.id === id)!;
const dateOf = (sessions: Session[], id: AchievementId, extra: Partial<AchievementInput> = {}) =>
  get(build(sessions, extra), id).date;

describe('the set itself', () => {
  it('is fixed and finite', () => {
    const list = build([]);
    expect(list).toHaveLength(ACHIEVEMENT_COUNT);
    expect(ACHIEVEMENT_COUNT).toBeGreaterThan(0);
    // The same list whatever the log says, so "nine of fourteen" is stable.
    expect(build([session(TODAY)]).map((a) => a.id)).toEqual(list.map((a) => a.id));
  });

  it('has unique ids and names, and a sentence for each', () => {
    const list = build([]);
    expect(new Set(list.map((a) => a.id)).size).toBe(list.length);
    expect(new Set(list.map((a) => a.name)).size).toBe(list.length);
    for (const a of list) expect(a.detail.length, a.id).toBeGreaterThan(10);
  });

  it('gives an empty log nothing at all', () => {
    expect(earnedCount(build([]))).toBe(0);
    expect(build([]).every((a) => a.date === null)).toBe(true);
  });

  it('says what it takes whether or not it has been earned', () => {
    // A locked row with no sentence is a row that cannot be aimed at.
    for (const a of build([])) expect(a.detail, a.id).not.toBe('');
  });
});

describe('not being a fourth list of the same facts', () => {
  it('gives volume alone almost nothing, where the skill trees give plenty', () => {
    // Three hundred identical indoor sessions is a lot of *how much* and
    // almost no *what kind*. If these tracked totals, this log would sweep
    // them.
    const grind = Array.from({ length: 300 }, (_, i) =>
      session(addDays(TODAY, -(300 - i) * 2), { climbs: [climb('V4')] }),
    );
    const earned = earnedCount(build(grind));
    expect(earned).toBeLessThanOrEqual(3);
    expect(earned).toBeLessThan(ACHIEVEMENT_COUNT / 2);
  });

  it('does not repeat a skill node', () => {
    // "First Day Out" and "A Season" are rungs in the grit tree, and
    // `milestones.ts` announces the first outdoor day as well. Naming them
    // again here would be the same fact in a fourth place.
    const names = new Set(SKILL_TREES.flatMap((t) => t.nodes).map((n) => n.name.toLowerCase()));
    for (const a of build([])) expect(names.has(a.name.toLowerCase()), a.name).toBe(false);
  });
});

describe('turning up', () => {
  it('closes the circle only on twelve months of one year', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => session(`2026-${String(i + 1).padStart(2, '0')}-05`));
    expect(dateOf(eleven, 'full-circle')).toBeNull();
    expect(dateOf([...eleven, session('2026-12-05')], 'full-circle')).toBe('2026-12-05');
  });

  it('does not close it across a year boundary', () => {
    const split = [
      ...Array.from({ length: 6 }, (_, i) => session(`2025-${String(i + 7).padStart(2, '0')}-05`)),
      ...Array.from({ length: 6 }, (_, i) => session(`2026-${String(i + 1).padStart(2, '0')}-05`)),
    ];
    expect(dateOf(split, 'full-circle')).toBeNull();
  });

  it('dates the long way back to the session that ended the gap', () => {
    const back = addDays('2026-01-01', BREAK_DAYS);
    expect(dateOf([session('2026-01-01'), session(back)], 'long-way-back')).toBe(back);
    const short = addDays('2026-01-01', BREAK_DAYS - 1);
    expect(dateOf([session('2026-01-01'), session(short)], 'long-way-back')).toBeNull();
  });

  it('wants five separate days in one week, not five sessions', () => {
    const monday = '2026-09-07';
    const stacked = Array.from({ length: WEEK_DAYS }, () => session(monday));
    expect(dateOf(stacked, 'full-week')).toBeNull();
    const spread = Array.from({ length: WEEK_DAYS }, (_, i) => session(addDays(monday, i)));
    expect(dateOf(spread, 'full-week')).toBe(addDays(monday, WEEK_DAYS - 1));
  });

  it('breaks the warm run on a session that skipped it', () => {
    const run = (n: number, patch: Partial<Session> = {}) =>
      Array.from({ length: n }, (_, i) => session(addDays('2026-01-01', i), { climbs: [climb('V3')], ...patch }));
    expect(dateOf(run(WARM_RUN), 'always-warm')).toBe(addDays('2026-01-01', WARM_RUN - 1));
    const broken = [
      ...run(WARM_RUN - 1),
      session(addDays('2026-01-01', WARM_RUN - 1), { climbs: [climb('V3')], warmup: false }),
      ...Array.from({ length: 5 }, (_, i) =>
        session(addDays('2026-01-01', WARM_RUN + i), { climbs: [climb('V3')] }),
      ),
    ];
    expect(dateOf(broken, 'always-warm')).toBeNull();
  });

  it('does not let a rest day break or advance the warm run', () => {
    // A rest day has no warmup to tick. Counting it either way would make
    // this an achievement for never resting.
    const half = Math.floor(WARM_RUN / 2);
    const log = [
      ...Array.from({ length: half }, (_, i) => session(addDays('2026-01-01', i), { climbs: [climb('V3')] })),
      rest(addDays('2026-01-01', half)),
      ...Array.from({ length: WARM_RUN - half }, (_, i) =>
        session(addDays('2026-01-01', half + 1 + i), { climbs: [climb('V3')] }),
      ),
    ];
    // The date is the last real session, not one brought forward by the
    // rest day counting toward the run.
    expect(dateOf(log, 'always-warm')).toBe(addDays('2026-01-01', WARM_RUN));
  });

  it('counts training days rather than sessions for the week', () => {
    // Five sessions on one Saturday is one training day.
    const saturday = Array.from({ length: WEEK_DAYS + 3 }, () => session('2026-09-12'));
    expect(dateOf(saturday, 'full-week')).toBeNull();
  });
});

describe('climbing', () => {
  it('marks hard outside only when the hardest send was on rock', () => {
    const indoorBest = [session('2026-03-01', { climbs: [climb('V7')] }), session('2026-03-02', { mode: 'outdoor', climbs: [climb('V4')] })];
    expect(dateOf(indoorBest, 'hard-outside')).toBeNull();
    const outdoorBest = [...indoorBest, session('2026-03-03', { mode: 'outdoor', climbs: [climb('V7')] })];
    expect(dateOf(outdoorBest, 'hard-outside')).toBe('2026-03-03');
  });

  it('wants the flash at the limit, not below it', () => {
    const below = [
      session('2026-03-01', { climbs: [climb('V7')] }),
      session('2026-03-02', { climbs: [climb('V4', { style: 'flash' })] }),
    ];
    expect(dateOf(below, 'straight-up')).toBeNull();
    expect(dateOf([...below, session('2026-03-03', { climbs: [climb('V7', { style: 'flash' })] })], 'straight-up')).toBe('2026-03-03');
  });

  it('wants the on-sight outdoors, not in a gym', () => {
    expect(dateOf([session('2026-03-01', { climbs: [climb('V4', { style: 'onsight' })] })], 'no-beta-outdoors')).toBeNull();
    expect(
      dateOf([session('2026-03-02', { mode: 'outdoor', climbs: [climb('V4', { style: 'onsight' })] })], 'no-beta-outdoors'),
    ).toBe('2026-03-02');
  });

  it('counts different grades in one session, not repeats of one', () => {
    const same = session('2026-03-01', { climbs: Array.from({ length: 8 }, () => climb('V4')) });
    expect(dateOf([same], 'whole-spread')).toBeNull();
    const spread = session('2026-03-02', {
      climbs: Array.from({ length: SPREAD_GRADES }, (_, i) => climb(`V${i + 1}`)),
    });
    expect(dateOf([spread], 'whole-spread')).toBe('2026-03-02');
  });

  it('does not decide your limit by comparing two different ladders', () => {
    // 5.11a and V10 are both ordinal 10 on their own scales. Taking the
    // larger across both made a V7 boulderer who had also led a 5.11a
    // unable to earn a limit achievement on the wall they actually climb.
    const log = [
      session('2026-03-01', { climbs: [climb('5.11a')] }),
      session('2026-03-02', { climbs: [climb('V7', { style: 'flash' })] }),
      session('2026-03-03', { mode: 'outdoor', climbs: [climb('V7')] }),
    ];
    expect(dateOf(log, 'straight-up')).toBe('2026-03-02');
    expect(dateOf(log, 'hard-outside')).toBe('2026-03-03');
  });

  it('does not take a limit day back when you later climb harder', () => {
    // Checking against the all-time maximum meant getting better removed an
    // achievement: flash your limit at V7, send V9 a year later, and the
    // flash silently stopped counting.
    const day = [
      session('2026-03-01', { climbs: [climb('V6')] }),
      session('2026-03-02', { climbs: [climb('V7', { style: 'flash' })] }),
    ];
    expect(dateOf(day, 'straight-up')).toBe('2026-03-02');
    expect(dateOf([...day, session('2027-03-02', { climbs: [climb('V9')] })], 'straight-up')).toBe(
      '2026-03-02',
    );
  });

  it('judges the day against the log as it stood that morning', () => {
    // Send V8 and flash V7 in the same session: the flash was at your limit
    // when the session started, and a send later in the same day does not
    // retroactively raise the bar it is judged against.
    const log = [
      session('2026-03-01', { climbs: [climb('V6')] }),
      session('2026-03-02', { climbs: [climb('V8'), climb('V7', { style: 'flash' })] }),
    ];
    expect(dateOf(log, 'straight-up')).toBe('2026-03-02');
  });

  it('does not count a flash below what you had already sent', () => {
    const log = [
      session('2026-03-01', { climbs: [climb('V7')] }),
      session('2026-03-02', { climbs: [climb('V4', { style: 'flash' })] }),
    ];
    expect(dateOf(log, 'straight-up')).toBeNull();
  });

  it('needs both scales for both sides', () => {
    expect(dateOf([session('2026-03-01', { climbs: [climb('V4'), climb('V6')] })], 'both-sides')).toBeNull();
    expect(dateOf([session('2026-03-02', { climbs: [climb('V4'), climb('5.11a')] })], 'both-sides')).toBe('2026-03-02');
  });
});

describe('projects, rock and rest', () => {
  const project = (patch: Partial<Project> = {}): Project =>
    newProject({ name: 'The Prow', scale: 'V', grade: 'V7', ...patch });

  it('counts burns before calling it persistence', () => {
    const p = project({ status: 'sent', sentDate: '2026-04-01' });
    const burn = (date: string, count: number) =>
      session(date, {
        projectAttempts: [{ id: `a${counter++}`, projectId: p.id, outcome: 'worked', count }],
      });
    const few = [burn('2026-03-01', BURNS_FOR_PERSISTENCE - 1)];
    expect(dateOf(few, 'persistence', { projects: [p] })).toBeNull();
    const many = [burn('2026-03-01', BURNS_FOR_PERSISTENCE - 1), burn('2026-03-05', 1)];
    expect(dateOf(many, 'persistence', { projects: [p] })).toBe('2026-04-01');
  });

  it('still counts a project that was sent and later shelved', () => {
    // The app is careful never to flip a sent project back, so the send date
    // outlives the status — and these are exactly the long projects.
    const p = project({ status: 'shelved', sentDate: '2026-04-01' });
    const burn = session('2026-03-01', {
      projectAttempts: [{ id: `a${counter++}`, projectId: p.id, outcome: 'worked', count: BURNS_FOR_PERSISTENCE }],
    });
    expect(dateOf([burn], 'persistence', { projects: [p] })).toBe('2026-04-01');
  });

  it('does not award persistence for a project still open', () => {
    const p = project({ status: 'active' });
    const burn = session('2026-03-01', {
      projectAttempts: [{ id: 'a', projectId: p.id, outcome: 'worked', count: BURNS_FOR_PERSISTENCE + 5 }],
    });
    expect(dateOf([burn], 'persistence', { projects: [p] })).toBeNull();
  });

  it('wants the outdoor days back to back', () => {
    const apart = [
      session('2026-05-01', { mode: 'outdoor' }),
      session('2026-05-03', { mode: 'outdoor' }),
    ];
    expect(dateOf(apart, 'weekend-on-rock')).toBeNull();
    const together = [
      session('2026-05-01', { mode: 'outdoor' }),
      session('2026-05-02', { mode: 'outdoor' }),
    ];
    expect(dateOf(together, 'weekend-on-rock')).toBe('2026-05-02');
  });

  it('needs a longer run for a trip than for a weekend', () => {
    const weekend = Array.from({ length: 2 }, (_, i) => session(addDays('2026-05-01', i), { mode: 'outdoor' }));
    expect(dateOf(weekend, 'weekend-on-rock')).not.toBeNull();
    expect(dateOf(weekend, 'a-trip')).toBeNull();
    const trip = Array.from({ length: TRIP_DAYS }, (_, i) => session(addDays('2026-05-01', i), { mode: 'outdoor' }));
    expect(dateOf(trip, 'a-trip')).toBe(addDays('2026-05-01', TRIP_DAYS - 1));
  });

  it('hears a rest day only after a maximal session, and only the next day', () => {
    const easy = [session('2026-06-01', { rpe: 6, climbs: [climb('V3')] }), rest('2026-06-02')];
    expect(dateOf(easy, 'listened')).toBeNull();
    const late = [session('2026-06-01', { rpe: MAXIMAL_RPE, climbs: [climb('V3')] }), rest('2026-06-04')];
    expect(dateOf(late, 'listened')).toBeNull();
    const heard = [session('2026-06-01', { rpe: MAXIMAL_RPE, climbs: [climb('V3')] }), rest('2026-06-02')];
    expect(dateOf(heard, 'listened')).toBe('2026-06-02');
  });
});

describe('finishing a block', () => {
  const weeks = 8;
  const programWeeks = () => weeks;

  it('wants a session in every week of the program', () => {
    const full = Array.from({ length: weeks }, (_, i) =>
      session(addDays('2026-01-05', i * 7), { programId: 'iron_grip' }),
    );
    expect(dateOf(full, 'block-finished', { programWeeks })).toBe(addDays('2026-01-05', (weeks - 1) * 7));

    const gap = full.filter((_, i) => i !== 3);
    expect(dateOf(gap, 'block-finished', { programWeeks })).toBeNull();
  });

  it('does not count a program picked up again a year later', () => {
    // The sessions are all there; the block is not.
    const half = Array.from({ length: 4 }, (_, i) => session(addDays('2026-01-05', i * 7), { programId: 'iron_grip' }));
    const later = Array.from({ length: 4 }, (_, i) => session(addDays('2027-01-05', i * 7), { programId: 'iron_grip' }));
    expect(dateOf([...half, ...later], 'block-finished', { programWeeks })).toBeNull();
  });

  it('says nothing about a program it has never heard of', () => {
    const full = Array.from({ length: weeks }, (_, i) =>
      session(addDays('2026-01-05', i * 7), { programId: 'unknown' }),
    );
    expect(dateOf(full, 'block-finished', { programWeeks: () => undefined })).toBeNull();
  });
});

describe('reading the list', () => {
  it('puts what you earned first, newest of those at the top', () => {
    const log = [
      session('2026-03-01', { mode: 'outdoor', climbs: [climb('V4', { style: 'onsight' })] }),
      session('2026-03-02', { mode: 'outdoor', climbs: [climb('V4')] }),
    ];
    const sorted = sortAchievements(build(log));
    const earned = sorted.filter((a) => a.date !== null);
    expect(earned.length).toBeGreaterThan(0);
    expect(sorted.slice(0, earned.length).every((a) => a.date !== null)).toBe(true);
    expect(earned.map((a) => a.date)).toEqual([...earned.map((a) => a.date)].sort().reverse());
  });

  it('takes one back when the session that earned it is edited away', () => {
    // Derived, not stored: an achievement is a question asked of the log.
    const outdoor = session('2026-03-02', { mode: 'outdoor', climbs: [climb('V4', { style: 'onsight' })] });
    expect(dateOf([outdoor], 'no-beta-outdoors')).not.toBeNull();
    expect(dateOf([{ ...outdoor, mode: 'indoor' }], 'no-beta-outdoors')).toBeNull();
  });

  it('ignores a session that was never completed', () => {
    const planned = session('2026-03-02', {
      completed: false,
      mode: 'outdoor',
      climbs: [climb('V4', { style: 'onsight' })],
    });
    expect(dateOf([planned], 'no-beta-outdoors')).toBeNull();
  });
});

/**
 * The eleven added after the first fourteen.
 *
 * Held to the same rule as the originals — a shape in the log, never a
 * running total — which the volume guard above enforces for the set as a
 * whole. Two earlier drafts of this batch failed it: "trained on all seven
 * weekdays" and "eight consecutive weeks with a session" were both earned
 * by three hundred identical sessions, because neither asked anything of a
 * session but that it happened.
 */
describe('a day with two sessions in it', () => {
  it('is earned by two training sessions on one date', () => {
    expect(dateOf([session(TODAY), session(TODAY)], 'twice-in-a-day')).toBe(TODAY);
  });

  it('is not earned by one', () => {
    expect(dateOf([session(TODAY)], 'twice-in-a-day')).toBeNull();
  });

  // A session and a rest day on one date is a day with a rest day in it.
  it('does not count a rest day as the second', () => {
    expect(dateOf([session(TODAY), rest(TODAY)], 'twice-in-a-day')).toBeNull();
  });
});

describe('a long session', () => {
  it('is earned at the threshold', () => {
    expect(dateOf([session(TODAY, { durationMin: LONG_SESSION_MIN })], 'long-haul')).toBe(TODAY);
  });

  it('is not earned just below it', () => {
    expect(dateOf([session(TODAY, { durationMin: LONG_SESSION_MIN - 1 })], 'long-haul')).toBeNull();
  });

  it('is not earned by a session that never said how long it was', () => {
    expect(dateOf([session(TODAY, { durationMin: undefined })], 'long-haul')).toBeNull();
  });
});

describe('a week with both ends of the effort scale in it', () => {
  const week = (easy: number, hard: number) => [
    session('2026-09-07', { rpe: easy }),
    session('2026-09-09', { rpe: hard }),
  ];

  it('is earned by an easy session and a maximal one', () => {
    expect(dateOf(week(EASY_RPE, MAXIMAL_RPE), 'both-ends')).toBe('2026-09-09');
  });

  it('is not earned by two medium sessions', () => {
    expect(dateOf(week(6, 7), 'both-ends')).toBeNull();
  });

  // Both ends across two weeks is not a week with range in it.
  it('is not earned across separate weeks', () => {
    expect(
      dateOf([session('2026-09-02', { rpe: EASY_RPE }), session('2026-09-09', { rpe: MAXIMAL_RPE })], 'both-ends'),
    ).toBeNull();
  });

  it('is not earned by a session with no effort logged', () => {
    expect(dateOf(week(undefined as never, MAXIMAL_RPE), 'both-ends')).toBeNull();
  });
});

describe('a session with nothing failed in it', () => {
  const sends = (n: number) => Array.from({ length: n }, () => climb('V4'));

  it('is earned by a full session of sends', () => {
    expect(dateOf([session(TODAY, { climbs: sends(CLEAN_SHEET_CLIMBS) })], 'clean-sheet')).toBe(TODAY);
  });

  it('is not earned by a short one', () => {
    expect(dateOf([session(TODAY, { climbs: sends(CLEAN_SHEET_CLIMBS - 1) })], 'clean-sheet')).toBeNull();
  });

  it('is broken by a single attempt', () => {
    const climbs = [...sends(CLEAN_SHEET_CLIMBS), climb('V6', { result: 'attempt' })];
    expect(dateOf([session(TODAY, { climbs })], 'clean-sheet')).toBeNull();
  });

  // Five of one problem is five climbs, and the session still had nothing
  // fail in it.
  it('counts repeats as the climbs they were', () => {
    const climbs = [climb('V4', { count: CLEAN_SHEET_CLIMBS })];
    expect(dateOf([session(TODAY, { climbs })], 'clean-sheet')).toBe(TODAY);
  });
});

describe('two projects on one day', () => {
  const sent = (date: string) => ({ ...newProject({ name: `p${counter++}`, grade: 'V5', scale: 'V' as const }), sentDate: date });

  it('is earned when two carry the same send date', () => {
    expect(dateOf([session(TODAY)], 'the-double', { projects: [sent(TODAY), sent(TODAY)] })).toBe(TODAY);
  });

  it('is not earned by two sent on different days', () => {
    expect(
      dateOf([session(TODAY)], 'the-double', { projects: [sent(TODAY), sent(addDays(TODAY, -1))] }),
    ).toBeNull();
  });

  it('is not earned by a project still open', () => {
    const open: Project = newProject({ name: 'open', grade: 'V5', scale: 'V' });
    expect(dateOf([session(TODAY)], 'the-double', { projects: [open, open] })).toBeNull();
  });
});

describe('both ladders in one session', () => {
  it('is earned by a boulder and a route sent together', () => {
    expect(dateOf([session(TODAY, { climbs: [climb('V4'), climb('5.11a')] })], 'both-in-a-day')).toBe(TODAY);
  });

  // Both Sides is the whole-log version; this one is about a single day.
  it('is not earned across two sessions', () => {
    expect(
      dateOf([session(TODAY, { climbs: [climb('V4')] }), session(TODAY, { climbs: [climb('5.11a')] })], 'both-in-a-day'),
    ).toBeNull();
  });

  it('is not earned when one of them was only attempted', () => {
    const climbs = [climb('V4'), climb('5.11a', { result: 'attempt' })];
    expect(dateOf([session(TODAY, { climbs })], 'both-in-a-day')).toBeNull();
  });
});

describe('a deload week taken as one', () => {
  const deloadWeek = (rpes: number[]) =>
    rpes.map((rpe, i) => session(addDays('2026-09-07', i), { rpe, deload: true }));

  it('is earned when nothing went above the cap', () => {
    expect(dateOf(deloadWeek([DELOAD_RPE_CAP, DELOAD_RPE_CAP - 2]), 'deload-honoured')).toBe('2026-09-08');
  });

  /**
   * The whole week, not the marked sessions: a deload with one maximal
   * session in it was not a deload, and reading only the marked ones would
   * let that pass.
   */
  it('is broken by one hard session in the same week, marked or not', () => {
    const week = [
      ...deloadWeek([DELOAD_RPE_CAP]),
      session('2026-09-09', { rpe: MAXIMAL_RPE }),
    ];
    expect(dateOf(week, 'deload-honoured')).toBeNull();
  });

  it('is not earned by a week nobody called a deload', () => {
    expect(
      dateOf([session('2026-09-07', { rpe: 4 }), session('2026-09-08', { rpe: 4 })], 'deload-honoured'),
    ).toBeNull();
  });

  it('is not earned by a single easy session', () => {
    expect(dateOf([session('2026-09-07', { rpe: 4, deload: true })], 'deload-honoured')).toBeNull();
  });
});

describe('a limit send after coming back', () => {
  const away = addDays(TODAY, -BREAK_DAYS - 1);

  it('is earned inside the window', () => {
    const log = [
      session(away, { climbs: [climb('V4')] }),
      session(TODAY, { climbs: [climb('V6')] }),
    ];
    expect(dateOf(log, 'the-comeback')).toBe(TODAY);
  });

  it('is not earned long after the return', () => {
    const back = addDays(TODAY, -COMEBACK_DAYS - 1);
    const log = [
      // Harder before the break than on the day back, so the return itself
      // is not a limit send — equalling your best counts as one.
      session(addDays(back, -BREAK_DAYS - 1), { climbs: [climb('V6')] }),
      session(back, { climbs: [climb('V4')] }),
      session(TODAY, { climbs: [climb('V6')] }),
    ];
    expect(dateOf(log, 'the-comeback')).toBeNull();
  });

  it('is not earned without a break to come back from', () => {
    const log = [
      session(addDays(TODAY, -2), { climbs: [climb('V4')] }),
      session(TODAY, { climbs: [climb('V6')] }),
    ];
    expect(dateOf(log, 'the-comeback')).toBeNull();
  });
});

describe('a season outdoors', () => {
  const outside = (date: string) => session(date, { mode: 'outdoor', climbs: [climb('V4')] });

  it('is earned on the third month', () => {
    expect(dateOf([outside('2026-04-01'), outside('2026-05-01'), outside('2026-06-01')], 'months-outside')).toBe(
      '2026-06-01',
    );
  });

  it('is not earned by more days in fewer months', () => {
    const many = ['2026-04-01', '2026-04-08', '2026-05-01', '2026-05-08'].map(outside);
    expect(dateOf(many, 'months-outside')).toBeNull();
  });

  // Three months across two years is two seasons, not one.
  it('does not count months from different years together', () => {
    const split = [outside('2025-11-01'), outside('2025-12-01'), outside('2026-01-01')];
    expect(dateOf(split, 'months-outside')).toBeNull();
    expect(OUTDOOR_MONTHS).toBe(3);
  });

  it('does not count an indoor day', () => {
    const indoors = [outside('2026-04-01'), outside('2026-05-01'), session('2026-06-01')];
    expect(dateOf(indoors, 'months-outside')).toBeNull();
  });
});

describe('a limit send the day after a rest day', () => {
  it('is earned when the rest was the day before', () => {
    const log = [rest(addDays(TODAY, -1)), session(TODAY, { climbs: [climb('V6')] })];
    expect(dateOf(log, 'rested-and-ready')).toBe(TODAY);
  });

  it('is not earned two days after', () => {
    const log = [rest(addDays(TODAY, -2)), session(TODAY, { climbs: [climb('V6')] })];
    expect(dateOf(log, 'rested-and-ready')).toBeNull();
  });

  it('is not earned without a rest day at all', () => {
    expect(dateOf([session(TODAY, { climbs: [climb('V6')] })], 'rested-and-ready')).toBeNull();
  });
});

describe('a grade that beat you first', () => {
  it('is earned when a failed grade is later sent', () => {
    const log = [
      session(addDays(TODAY, -7), { climbs: [climb('V6', { result: 'attempt' })] }),
      session(TODAY, { climbs: [climb('V6')] }),
    ];
    expect(dateOf(log, 'redemption')).toBe(TODAY);
  });

  /**
   * A later session, not the same one: attempting a grade and then sending
   * it in one session is an ordinary working session, and calling that
   * redemption would hand it out for climbing normally.
   */
  it('is not earned inside a single session', () => {
    const climbs = [climb('V6', { result: 'attempt' }), climb('V6')];
    expect(dateOf([session(TODAY, { climbs })], 'redemption')).toBeNull();
  });

  it('is not earned by sending a grade you never failed on', () => {
    const log = [
      session(addDays(TODAY, -7), { climbs: [climb('V4', { result: 'attempt' })] }),
      session(TODAY, { climbs: [climb('V6')] }),
    ];
    expect(dateOf(log, 'redemption')).toBeNull();
  });

  it('keeps the ladders apart', () => {
    const log = [
      session(addDays(TODAY, -7), { climbs: [climb('5.11a', { result: 'attempt' })] }),
      session(TODAY, { climbs: [climb('V6')] }),
    ];
    expect(dateOf(log, 'redemption')).toBeNull();
  });
});
