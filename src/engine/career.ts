/**
 * Career milestones — the ones that outlast the altimeter (PLAN.md M10).
 *
 * ## The problem this exists to fix
 *
 * The altimeter's ladder is finite. Twenty-three named climbs, 380,495 feet,
 * and then it wraps: `laps` increments and "next milestone" restarts at a
 * gym wall. A lap counter is not a milestone — it is the same ten-year-old
 * bar with a small number beside it, and a climber in year three deserves
 * better than being told they are 45 feet from their first gym wall again.
 *
 * So this is a second axis, and it is unbounded by construction:
 *
 * - **Grades** run to V17 and beyond, and every new hardest send is a real
 *   day whether it is your first V2 or your first V12.
 * - **Counters** (sessions, hours, sends, days on rock) use a 1 · 2.5 · 5
 *   ladder per decade, which never runs out and keeps a milestone about as
 *   rare at 5,000 sessions as at 50. A flat every-100 ladder would hand out
 *   thirty of them in year ten and mean nothing.
 * - **Years** keep arriving as long as you keep logging.
 * - **Height** reuses the altimeter's own named climbs, but per lap — so
 *   the second Everest is its own entry rather than a silent wrap.
 *
 * ## Dated, not counted
 *
 * Every milestone carries the date the log actually crossed it, found by
 * walking sessions in order. That is the point: what a climber has after
 * five years is not a number, it is a list of days with dates on them. A
 * career page that only showed totals would get *less* interesting as the
 * totals grew.
 *
 * ## What it never does
 *
 * Pay. Nothing here awards XP, coins or stats. The sessions underneath were
 * paid for when they were logged, and paying again for having accumulated
 * them is the double-count the reward pipeline exists to prevent.
 *
 * It also makes no projection. The altimeter earns its ETA from a measured
 * pace over a known window; "you will hit 500 sessions in about a year"
 * would be that same claim with none of the work behind it.
 */

import type { Session } from '@/db/sessions';
import { LADDER_TOP, MILESTONES, sessionHeight } from './altimeter';
import { daysBetween, fromKey, toKey, today as todayKey } from './dates';
import { DEFAULT_DISPLAY, displayGrade, type GradeDisplay } from './grades';
import type { PersonalRecord } from './derive';

export type CareerCategory = 'grade' | 'sessions' | 'hours' | 'outdoor' | 'sends' | 'years' | 'height';

export const CATEGORY_LABEL: Record<CareerCategory, string> = {
  grade: 'Grades',
  sessions: 'Sessions',
  hours: 'Time',
  outdoor: 'Rock',
  sends: 'Sends',
  years: 'Years',
  height: 'Height',
};

export interface CareerMilestone {
  /** Stable and derived, so the same day always produces the same id. */
  id: string;
  category: CareerCategory;
  label: string;
  detail: string;
  /** The date the log crossed it. */
  date: string;
  /** The counter's value at the crossing, for ordering within a day. */
  value: number;
}

export interface NextMilestone {
  category: CareerCategory;
  label: string;
  current: number;
  target: number;
  /** How far, in the counter's own unit. Never a date — see the module doc. */
  toGo: number;
  /** 0..1 through the gap between the last milestone and this one. */
  fraction: number;
}

export interface CareerState {
  /** Most recent first. */
  achieved: CareerMilestone[];
  next: NextMilestone[];
  /** First and last logged days, and the span between them. */
  first: string | null;
  last: string | null;
  years: number;
}

/**
 * A 1 · 2.5 · 5 ladder per decade, up to and including the first value at
 * or past `cap`.
 *
 * The trailing value is what "next" is read from, so the caller always gets
 * one more rung than has been climbed.
 */
export function counterLadder(first: number, cap: number): number[] {
  const out: number[] = [];
  const steps = [1, 2.5, 5];
  for (let decade = 1; decade <= 1e12; decade *= 10) {
    for (const step of steps) {
      const value = step * decade;
      if (value < first) continue;
      out.push(value);
      if (value > cap) return out;
    }
  }
  return out;
}

interface Counter {
  category: CareerCategory;
  first: number;
  /** e.g. (250) => '250 sessions logged'. */
  label: (n: number) => string;
  detail: (n: number) => string;
}

