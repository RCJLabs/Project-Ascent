/**
 * What a project's attempts add up to, and the climbs worth offering as one.
 *
 * The derived half of project maths, out of `projects.ts` (PLAN.md M344).
 * That module is in the first load because the projects store folds sends
 * in at boot; nothing here is needed for that, and all of it is read by
 * lazy pages and the coach. Recomputed, never stored, as `projects.ts`
 * explains.
 *
 * Pure: records in, readings out. No storage, no React.
 */

import type { Project, AttemptOutcome } from '@/db/projects';
import type { ProjectAttempt, Session } from '@/db/sessions';
import { canonicalGrade, gradeOrdinal, type GradeScale } from './grades';
import { daysBetween, today as todayKey } from './dates';
import { attemptsFor, ordered, type AttemptRecord } from './projects';

/**
 * The high point each outcome implies, as a percentage of the climb.
 *
 * Coarse on purpose: mid-session, chips are faster and more honest than a
 * slider nobody calibrates. A climber who wants precision can still pass an
 * explicit `highPoint` on the attempt and it wins.
 */
export const OUTCOME_HIGH_POINT: Record<AttemptOutcome, number | null> = {
  worked: null,
  'fell-low': 25,
  'fell-mid': 50,
  'fell-high': 75,
  'fell-crux': 90,
  send: 100,
};

export const OUTCOME_LABEL: Record<AttemptOutcome, string> = {
  worked: 'Worked moves',
  'fell-low': 'Fell low',
  'fell-mid': 'Fell mid',
  'fell-high': 'Fell high',
  'fell-crux': 'Fell at the crux',
  send: 'Sent it',
};

/** Ordering used for "was that a better burn?" — never for storage. */

export function highPointOf(attempt: ProjectAttempt): number | null {
  return attempt.highPoint ?? OUTCOME_HIGH_POINT[attempt.outcome];
}

/**
 * Where a burn began, on the same scale (PLAN.md M102).
 *
 * The ground unless the climber said otherwise, which is what every burn
 * logged before `from` existed meant. `worked` is the exception and returns
 * null: rehearsing moves is not a burn from anywhere, and calling it a
 * ground-up attempt would invent a link nobody made.
 */
export function startOf(attempt: ProjectAttempt): number | null {
  if (attempt.outcome === 'worked') return attempt.from ?? null;
  return attempt.from ?? 0;
}

/**
 * The stretch a burn actually covered in one go, or null when it covered
 * none — a rehearsal, or a burn that ended where it started.
 */
export function linkOf(attempt: ProjectAttempt): { from: number; to: number } | null {
  const to = highPointOf(attempt);
  const from = startOf(attempt);
  if (to === null || from === null || to <= from) return null;
  return { from, to };
}

export interface DayHighPoint {
  date: string;
  value: number;
}

/**
 * How many burns one attempt row is (PLAN.md M309).
 *
 * `ProjectAttempt.count` is *"burns of this kind in this session"*, so a row
 * is as many burns as it says and **never fewer than one**. A record that
 * reached storage with a zero, or with no count at all, is still a go
 * somebody took: `count` is typed as required and the type is not the
 * boundary — `projectHistory.test.ts` builds its attempts without one
 * through an `as unknown as Session`, which is the same door an import or a
 * hand-edited backup comes through.
 *
 * It is a function because there were **three** copies of this question and
 * all three answered differently: `summariseProject` summed `count` with the
 * floor, `coach.ts` summed it without — so a zero or a missing count gave a
 * headline of "0 burns" or "NaN burns" — and `projectHistory.costOf` counted
 * the *rows*, so the sample climber's only sent project cost "20 burns" on
 * one card and "7 burns" on the card beside it, from the same eight rows.
 */
export function burnsOf(attempt: { count?: number }): number {
  const count = attempt.count;
  return typeof count === 'number' && count > 1 ? count : 1;
}

/** The same, over a run of them. */
export function burnsIn(attempts: readonly { count?: number }[]): number {
  return attempts.reduce((n, a) => n + burnsOf(a), 0);
}

