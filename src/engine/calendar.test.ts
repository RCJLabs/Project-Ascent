import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { getProgram } from '@/content/programs';
import { icsCalendar } from '@/lib/ics';
import { addDays, dayOfWeek, startOfWeek } from './dates';
import {
  DEFAULT_ALARM_MINUTES,
  DEFAULT_DURATION,
  DEFAULT_START,
  ENOUGH,
  lastDayOf,
  scheduleEvents,
  timesAreKnown,
  usualSession,
} from './calendar';

/**
 * The plan as a calendar (PLAN.md M75).
 *
 * Two things have to be true or the file is worse than nothing: the events
 * are at the time the climber actually trains, and exporting twice does not
 * leave two of everything.
 */

const PROGRAM = getProgram('iron_grip')!;
const START = '2026-06-01';
/** Every weekday carries a session, so the plan is not the variable. */
const PLAN = Object.fromEntries(
  PROGRAM.sessionTypes.filter((t) => !t.isRest).slice(0, 5).map((t, i) => [i + 1, t.id]),
);

let n = 0;
const session = (over: Partial<Session> = {}): Session =>
  ({
    id: `2026-01-${String((n += 1) % 28 + 1).padStart(2, '0')}#0`,
    date: '2026-01-05',
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    climbs: [],
    createdAt: '2026-01-05',
    updatedAt: '2026-01-05',
    ...over,
  }) as Session;

/** A session that started at a given local hour and minute. */
const startedAt = (hour: number, minute = 0): string =>
  new Date(2026, 0, 5, hour, minute).toISOString();

describe('when you actually train', () => {
  it('reads the hour off the sessions that had a clock on them', () => {
    const usual = usualSession([
      session({ startedAt: startedAt(18, 0) }),
      session({ startedAt: startedAt(18, 30) }),
      session({ startedAt: startedAt(19, 0) }),
    ]);
    expect(usual.startMinute).toBe(18 * 60 + 30);
    expect(usual.starts).toBe(3);
  });

  it('takes the middle one, so a single late night is not your usual hour', () => {
    const usual = usualSession([
      session({ startedAt: startedAt(17, 0) }),
      session({ startedAt: startedAt(18, 0) }),
      session({ startedAt: startedAt(23, 30) }),
    ]);
    expect(usual.startMinute).toBe(18 * 60);
  });

  it('rounds to the quarter hour rather than claiming 18:07', () => {
    const usual = usualSession([session({ startedAt: startedAt(18, 7) })]);
    expect(usual.startMinute % 15).toBe(0);
  });

  it('ignores a session that was typed in afterwards — it never had a start', () => {
    expect(usualSession([session({ startedAt: undefined })]).starts).toBe(0);
  });

  it('falls back rather than inventing, and says which', () => {
    const usual = usualSession([]);
    expect(usual.startMinute).toBe(DEFAULT_START);
    expect(usual.durationMinutes).toBe(DEFAULT_DURATION);
    expect(timesAreKnown(usual)).toBe(false);
  });

  it('is only known once there is enough of a log to know it from', () => {
    const few = Array.from({ length: ENOUGH - 1 }, () =>
      session({ startedAt: startedAt(18), durationMin: 90 }),
    );
    expect(timesAreKnown(usualSession(few))).toBe(false);
    expect(timesAreKnown(usualSession([...few, session({ startedAt: startedAt(18), durationMin: 90 })]))).toBe(true);
  });

  it('refuses a length the clock does not believe', () => {
    // live.ts will not record an eight-hour session either.
    const usual = usualSession([
      session({ durationMin: 600 }),
      session({ durationMin: 2 }),
      session({ durationMin: 90 }),
    ]);
    expect(usual.durations).toBe(1);
    expect(usual.durationMinutes).toBe(90);
  });

  it('counts the two samples separately, because they come from different sessions', () => {
    // A start time needs a live session; a duration needs a completed one.
    const usual = usualSession([
      session({ startedAt: startedAt(18), completed: false }),
      session({ durationMin: 75 }),
      session({ durationMin: 105 }),
    ]);
    expect(usual.starts).toBe(1);
    expect(usual.durations).toBe(2);
  });
});

