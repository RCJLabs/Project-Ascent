/**
 * The sample climber's sessions, against the plan that placed them
 * (PLAN.md M319).
 *
 * `demoClimber` wrote four hundred sessions that all said `planned: true` and
 * none of which carried a `sessionTypeId`, which is a claim with nothing
 * behind it. Five engines read that field, and on the one fixture every
 * browser check, layout run and screenshot uses, every one of them was on its
 * empty-input path: `blockAdherence` scored nought of twenty-one,
 * `sessionsByType` came back `{}`, `loadRelief` had no median to take,
 * `planVsLog` had one session type to check instead of two, and `fingerGap`
 * could not tell that a finger session had ever happened.
 *
 * Swept over a week of pinned days rather than one, because which sessions
 * have elapsed depends on what day of the week it is — and a fixture assertion
 * that only holds on a Tuesday is one that goes red on a Wednesday.
 */

import { describe, expect, it } from 'vitest';
import { blockAdherence } from './adherence';
import { demoClimber, demoPlan } from './demoClimber';
import { plannedDay } from './plan';
import { deriveClimberState } from './derive';
import { loadRelief, MIN_HISTORY } from './loadRelief';
import { isRestSession } from './rest';
import { getProgram } from '@/content/programs';
import { addDays, dayOfWeek, daysBetween } from './dates';
import { FINGER_GAP_HOURS, loadsFingersDirectly } from './fingerGap';
import type { DayOfWeek } from '@/content/types';

/** A Sunday through the Saturday after it, so every weekday is a `today`. */
const WEEK = [
  '2026-09-20',
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
];

const IRON_GRIP = getProgram('iron_grip')!;

describe('the plan the sample climber runs', () => {
  it('is the four days Iron Grip recommends', () => {
    // Named here rather than read off the program, so a layout that changed
    // shape says so instead of quietly reshaping the demo. This is also what
    // holds the `!` in `demoPlan`: a program with no layout would seed `{}`.
    expect(demoPlan()).toEqual({ 1: 'fp', 3: 'perf', 4: 'fp', 6: 'perf' });
  });

  it('is the one the climber is handed', () => {
    // One derivation, carried out — `SettingsPage` used to work it out again
    // from `layoutsFor`, and the log and the profile were two answers to one
    // question.
    expect(demoClimber('2026-09-22').plan).toEqual(demoPlan());
  });

  it('places only session types the program has', () => {
    for (const typeId of Object.values(demoPlan())) {
      expect(IRON_GRIP.sessionTypes.map((t) => t.id)).toContain(typeId);
    }
  });
});