export interface ProjectSummary {
  attempts: AttemptRecord[];
  /** Total burns, counting repeats. */
  burns: number;
  /** Distinct days the project was touched. */
  days: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Days since the last burn — the staleness pill. Null with no attempts. */
  daysSinceLast: number | null;
  /**
   * Best percentage reached **from the ground**, ignoring `worked`.
   *
   * Ground-up since M102, which is what this number was always taken to
   * mean and was not: a burn started at the midpoint could report 90% on a
   * climb the climber had never linked past halfway.
   */
  highPoint: number | null;
  /**
   * The longest single link, and where it ran (PLAN.md M102).
   *
   * The number that decides a redpoint. A climber with 0-60% from the
   * ground and 55-100% from above has covered the whole climb and linked
   * none of it, and until this the app could not tell that from a send.
   */
  bestLink: { from: number; to: number } | null;
  sendDate: string | null;
  /** Best high point per day, for the progression line. */
  highPointByDay: DayHighPoint[];
}

export function summariseProject(
  projectId: string,
  sessions: Session[],
  today: string = todayKey(),
): ProjectSummary {
  const attempts = attemptsFor(projectId, sessions);
  const byDay = new Map<string, number>();
  let highPoint: number | null = null;
  let bestLink: { from: number; to: number } | null = null;
  let burns = 0;

  for (const attempt of attempts) {
    burns += burnsOf(attempt);
    const link = linkOf(attempt);
    if (link !== null && (bestLink === null || link.to - link.from > bestLink.to - bestLink.from)) {
      bestLink = link;
    }
    const hp = highPointOf(attempt);
    // Ground-up only. A burn that started halfway says nothing about how far
    // this climber can get from the bottom, which is what the number on the
    // card has always been read as (PLAN.md M102).
    if (hp !== null && startOf(attempt) === 0) {
      if (highPoint === null || hp > highPoint) highPoint = hp;
      const day = byDay.get(attempt.date);
      if (day === undefined || hp > day) byDay.set(attempt.date, hp);
    }
  }

  const dates = [...new Set(attempts.map((a) => a.date))];
  const firstDate = dates[0] ?? null;
  const lastDate = dates.at(-1) ?? null;
  const send = attempts.find((a) => a.outcome === 'send');

  return {
    attempts,
    burns,
    days: dates.length,
    firstDate,
    lastDate,
    daysSinceLast: lastDate === null ? null : Math.max(0, daysBetween(lastDate, today)),
    highPoint,
    bestLink,
    sendDate: send?.date ?? null,
    highPointByDay: [...byDay.entries()].map(([date, value]) => ({ date, value })),
  };
}

export interface ProjectSuggestion {
  /** Case-folded name — the stable key for dismissal. */
  key: string;
  name: string;
  grade: string;
  scale: GradeScale;
  /** Sessions in which this climb was logged as an attempt. */
  sessions: number;
  lastDate: string;
}

/**
 * Named climbs you keep failing on, offered as projects.
 *
 * This replaces the prototype's separate auto-detected project list: it
 * does not create anything, it only offers. Two sessions of attempts is the
 * threshold — one bad day is not a project.
 */
export function suggestProjects(
  sessions: Session[],
  projects: Project[],
  dismissed: readonly string[] = [],
  minSessions = 2,
): ProjectSuggestion[] {
  const tracked = new Set(projects.map((p) => p.name.trim().toLowerCase()));
  const skip = new Set(dismissed);
  const seen = new Map<string, { name: string; scale: GradeScale; grade: string; dates: Set<string>; last: string }>();

  for (const session of ordered(sessions)) {
    for (const climb of session.climbs) {
      const name = climb.name?.trim();
      if (!name || climb.result !== 'attempt') continue;
      const key = name.toLowerCase();
      if (tracked.has(key) || skip.has(key)) continue;

      const grade = canonicalGrade(climb.scale, climb.grade);
      if (grade === null) continue;

      const entry = seen.get(key);
      if (!entry) {
        seen.set(key, { name, scale: climb.scale, grade, dates: new Set([session.date]), last: session.date });
        continue;
      }
      entry.name = name;
      entry.dates.add(session.date);
      entry.last = session.date;
      // Keep the hardest grade seen under this name — a climb logged twice
      // at different grades is more likely to be under-graded once.
      if (entry.scale === climb.scale && gradeOrdinal(climb.scale, grade) > gradeOrdinal(entry.scale, entry.grade)) {
        entry.grade = grade;
      }
    }
  }

  return [...seen.entries()]
    .filter(([, e]) => e.dates.size >= minSessions)
    .map(([key, e]) => ({ key, name: e.name, grade: e.grade, scale: e.scale, sessions: e.dates.size, lastDate: e.last }))
    .sort((a, b) => (b.sessions - a.sessions) || (a.lastDate < b.lastDate ? 1 : -1));
}

export function activeProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.status === 'active');
}