const COUNTERS: Counter[] = [
  {
    category: 'sessions',
    first: 10,
    label: (n) => `${format(n)} sessions`,
    detail: (n) => `${format(n)} sessions logged. Not all of them were good ones.`,
  },
  {
    category: 'hours',
    first: 25,
    label: (n) => `${format(n)} hours`,
    detail: (n) => `${format(n)} hours on the wall, counted from what you logged.`,
  },
  {
    category: 'sends',
    first: 50,
    label: (n) => `${format(n)} sends`,
    detail: (n) => `${format(n)} climbs topped out or clipped.`,
  },
  {
    category: 'outdoor',
    first: 5,
    label: (n) => `${format(n)} days on rock`,
    detail: (n) => `${format(n)} separate days outdoors.`,
  },
];

/** Within one day: a new grade is the news, a session count is not. */
const RANK: Record<CareerCategory, number> = {
  grade: 0,
  height: 1,
  years: 2,
  outdoor: 3,
  sends: 4,
  sessions: 5,
  hours: 6,
};

export interface CareerInput {
  sessions: Session[];
  /** From `deriveClimberState` — every send that reset a personal best. */
  records: PersonalRecord[];
  display?: GradeDisplay;
  today?: string;
}

export function deriveCareer(input: CareerInput): CareerState {
  const display = input.display ?? DEFAULT_DISPLAY;
  const today = input.today ?? todayKey();

  const completed = input.sessions
    .filter((s) => s.completed)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const first = completed[0]?.date ?? null;
  const last = completed.at(-1)?.date ?? null;

  // One pass, four running counters plus height. Ten years of logs is a
  // list walk, not a nested one (PLAN.md M11).
  const totals: Record<string, number> = { sessions: 0, hours: 0, sends: 0, outdoor: 0 };
  const outdoorDays = new Set<string>();
  const crossings: { category: CareerCategory; value: number; date: string }[] = [];
  const pointer = new Map<CareerCategory, number>();
  const ladders = new Map<CareerCategory, number[]>();

  let feet = 0;
  const heightCrossings: { index: number; lap: number; date: string }[] = [];
  let heightPointer = 0;

  for (const session of completed) {
    totals.sessions = (totals.sessions ?? 0) + 1;
    totals.hours = (totals.hours ?? 0) + (session.durationMin ?? 0) / 60;
    for (const climb of session.climbs) {
      if (climb.result === 'send') totals.sends = (totals.sends ?? 0) + climb.count;
    }
    if (session.mode === 'outdoor' && !outdoorDays.has(session.date)) {
      outdoorDays.add(session.date);
      totals.outdoor = (totals.outdoor ?? 0) + 1;
    }

    for (const counter of COUNTERS) {
      const value = totals[counter.category] ?? 0;
      let rungs = ladders.get(counter.category);
      if (rungs === undefined || (rungs.at(-1) ?? 0) <= value) {
        rungs = counterLadder(counter.first, value);
        ladders.set(counter.category, rungs);
      }
      let at = pointer.get(counter.category) ?? 0;
      while (at < rungs.length && (rungs[at] ?? Infinity) <= value) {
        crossings.push({ category: counter.category, value: rungs[at]!, date: session.date });
        at += 1;
      }
      pointer.set(counter.category, at);
    }

    feet += sessionHeight(session);
    // Named climbs, per lap: the ladder repeating is the point, not a wrap.
    for (;;) {
      const lap = Math.floor(heightPointer / MILESTONES.length);
      const index = heightPointer % MILESTONES.length;
      const at = lap * LADDER_TOP + MILESTONES[index]!.feet;
      if (feet < at) break;
      heightCrossings.push({ index, lap, date: session.date });
      heightPointer += 1;
    }
  }

  const achieved: CareerMilestone[] = [];

  for (const crossing of crossings) {
    const counter = COUNTERS.find((c) => c.category === crossing.category)!;
    achieved.push({
      id: `${crossing.category}-${crossing.value}`,
      category: crossing.category,
      label: counter.label(crossing.value),
      detail: counter.detail(crossing.value),
      date: crossing.date,
      value: crossing.value,
    });
  }

  for (const crossing of heightCrossings) {
    const milestone = MILESTONES[crossing.index]!;
    achieved.push({
      id: `height-${crossing.lap}-${crossing.index}`,
      category: 'height',
      label: crossing.lap === 0 ? milestone.name : `${milestone.name}, again`,
      detail:
        crossing.lap === 0
          ? milestone.note
          : `${milestone.note} For the ${ordinal(crossing.lap + 1)} time.`,
      date: crossing.date,
      value: crossing.lap * LADDER_TOP + milestone.feet,
    });
  }

  for (const record of input.records) {
    const shown = displayGrade(record.scale, record.grade, display);
    achieved.push({
      id: `grade-${record.scale}-${record.grade}`,
      category: 'grade',
      label: `First ${shown}`,
      detail: record.scale === 'V' ? 'A new hardest boulder.' : 'A new hardest route.',
      date: record.date,
      value: 0,
    });
  }

  for (const anniversary of anniversaries(first, today)) {
    achieved.push({
      id: `years-${anniversary.years}`,
      category: 'years',
      label: `${anniversary.years} ${anniversary.years === 1 ? 'year' : 'years'} in`,
      detail:
        anniversary.years === 1
          ? 'A year since the first session in this log.'
          : `${anniversary.years} years since the first session in this log.`,
      date: anniversary.date,
      value: anniversary.years,
    });
  }

  // Newest first; within a day, the day's real news before its counters.
  achieved.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (RANK[a.category] !== RANK[b.category]) return RANK[a.category] - RANK[b.category];
    return b.value - a.value;
  });

  return {
    achieved,
    next: nextMilestones(totals, outdoorDays.size, first, today),
    first,
    last,
    years: first === null ? 0 : daysBetween(first, today) / 365.25,
  };
}