describe('the sessions inside the running block', () => {
  it('each carry the program and the type that placed them', () => {
    for (const today of WEEK) {
      const made = demoClimber(today);
      const inBlock = made.sessions.filter(
        (s) => s.date >= made.startDate && s.planned,
      );
      expect(inBlock.length, `${today}: nothing placed`).toBeGreaterThan(10);
      for (const session of inBlock) {
        expect(session.programId, `${today} ${session.date}`).toBe(made.programId);
        expect(
          Object.values(made.plan),
          `${today} ${session.date} is a type the plan never places`,
        ).toContain(session.sessionTypeId);
      }
    }
  });

  it('claim planned only on a date the plan placed something', () => {
    // M319 wrote this as `planned === (sessionTypeId !== undefined)`, which
    // called a session made up on a free Tuesday "placed by the plan". M324
    // put the generator through `PreSession`'s own writer and the writer
    // disagreed: `planned` is whether the plan put a session on the date,
    // and a Tuesday it left free was the climber's choice. The field's own
    // words — *"placed by the plan rather than logged by hand"* — side with
    // the writer, so this test moved rather than the code.
    const made = demoClimber('2026-09-22');
    const program = getProgram('iron_grip')!;
    for (const session of made.sessions) {
      const placed =
        session.date >= made.startDate &&
        plannedDay(program, made.startDate, made.plan, session.date).sessionType !== undefined;
      expect(session.planned, session.date).toBe(placed);
    }
  });

  it('leave the log before the block unlinked', () => {
    // A session from before the block carries no program link because nothing
    // placed it — which is a different statement from the one this milestone
    // fixed, and the honest one.
    const made = demoClimber('2026-09-22');
    const before = made.sessions.filter((s) => s.date < made.startDate);
    expect(before.length).toBeGreaterThan(300);
    expect(before.every((s) => s.programId === undefined)).toBe(true);
  });

  it('come out of the generator in date order', () => {
    // The make-up day is appended after the week's plan has been walked, and
    // `landTheSends` reads the *last* burn on a project as the send — so a
    // Tuesday session left at the end of its week would date a send before
    // burns that came after it.
    const placed = demoClimber('2026-09-22').sessions.filter((s) => s.sessionTypeId !== undefined);
    const dates = placed.map((s) => s.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('add the make-up and the route night on days the plan leaves free', () => {
    /**
     * The days rather than the collisions they would cause.
     *
     * A battery mutant that moved the make-up onto the route night's Friday
     * survived a sweep of sixty pinned days without ever producing two
     * sessions on one date — because moving a session re-orders the week and
     * re-orders the week's draws, so the run that would have collided rolls a
     * different set of misses and misses the collision too. A generator that
     * hides its own bug from a data assertion has to be checked on its shape.
     */
    const plan = demoPlan();
    const free = ([0, 1, 2, 3, 4, 5, 6] as const).filter((d) => plan[d] === undefined);
    expect(free).toEqual([0, 2, 5]);
    for (let i = 0; i < 28; i += 1) {
      const today = addDays('2026-09-01', i);
      const made = demoClimber(today);
      for (const session of made.sessions.filter((s) => s.date >= made.startDate)) {
        const day = dayOfWeek(session.date) as DayOfWeek;
        // By type, not by `planned`: a make-up carries its type and is not
        // planned (M324), and it is exactly the session this has to hold to
        // the Tuesday.
        if (session.sessionTypeId !== undefined) {
          // On the day the plan asks for it, or made up on the Tuesday.
          const asked = plan[day] === session.sessionTypeId;
          expect(asked || day === 2, `${today}: ${session.date} ${session.sessionTypeId}`).toBe(true);
        } else {
          // The rest day and the route night, on days nothing was placed.
          expect(free, `${today}: ${session.date}`).toContain(day);
        }
      }
    }
  });

  it('never put two on one date', () => {
    // The route night used to land on the Thursday, which the plan now places
    // a finger session on — and both build their record at slot 0, so the
    // second would overwrite the first on the way into IndexedDB.
    //
    // Four weeks of `today` rather than the one, because a collision is only
    // reached when the days that could collide both happen to fire: the
    // make-up needs a skipped session behind it and the route night comes
    // every other week. A battery mutant that moved the make-up onto the
    // route night's Friday survived a single day's worth of this.
    for (let i = 0; i < 28; i += 1) {
      const today = addDays('2026-09-01', i);
      const ids = demoClimber(today).sessions.map((s) => s.id);
      expect(new Set(ids).size, today).toBe(ids.length);
    }
  });
});

describe('the rule the app teaches, obeyed by the climber it shows', () => {
  it('never puts two finger sessions inside the forty-eight hours', () => {
    /**
     * The make-up day used to stand in for whichever session the week lost
     * first, and it lands on the Tuesday — so a week that kept its Monday
     * and lost its Thursday put a hangboard session on Monday and another on
     * Tuesday. Twenty-four hours, in the sample climber's own log, against
     * the one number eleven of the thirteen programs declare and this one
     * states in prose (PLAN.md M321).
     *
     * It never showed up as a tip, which is why it survived M319: `fingerGaps`
     * wants two breaches before it says anything and this was one. The
     * fixture was wrong in a way the app was never going to complain about.
     */
    for (const today of WEEK) {
      const made = demoClimber(today);
      const dates = made.sessions.filter(loadsFingersDirectly).map((s) => s.date).sort();
      expect(dates.length, `${today}: no finger sessions at all`).toBeGreaterThan(5);
      for (let i = 1; i < dates.length; i += 1) {
        const hours = Math.abs(daysBetween(dates[i - 1]!, dates[i]!)) * 24;
        expect(hours, `${today}: ${dates[i - 1]} then ${dates[i]}`).toBeGreaterThanOrEqual(FINGER_GAP_HOURS);
      }
    }
  });
});

describe('what the engines read off it', () => {
  it('scores most of the block done', () => {
    for (const today of WEEK) {
      const made = demoClimber(today);
      const score = blockAdherence({
        program: IRON_GRIP,
        startDate: made.startDate,
        plan: made.plan,
        sessions: made.sessions,
        away: made.away,
        today,
      })!;
      expect(score.planned, today).toBeGreaterThan(15);
      // Kept, not perfect: a block run to the letter for six weeks is nobody's
      // block, and a card reading 100% is one nobody looks at.
      expect(score.done / score.planned, today).toBeGreaterThan(0.75);
      expect(score.done, today).toBeLessThan(score.planned);
      // Both types, so the skipped-type rule has two rows to compare.
      expect(score.types.map((t) => t.typeId).sort(), today).toEqual(['fp', 'perf']);
    }
  });

  it('counts the route nights as the unplanned sessions they are', () => {
    const made = demoClimber('2026-09-22');
    const score = blockAdherence({
      program: IRON_GRIP,
      startDate: made.startDate,
      plan: made.plan,
      sessions: made.sessions,
      away: made.away,
      today: '2026-09-22',
    })!;
    expect(score.unplanned).toBeGreaterThan(0);
  });

  it('fills sessionsByType', () => {
    const state = deriveClimberState(demoClimber('2026-09-22').sessions, {});
    expect(Object.keys(state.sessionsByType).sort()).toEqual(['fp', 'perf']);
    expect(state.sessionsByType['fp']).toBeGreaterThan(5);
  });

  it('gives loadRelief a session it can name', () => {
    // M318 takes a median load per session type out of the log and offers the
    // cheapest one back. With no `sessionTypeId` on any record there was no
    // history to take a median of, so the one fixture the tip could have been
    // demonstrated on was the one climber it had nothing to say to.
    const made = demoClimber('2026-09-22');
    const ahead = [
      { date: '2026-09-23', typeId: 'perf', name: 'Climbing Session' },
      { date: '2026-09-24', typeId: 'fp', name: 'Finger Protocol + Engine' },
    ];
    const relief = loadRelief({ sessions: made.sessions, ahead, today: '2026-09-22' });
    // Null before this milestone, and for the reason the module withholds a
    // whole answer: `history.length < MIN_HISTORY` for every type, because no
    // record in the log carried a type at all.
    expect(relief).not.toBeNull();
    expect(relief!.planned.map((p) => p.typeId).sort()).toEqual(['fp', 'perf']);
    for (const day of relief!.planned) {
      expect(day.from, day.typeId).toBeGreaterThanOrEqual(MIN_HISTORY);
      expect(day.load, day.typeId).toBeGreaterThan(0);
    }
    // And it gets as far as naming one, which is the whole tip: the heaviest
    // of the two, and what the week comes to without it.
    expect(['fp', 'perf']).toContain(relief!.drop!.session.typeId);
    expect(relief!.drop!.without).toBeLessThan(relief!.asPlanned);
  });
});

describe('what gets logged on each kind of day', () => {
  it('writes climbs on the climbing session and none on the hangboard day', () => {
    const made = demoClimber('2026-09-22');
    const placed = made.sessions.filter((s) => s.sessionTypeId !== undefined);
    const fp = placed.filter((s) => s.sessionTypeId === 'fp');
    const perf = placed.filter((s) => s.sessionTypeId === 'perf');
    expect(fp.length).toBeGreaterThan(0);
    expect(perf.length).toBeGreaterThan(0);
    // "Hangboard protocol plus pulling, pushing, core, and armor work" is not
    // a session eight boulder problems get logged against.
    expect(fp.every((s) => s.climbs.length === 0)).toBe(true);
    expect(perf.every((s) => s.climbs.length > 0)).toBe(true);
    // Nor one anybody drives to a crag for.
    expect(fp.every((s) => s.mode === 'indoor')).toBe(true);
  });

  it('keeps every placed session on a day the plan asks for, bar a make-up', () => {
    const made = demoClimber('2026-09-22');
    const plan = made.plan;
    const placed = made.sessions.filter((s) => s.sessionTypeId !== undefined);
    const offPlan = placed.filter((s) => plan[dayOfWeek(s.date) as DayOfWeek] !== s.sessionTypeId);
    // A session moved is not a session lost: `blockAdherence` scores the week
    // and not the day, and the fixture exercises that rule rather than sitting
    // exactly on the plan's days.
    expect(offPlan.length).toBeGreaterThan(0);
    expect(offPlan.length).toBeLessThan(placed.length / 3);
  });

  it('logs a rest day the plan never placed', () => {
    const made = demoClimber('2026-09-22');
    const rest = made.sessions.filter((s) => isRestSession(s));
    expect(rest.length).toBeGreaterThan(10);
    expect(rest.every((s) => s.sessionTypeId === undefined)).toBe(true);
  });
});