describe('the events', () => {
  const usual = { startMinute: 18 * 60, durationMinutes: 90, starts: 9, durations: 9 };
  const build = (over = {}) =>
    scheduleEvents({ program: PROGRAM, startDate: START, plan: PLAN, from: START, usual, ...over });

  it('writes one per planned training day and none for the rest', () => {
    const events = build();
    expect(events.length).toBeGreaterThan(0);
    // Five training days a week for twelve weeks, minus whatever the start
    // date cuts off the first one.
    expect(events.length).toBeLessThanOrEqual(PROGRAM.weeks * 5);
    expect(events.every((e) => e.summary.length > 0)).toBe(true);
  });

  it('stops at the end of the program', () => {
    const last = lastDayOf(PROGRAM, START);
    expect(build().every((e) => e.date <= last)).toBe(true);
    // programWeek clamps rather than returning null past the end, so this is
    // the one thing that stops a twelve-week block filling a year.
    expect(last).toBe(addDays(startOfWeek(START), PROGRAM.weeks * 7 - 1));
  });

  it('starts where it is told and not before', () => {
    const from = addDays(START, 30);
    expect(build({ from }).every((e) => e.date >= from)).toBe(true);
  });

  it('is empty once the program is behind you', () => {
    expect(build({ from: addDays(lastDayOf(PROGRAM, START), 1) })).toEqual([]);
  });

  it('puts every event at the hour the log says', () => {
    for (const event of build()) {
      expect(event.startMinute).toBe(18 * 60);
      expect(event.durationMinutes).toBe(90);
    }
  });

  it('gives each one an alarm with something to display', () => {
    for (const event of build()) {
      expect(event.alarms).toHaveLength(1);
      expect(event.alarms![0]!.minutesBefore).toBe(DEFAULT_ALARM_MINUTES);
      expect(event.alarms![0]!.description.length).toBeGreaterThan(0);
    }
  });

  it('marks a deload week, so the calendar does not read like a normal one', () => {
    const events = build();
    const deload = events.filter((e) => e.summary.includes('Deload'));
    expect(PROGRAM.deloadWeeks?.length).toBeGreaterThan(0);
    expect(deload.length).toBeGreaterThan(0);
  });

  it('says which week it is in the description', () => {
    expect(build()[0]!.description).toMatch(new RegExp(`Week \\d+ of ${PROGRAM.weeks}`));
  });

  it('leaves rest days out unless asked', () => {
    const withRest = Object.fromEntries([
      ...Object.entries(PLAN),
      [0, PROGRAM.sessionTypes.find((t) => t.isRest)?.id],
    ]) as typeof PLAN;
    const rest = PROGRAM.sessionTypes.find((t) => t.isRest);
    if (!rest) return;
    const without = scheduleEvents({ program: PROGRAM, startDate: START, plan: withRest, from: START, usual });
    const including = scheduleEvents({
      program: PROGRAM, startDate: START, plan: withRest, from: START, usual, includeRest: true,
    });
    expect(including.length).toBeGreaterThan(without.length);
  });
});

describe('exporting twice', () => {
  const usual = { startMinute: 1080, durationMinutes: 90, starts: 9, durations: 9 };

  it('gives the same day the same id, so the second export updates the first', () => {
    const once = scheduleEvents({ program: PROGRAM, startDate: START, plan: PLAN, from: START, usual });
    const twice = scheduleEvents({ program: PROGRAM, startDate: START, plan: PLAN, from: START, usual });
    expect(once.map((e) => e.uid)).toEqual(twice.map((e) => e.uid));
  });

  it('gives every day its own id', () => {
    const events = scheduleEvents({ program: PROGRAM, startDate: START, plan: PLAN, from: START, usual });
    expect(new Set(events.map((e) => e.uid)).size).toBe(events.length);
  });

  it('keeps the id when the plan moves the session', () => {
    // The same date of the same program is the same event whatever is on it,
    // so changing the plan rewrites the day rather than adding a second one.
    const moved = { ...PLAN, [dayOfWeek(START)]: PROGRAM.sessionTypes[1]!.id };
    const before = scheduleEvents({ program: PROGRAM, startDate: START, plan: PLAN, from: START, usual });
    const after = scheduleEvents({ program: PROGRAM, startDate: START, plan: moved, from: START, usual });
    const day = before.find((e) => e.date === START);
    if (day) expect(after.find((e) => e.date === START)?.uid).toBe(day.uid);
  });
});

describe('the whole file', () => {
  it('is legal iCalendar for a real program', () => {
    const usual = usualSession([
      session({ startedAt: startedAt(18), durationMin: 95 }),
      session({ startedAt: startedAt(18, 30), durationMin: 90 }),
      session({ startedAt: startedAt(19), durationMin: 85 }),
    ]);
    const events = scheduleEvents({ program: PROGRAM, startDate: START, plan: PLAN, from: START, usual });
    const file = icsCalendar(events, { name: `Project Ascent · ${PROGRAM.name}` });

    for (const line of file.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect((file.match(/BEGIN:VEVENT/g) ?? []).length).toBe(events.length);
    expect((file.match(/BEGIN:VALARM/g) ?? []).length).toBe(events.length);
    // The emoji on every session type is what makes the octet folding matter.
    expect(file).toMatch(/SUMMARY:/);
  });
});