function nextMilestones(
  totals: Record<string, number>,
  outdoor: number,
  first: string | null,
  today: string,
): NextMilestone[] {
  const out: NextMilestone[] = [];

  for (const counter of COUNTERS) {
    const raw = counter.category === 'outdoor' ? outdoor : totals[counter.category] ?? 0;
    const value = counter.category === 'hours' ? Math.floor(raw) : raw;
    const rungs = counterLadder(counter.first, value);
    const target = rungs.at(-1);
    if (target === undefined || target <= value) continue;
    const previous = rungs.length >= 2 ? rungs.at(-2)! : 0;
    out.push({
      category: counter.category,
      label: counter.label(target),
      current: value,
      target,
      toGo: Math.ceil(target - value),
      fraction: clamp((value - previous) / (target - previous)),
    });
  }

  if (first !== null) {
    const done = Math.floor(daysBetween(first, today) / 365.25);
    const next = done + 1;
    const at = addYears(first, next);
    const span = daysBetween(addYears(first, done), at);
    out.push({
      category: 'years',
      label: `${next} ${next === 1 ? 'year' : 'years'} in`,
      current: done,
      target: next,
      toGo: Math.max(0, daysBetween(today, at)),
      fraction: clamp(span === 0 ? 1 : daysBetween(addYears(first, done), today) / span),
    });
  }

  // Closest first: what you are about to reach is the interesting one.
  return out.sort((a, b) => b.fraction - a.fraction);
}

/** Every anniversary of `first` that has already happened. */
function anniversaries(first: string | null, today: string): { years: number; date: string }[] {
  if (first === null) return [];
  const out: { years: number; date: string }[] = [];
  for (let years = 1; years <= 100; years += 1) {
    const date = addYears(first, years);
    if (date > today) break;
    out.push({ years, date });
  }
  return out;
}

function addYears(key: string, years: number): string {
  const date = fromKey(key);
  date.setFullYear(date.getFullYear() + years);
  return toKey(date);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function ordinal(n: number): string {
  const words = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
  return words[n] ?? `${n}th`;
}

/** Whole numbers plain, `2.5k` style above a thousand. */
function format(n: number): string {
  if (n < 1000) return String(n);
  const thousands = n / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
}

/** The most recent milestones, for a summary card. */
export function recentMilestones(state: CareerState, count = 5): CareerMilestone[] {
  return state.achieved.slice(0, count);
}

/** Achieved milestones grouped by the year they happened, most recent first. */
export function byYear(state: CareerState): { year: number; milestones: CareerMilestone[] }[] {
  const groups = new Map<number, CareerMilestone[]>();
  for (const milestone of state.achieved) {
    const year = Number(milestone.date.slice(0, 4));
    const list = groups.get(year);
    if (list === undefined) groups.set(year, [milestone]);
    else list.push(milestone);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, milestones]) => ({ year, milestones }));
}
